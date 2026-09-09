/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { resolveDefaultPdfUri, resolveFileSourceUri, suggestPdfFileName } from '../../common/browserExportPdf.js';
import { browserViewActionTitle, browserViewLabel } from '../../common/browserViewI18n.js';
import {
	BrowserEditor,
	BROWSER_EDITOR_ACTIVE,
	BrowserActionCategory,
	BrowserActionGroup,
	CONTEXT_BROWSER_HAS_ERROR,
	CONTEXT_BROWSER_HAS_URL,
} from '../browserEditor.js';

class ExportPdfAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ExportPdf;

	constructor() {
		super({
			id: ExportPdfAction.ID,
			title: browserViewActionTitle('exportPdf', 'Export PDF'),
			category: BrowserActionCategory,
			icon: Codicon.filePdf,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Tools,
				order: 1.55,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(browserEditor instanceof BrowserEditor)) {
			return;
		}

		const model = browserEditor.model;
		if (!model) {
			return;
		}

		const dialogService = accessor.get(IDialogService);
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);

		const abortIfLoading = () => {
			if (!model.loading) {
				return false;
			}
			notificationService.warn(
				browserViewLabel('exportPdfPageLoading', 'Wait for the page to finish loading.')
			);
			return true;
		};

		if (abortIfLoading()) {
			return;
		}

		browserEditor.ensureBrowserFocus();

		const input = browserEditor.input instanceof BrowserEditorInput ? browserEditor.input : undefined;
		const fileSource = resolveFileSourceUri(model, input);

		let targetUri: URI | undefined;

		if (fileSource) {
			targetUri = resolveDefaultPdfUri(fileSource);
			// The default path is not picked through a save dialog, so confirm the overwrite here.
			const exists = await fileService.exists(targetUri);
			const { confirmed } = await dialogService.confirm({
				type: exists ? 'warning' : 'question',
				message: exists
					? browserViewLabel('exportPdfConfirmOverwriteMessage', 'Replace existing PDF?')
					: browserViewLabel('exportPdfConfirmMessage', 'Save as PDF?'),
				detail: exists
					? browserViewLabel('exportPdfConfirmOverwriteDetail', '{0} already exists and will be replaced.', targetUri.fsPath)
					: browserViewLabel('exportPdfConfirmDetail', 'Save to {0}', targetUri.fsPath),
				primaryButton: exists
					? browserViewLabel('exportPdfConfirmReplace', 'Replace')
					: browserViewLabel('exportPdfConfirmSave', 'Save'),
			});
			if (!confirmed) {
				return;
			}
		} else {
			const defaultUri = joinPath(
				await fileDialogService.defaultFilePath(),
				suggestPdfFileName(model.title, model.url),
			);
			targetUri = await fileDialogService.showSaveDialog({
				title: browserViewLabel('exportPdf', 'Export PDF'),
				availableFileSystems: [Schemas.file],
				defaultUri,
				filters: [{ name: 'PDF', extensions: ['pdf'] }],
			});
			if (!targetUri) {
				return;
			}
			if (!targetUri.path.toLowerCase().endsWith('.pdf')) {
				targetUri = URI.file(`${targetUri.fsPath}.pdf`);
			}
		}

		// The page can start navigating while the dialog is open, so the guard has to be re-checked.
		if (abortIfLoading()) {
			return;
		}

		try {
			const pdf = await model.exportToPdf();
			await fileService.writeFile(targetUri, pdf);
			notificationService.info(browserViewLabel('exportPdfSuccess', 'PDF saved successfully'));
		} catch (error) {
			notificationService.error(
				browserViewLabel('exportPdfFailed', 'Failed to export PDF: {0}', getErrorMessage(error))
			);
		}
	}
}

registerAction2(ExportPdfAction);
