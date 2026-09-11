/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { BrowserViewCommandId, isAssociatedHtmlResource } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	BROWSER_EDITOR_ACTIVE,
	BrowserActionCategory,
	CONTEXT_BROWSER_HAS_ERROR,
	CONTEXT_BROWSER_HAS_URL,
	BrowserActionGroup,
} from '../browserEditor.js';
import { browserViewActionTitle, browserViewLabel } from '../../common/browserViewI18n.js';

export const CONTEXT_BROWSER_EDIT_MODE_ACTIVE = new RawContextKey<boolean>('browserEditModeActive', false, browserViewLabel('editModeActive', 'Whether in-page edit mode is active'));

export { isAssociatedHtmlResource };

export const CONTEXT_BROWSER_HTML_EDIT_AVAILABLE = new RawContextKey<boolean>(
	'browserHtmlEditAvailable',
	false,
	browserViewLabel('htmlEditAvailable', 'Whether HTML visual edit mode is available for the current browser tab'),
);

export const CONTEXT_BROWSER_HTML_LAYOUT_MODE_ACTIVE = new RawContextKey<boolean>(
	'browserHtmlLayoutModeActive',
	false,
	browserViewLabel('htmlLayoutModeActive', 'Whether in-page grid layout mode is active'),
);

class BrowserEditorEditModeContribution extends BrowserEditorContribution {
	private readonly _editModeActiveContext: IContextKey<boolean>;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editor);
		this._editModeActiveContext = CONTEXT_BROWSER_EDIT_MODE_ACTIVE.bindTo(contextKeyService);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._editModeActiveContext.set(model.isEditModeActive);
		store.add(model.onDidChangeEditModeActive(active => {
			this._editModeActiveContext.set(active);
		}));
		store.add(model.onDidChangeLoadingState(state => {
			if (state.loading && model.isEditModeActive) {
				void model.toggleEditMode(false);
			}
		}));
	}

	override onModelDetached(): void {
		this._editModeActiveContext.reset();
	}
}

class BrowserEditorHtmlLayoutModeContribution extends BrowserEditorContribution {
	private readonly _layoutModeActiveContext: IContextKey<boolean>;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editor);
		this._layoutModeActiveContext = CONTEXT_BROWSER_HTML_LAYOUT_MODE_ACTIVE.bindTo(contextKeyService);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		store.add(model.onDidChangeEditModeActive(active => {
			if (active && this.isLayoutModeActive()) {
				void this.setLayoutModeActive(false);
			}
		}));
		store.add(model.onDidChangeLoadingState(state => {
			if (state.loading && this.isLayoutModeActive()) {
				void this.setLayoutModeActive(false);
			}
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
		await this.setLayoutModeActive(!this.isLayoutModeActive());
	}
}

BrowserEditor.registerContribution(BrowserEditorEditModeContribution);
BrowserEditor.registerContribution(BrowserEditorHtmlLayoutModeContribution);

class ToggleEditModeAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ToggleEditMode;

	constructor() {
		super({
			id: ToggleEditModeAction.ID,
			title: browserViewActionTitle('editPage', 'Edit Page'),
			category: BrowserActionCategory,
			icon: Codicon.edit,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), CONTEXT_BROWSER_HTML_EDIT_AVAILABLE),
			toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_EDIT_MODE_ACTIVE.key, true),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Tools,
				order: 1.5,
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50,
				primary: KeyMod.Alt | KeyCode.KeyE,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(browserEditor instanceof BrowserEditor)) {
			return;
		}
		browserEditor.ensureBrowserFocus();
		const model = browserEditor.model;
		if (!model) {
			return;
		}
		const enabling = !model.isEditModeActive;
		if (enabling) {
			await browserEditor.getContribution(BrowserEditorHtmlLayoutModeContribution)?.setLayoutModeActive(false);
		}
		await model.toggleEditMode(enabling);
	}
}

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

class StopEditModeAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.stopEditMode',
			title: browserViewActionTitle('stopEditMode', 'Stop Edit Mode'),
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.equals(CONTEXT_BROWSER_EDIT_MODE_ACTIVE.key, true)),
			keybinding: {
				when: ContextKeyExpr.equals(CONTEXT_BROWSER_EDIT_MODE_ACTIVE.key, true),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			void browserEditor.model?.toggleEditMode(false);
		}
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
			void browserEditor.getContribution(BrowserEditorHtmlLayoutModeContribution)?.setLayoutModeActive(false);
		}
	}
}

registerAction2(ToggleEditModeAction);
registerAction2(ToggleHtmlLayoutModeAction);
registerAction2(StopEditModeAction);
registerAction2(StopHtmlLayoutModeAction);
