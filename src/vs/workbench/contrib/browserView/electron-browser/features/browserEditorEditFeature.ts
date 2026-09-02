/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
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
import { browserViewActionTitle } from '../../common/browserViewI18n.js';

export const CONTEXT_BROWSER_EDIT_MODE_ACTIVE = new RawContextKey<boolean>('browserEditModeActive', false, localize('browser.editModeActive', "Whether in-page edit mode is active"));

export { isAssociatedHtmlResource };

export const CONTEXT_BROWSER_HTML_EDIT_AVAILABLE = new RawContextKey<boolean>(
	'browserHtmlEditAvailable',
	false,
	localize('browser.htmlEditAvailable', "Whether HTML visual edit mode is available for the current browser tab"),
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
	}

	override onModelDetached(): void {
		this._editModeActiveContext.reset();
	}
}

BrowserEditor.registerContribution(BrowserEditorEditModeContribution);

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
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.ensureBrowserFocus();
			const model = browserEditor.model;
			if (model) {
				await model.toggleEditMode(!model.isEditModeActive);
			}
		}
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

registerAction2(ToggleEditModeAction);
registerAction2(StopEditModeAction);
