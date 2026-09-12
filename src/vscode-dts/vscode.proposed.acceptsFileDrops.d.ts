/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// NeonTractor fork: opt-in file drop into webview without Shift

	export interface WebviewPanelOptions {
		/**
		 * When `true`, file drag-and-drop is delivered to this webview without requiring Shift.
		 * Defaults to `false`.
		 */
		readonly acceptsFileDrops?: boolean;
	}

	export namespace window {
		export function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider, options?: {
			readonly webviewOptions?: {
				/**
				 * When `true`, file drag-and-drop is delivered to this webview without requiring Shift.
				 * Defaults to `false`.
				 */
				readonly acceptsFileDrops?: boolean;
			};
		}): Disposable;
	}
}
