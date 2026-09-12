/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { BrowserViewCommandId, isAssociatedHtmlResource } from '../../../../../platform/browserView/common/browserView.js';
import { SaveReason, SaveSourceRegistry } from '../../../../common/editor.js';
import { ITextFileService, ITextFileEditorModel, TextFileResolveReason } from '../../../../services/textfile/common/textfiles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	BROWSER_EDITOR_ACTIVE,
	BrowserActionCategory,
	BrowserActionGroup,
	CONTEXT_BROWSER_HAS_ERROR,
	CONTEXT_BROWSER_HAS_URL,
} from '../browserEditor.js';
import { browserViewActionTitle, browserViewLabel } from '../../common/browserViewI18n.js';
import { CONTEXT_BROWSER_HTML_EDIT_AVAILABLE } from './browserEditorEditFeature.js';
import { applyBrowserHtmlPatch, IBrowserHtmlPatch, normalizeLayoutReplaceOuterHtml, readDataPropsFromSource, readXDcDecodedTemplate } from '../browserHtmlSourcePatches.js';
import { dcComponentNameFromResource, parseHtmlEditDomPath } from '../browserHtmlEditTypes.js';
import { IBrowserAutoReloadService } from './browserAutoReloadFeatures.js';

export const CONTEXT_BROWSER_HTML_LAYOUT_MODE_ACTIVE = new RawContextKey<boolean>(
	'browserHtmlLayoutModeActive',
	false,
	browserViewLabel('htmlLayoutModeActive', 'Whether in-page grid layout mode is active'),
);

export class BrowserEditorHtmlLayoutModeContribution extends BrowserEditorContribution {
	private static readonly SAVE_SOURCE = SaveSourceRegistry.registerSource(
		'browserHtmlLayout.source',
		browserViewLabel('htmlLayoutSaveSource', 'Browser HTML Layout'),
	);

	private readonly _layoutModeActiveContext: IContextKey<boolean>;
	private _associatedResource: URI | undefined;
	private _saveInFlight = false;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IBrowserAutoReloadService private readonly browserAutoReloadService: IBrowserAutoReloadService,
	) {
		super(editor);
		this._layoutModeActiveContext = CONTEXT_BROWSER_HTML_LAYOUT_MODE_ACTIVE.bindTo(contextKeyService);
	}

	override prerenderInput(input: BrowserEditorInput): void {
		this._associatedResource = input.associatedResource;
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._associatedResource = model.associatedResource;
		store.add(model.onDidChangeEditModeActive(active => {
			if (active && this.isLayoutModeActive()) {
				void this.cancelLayoutMode();
			}
		}));
		store.add(model.onDidChangeLoadingState(state => {
			if (state.loading && this.isLayoutModeActive()) {
				void this.setLayoutModeActive(false);
			}
		}));
		store.add(model.onDidRequestHtmlLayoutSave(() => {
			void this.saveLayout();
		}));
		store.add(model.onDidRequestHtmlLayoutCancel(() => {
			void this.cancelLayoutMode();
		}));
	}

	override onModelDetached(): void {
		this._layoutModeActiveContext.reset();
	}

	isLayoutModeActive(): boolean {
		return this._layoutModeActiveContext.get() ?? false;
	}

	async setLayoutModeActive(active: boolean): Promise<void> {
		const model = this.editor.model;
		if (!model) {
			this._layoutModeActiveContext.set(false);
			return;
		}
		if (active === this.isLayoutModeActive()) {
			return;
		}
		if (active && model.isEditModeActive) {
			await model.toggleEditMode(false);
		}
		await model.setHtmlLayoutMode(active);
		this._layoutModeActiveContext.set(active);
	}

	async toggleLayoutMode(): Promise<void> {
		if (this.isLayoutModeActive()) {
			await this.cancelLayoutMode();
			return;
		}
		await this.setLayoutModeActive(true);
	}

	async cancelLayoutMode(): Promise<void> {
		const model = this.editor.model;
		if (!model || !this.isLayoutModeActive()) {
			return;
		}
		const hadChanges = await model.hasHtmlLayoutChanges();
		await this.setLayoutModeActive(false);
		if (hadChanges) {
			await model.reload();
		}
	}

	async saveLayout(): Promise<void> {
		if (this._saveInFlight || !this.isLayoutModeActive()) {
			return;
		}
		const model = this.editor.model;
		const resource = this._associatedResource;
		if (!model || !resource || !isAssociatedHtmlResource(resource)) {
			this.notificationService.error(browserViewLabel('htmlLayoutSaveUnavailable', 'Layout save is only available for associated HTML files.'));
			return;
		}

		this._saveInFlight = true;
		try {
			const payload = await model.getHtmlLayoutSavePayload();
			if (!payload) {
				this.notificationService.error(browserViewLabel('htmlLayoutSaveNoChanges', 'No layout changes to save.'));
				return;
			}

			let source = await this._readAssociatedSource(resource);
			const fileComponentName = dcComponentNameFromResource(resource);
			const componentName = fileComponentName ?? await model.getDcRootName() ?? undefined;
			if (!componentName) {
				this.notificationService.error(browserViewLabel('htmlEditDcTemplateMissing', 'Could not find <x-dc> template in the source file.'));
				return;
			}

			const patch: IBrowserHtmlPatch = {
				domPath: payload.domPath,
				replaceOuterHtml: normalizeLayoutReplaceOuterHtml(payload.replaceOuterHtml, document),
			};

			let patchOptions: { dcAnnotatedTemplate?: string; dcComponentName?: string } | undefined;
			const parsed = parseHtmlEditDomPath(payload.domPath);
			if (parsed.kind === 'tpl') {
				const annotated = await model.getDcAnnotatedTemplate(parsed.componentName ?? componentName);
				if (!annotated) {
					this.notificationService.error(browserViewLabel('htmlEditElementNotFound', 'Selected element was not found in the HTML source.'));
					return;
				}
				patchOptions = { dcAnnotatedTemplate: annotated, dcComponentName: fileComponentName ?? componentName };
			}

			const result = applyBrowserHtmlPatch(source, patch, document, patchOptions);
			if (!result.ok) {
				this.notificationService.error(result.error ?? browserViewLabel('htmlLayoutSaveFailed', 'Could not save layout changes.'));
				return;
			}

			source = result.source;
			await this._writeSource(source);

			// Revert live DOM mutations before DC hot update — layout editing moves
			// nodes directly, which desyncs React's tree and causes DOMException on swap.
			await model.restoreHtmlLayoutDefaults();
			await this.setLayoutModeActive(false);

			if (result.dcTemplateHtml && result.dcComponentName) {
				await model.updateDcTemplate(result.dcComponentName, result.dcTemplateHtml);
			} else {
				const dcTemplateHtml = readXDcDecodedTemplate(source, document);
				if (dcTemplateHtml) {
					await model.updateDcTemplate(componentName, dcTemplateHtml);
				}
			}
			const props = readDataPropsFromSource(source, document);
			if (props) {
				await model.updateDcProps(componentName, props);
			}
		} catch {
			this.notificationService.error(browserViewLabel('htmlLayoutSaveFailed', 'Could not save layout changes.'));
		} finally {
			this._saveInFlight = false;
		}
	}

	private async _readAssociatedSource(resource: URI): Promise<string> {
		return (await this.fileService.readFile(resource)).value.toString();
	}

	private async _writeSource(source: string): Promise<void> {
		const resource = this._associatedResource;
		if (!resource) {
			return;
		}
		this.browserAutoReloadService.suppressAutoReloadForResource(resource);

		const textFileModel = this.textFileService.files.get(resource)
			?? await this.textFileService.files.resolve(resource, { languageId: 'html', reason: TextFileResolveReason.OTHER });

		const currentContent = textFileModel.textEditorModel?.getValue();
		if (currentContent !== source) {
			this._applySourceToTextFileModel(textFileModel, source);
			const saved = await textFileModel.save({
				force: true,
				ignoreModifiedSince: true,
				source: BrowserEditorHtmlLayoutModeContribution.SAVE_SOURCE,
				reason: SaveReason.EXPLICIT,
			});
			if (!saved) {
				throw new Error('Failed to save HTML source');
			}
		}
	}

	private _applySourceToTextFileModel(textFileModel: ITextFileEditorModel, source: string): void {
		if (!textFileModel.isResolved()) {
			return;
		}
		const textModel = textFileModel.textEditorModel;
		if (!textModel || textModel.getValue() === source) {
			return;
		}
		textModel.pushEditOperations(
			null,
			[EditOperation.replaceMove(textModel.getFullModelRange(), source)],
			() => null,
			undefined,
			EditSources.browserHtmlEdit(),
		);
	}

}

BrowserEditor.registerContribution(BrowserEditorHtmlLayoutModeContribution);

class ToggleHtmlLayoutModeAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ToggleHtmlLayoutMode;

	constructor() {
		super({
			id: ToggleHtmlLayoutModeAction.ID,
			title: browserViewActionTitle('htmlEditLayoutMode', 'Layout mode'),
			category: BrowserActionCategory,
			icon: Codicon.table,
			f1: true,
			precondition: ContextKeyExpr.and(
				BROWSER_EDITOR_ACTIVE,
				CONTEXT_BROWSER_HAS_URL,
				CONTEXT_BROWSER_HAS_ERROR.negate(),
				CONTEXT_BROWSER_HTML_EDIT_AVAILABLE,
			),
			toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_HTML_LAYOUT_MODE_ACTIVE.key, true),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Tools,
				order: 1.45,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(browserEditor instanceof BrowserEditor)) {
			return;
		}
		browserEditor.ensureBrowserFocus();
		const contribution = browserEditor.getContribution(BrowserEditorHtmlLayoutModeContribution);
		await contribution?.toggleLayoutMode();
	}
}

class StopHtmlLayoutModeAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.stopHtmlLayoutMode',
			title: browserViewActionTitle('stopHtmlLayoutMode', 'Stop Layout Mode'),
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.equals(CONTEXT_BROWSER_HTML_LAYOUT_MODE_ACTIVE.key, true)),
			keybinding: {
				when: ContextKeyExpr.equals(CONTEXT_BROWSER_HTML_LAYOUT_MODE_ACTIVE.key, true),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			void browserEditor.getContribution(BrowserEditorHtmlLayoutModeContribution)?.cancelLayoutMode();
		}
	}
}

registerAction2(ToggleHtmlLayoutModeAction);
registerAction2(StopHtmlLayoutModeAction);
