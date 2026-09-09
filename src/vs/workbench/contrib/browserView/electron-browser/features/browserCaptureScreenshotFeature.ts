/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { BrowserViewCommandId, IBrowserViewCaptureScreenshotOptions, IBrowserViewRect } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { SerializableObjectWithBuffers } from '../../../../services/extensions/common/proxyIdentifier.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { BrowserEditor } from '../browserEditor.js';
import { browserViewLabel } from '../../common/browserViewI18n.js';

/**
 * Arguments for {@link BrowserViewCommandId.CaptureScreenshot}.
 */
export interface IBrowserCaptureScreenshotCommandArgs {
	/** Browser page ID. Defaults to the active browser editor when omitted. */
	readonly pageId?: string;
	readonly quality?: number;
	readonly format?: 'jpeg' | 'png';
	readonly fullPage?: boolean;
	readonly pageRect?: IBrowserViewRect;
	readonly awaitNextPaint?: boolean;
}

/**
 * Result of {@link BrowserViewCommandId.CaptureScreenshot}.
 */
export interface IBrowserCaptureScreenshotCommandResult {
	readonly mimeType: 'image/jpeg' | 'image/png';
	readonly data: Uint8Array;
}

interface IBrowserCaptureScreenshotCommandResultDto {
	readonly mimeType: 'image/jpeg' | 'image/png';
	readonly data: VSBuffer;
}

async function resolveBrowserViewModel(accessor: ServicesAccessor, pageId?: string): Promise<IBrowserViewModel | undefined> {
	if (pageId) {
		const input = accessor.get(IBrowserViewWorkbenchService).getKnownBrowserViews().get(pageId);
		return input?.resolve();
	}

	const browserEditor = accessor.get(IEditorService).activeEditorPane;
	if (browserEditor instanceof BrowserEditor) {
		return browserEditor.model;
	}

	return undefined;
}

CommandsRegistry.registerCommand({
	id: BrowserViewCommandId.CaptureScreenshot,
	handler: async (accessor, args?: IBrowserCaptureScreenshotCommandArgs): Promise<SerializableObjectWithBuffers<IBrowserCaptureScreenshotCommandResultDto>> => {
		const model = await resolveBrowserViewModel(accessor, args?.pageId);
		if (!model) {
			throw new Error(args?.pageId
				? browserViewLabel('browserPageNotFound', 'No browser page found with ID {0}', args.pageId)
				: browserViewLabel('captureScreenshotNoActiveBrowser', 'No active Integrated Browser editor'));
		}

		const format = args?.format ?? 'jpeg';
		const options: IBrowserViewCaptureScreenshotOptions = {
			quality: args?.quality,
			format,
			fullPage: args?.fullPage,
			pageRect: args?.pageRect,
			awaitNextPaint: args?.awaitNextPaint,
		};

		const screenshot = await model.captureScreenshot(options);
		return new SerializableObjectWithBuffers({
			mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
			data: screenshot,
		});
	},
	metadata: {
		description: 'Capture a screenshot of an Integrated Browser page and return the image data.',
		args: [{
			name: 'options',
			schema: {
				type: 'object',
				description: 'Screenshot options.',
				properties: {
					pageId: { type: 'string', description: 'Browser page ID. Defaults to the active browser editor.' },
					quality: { type: 'number', description: 'JPEG quality from 0-100. Defaults to 80.' },
					format: { type: 'string', enum: ['jpeg', 'png'], description: 'Image format. Defaults to jpeg.' },
					fullPage: { type: 'boolean', description: 'Capture the full scrollable document.' },
					pageRect: {
						type: 'object',
						description: 'Region to capture in page coordinates.',
						properties: {
							x: { type: 'number' },
							y: { type: 'number' },
							width: { type: 'number' },
							height: { type: 'number' },
						},
						required: ['x', 'y', 'width', 'height'],
					},
					awaitNextPaint: { type: 'boolean', description: 'Wait for the next compositor frame before capturing.' },
				},
			},
		}],
		returns: 'An object with mimeType (image/jpeg or image/png) and data (Uint8Array).',
	}
});
