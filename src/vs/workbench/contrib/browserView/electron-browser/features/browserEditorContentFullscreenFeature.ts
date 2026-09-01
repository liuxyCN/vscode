/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IHostService } from '../../../../services/host/browser/host.js';
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

export const CONTEXT_BROWSER_CONTENT_FULLSCREEN_ACTIVE = new RawContextKey<boolean>('browserContentFullscreenActive', false, localize('browser.contentFullscreenActive', "Whether browser content fullscreen is active"));

class BrowserEditorContentFullscreenContribution extends BrowserEditorContribution {
	private readonly _contentFullscreenActiveContext: IContextKey<boolean>;
	private _didEnterWindowFullscreen = false;
	private _windowFullscreenSyncGeneration = 0;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super(editor);
		this._contentFullscreenActiveContext = CONTEXT_BROWSER_CONTENT_FULLSCREEN_ACTIVE.bindTo(contextKeyService);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._contentFullscreenActiveContext.set(model.isContentFullscreenActive);
		store.add(model.onDidChangeContentFullscreenActive(active => {
			this._contentFullscreenActiveContext.set(active);
			void this._syncWindowFullscreen(active);
		}));
	}

	override onModelDetached(): void {
		this._windowFullscreenSyncGeneration++;
		void this._restoreWindowFullscreen();
		this._contentFullscreenActiveContext.reset();
	}

	private async _syncWindowFullscreen(active: boolean): Promise<void> {
		const generation = ++this._windowFullscreenSyncGeneration;

		if (active) {
			const wasFullscreen = await this.nativeHostService.isFullScreen({ targetWindowId: this.editor.window.vscodeWindowId });
			if (generation !== this._windowFullscreenSyncGeneration) {
				return;
			}
			if (!wasFullscreen) {
				await this.hostService.toggleFullScreen(this.editor.window);
				if (generation !== this._windowFullscreenSyncGeneration) {
					// Enter was cancelled while toggling — undo the window fullscreen we just added.
					const isFullscreen = await this.nativeHostService.isFullScreen({ targetWindowId: this.editor.window.vscodeWindowId });
					if (isFullscreen) {
						await this.hostService.toggleFullScreen(this.editor.window);
					}
					return;
				}
				this._didEnterWindowFullscreen = true;
			}
			return;
		}

		await this._restoreWindowFullscreen(generation);
	}

	private async _restoreWindowFullscreen(expectedGeneration?: number): Promise<void> {
		if (!this._didEnterWindowFullscreen) {
			return;
		}

		this._didEnterWindowFullscreen = false;
		const isFullscreen = await this.nativeHostService.isFullScreen({ targetWindowId: this.editor.window.vscodeWindowId });
		if (expectedGeneration !== undefined && expectedGeneration !== this._windowFullscreenSyncGeneration) {
			return;
		}
		if (isFullscreen) {
			await this.hostService.toggleFullScreen(this.editor.window);
		}
	}
}

BrowserEditor.registerContribution(BrowserEditorContentFullscreenContribution);

class ToggleContentFullscreenAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ToggleContentFullscreen;

	constructor() {
		super({
			id: ToggleContentFullscreenAction.ID,
			title: browserViewActionTitle('contentFullscreen', 'Fullscreen'),
			category: BrowserActionCategory,
			icon: Codicon.screenFull,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_CONTENT_FULLSCREEN_ACTIVE.key, true),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Tools,
				order: 1.6,
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

		const entering = !model.isContentFullscreenActive;
		if (entering) {
			// Ensure layout bounds exist before the main process expands the view.
			browserEditor.layout();
		}

		await model.toggleContentFullscreen(entering);
	}
}

class ExitContentFullscreenAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.ExitContentFullscreen,
			title: browserViewActionTitle('exitContentFullscreen', 'Exit Fullscreen'),
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.equals(CONTEXT_BROWSER_CONTENT_FULLSCREEN_ACTIVE.key, true)),
			keybinding: {
				when: ContextKeyExpr.equals(CONTEXT_BROWSER_CONTENT_FULLSCREEN_ACTIVE.key, true),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			void browserEditor.model?.toggleContentFullscreen(false);
		}
	}
}

registerAction2(ToggleContentFullscreenAction);
registerAction2(ExitContentFullscreenAction);
