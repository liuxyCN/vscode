/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWebview, WebviewOptions } from '../../browser/webview.js';
import { shouldAllowWebviewFileDrop } from '../../browser/webviewWindowDragMonitor.js';

suite('WebviewWindowDragMonitor', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createWebview(options: WebviewOptions): IWebview {
		return { options } as IWebview;
	}

	test('allows drop into webview when Shift is held', () => {
		assert.strictEqual(shouldAllowWebviewFileDrop({ shiftKey: true }, createWebview({})), true);
	});

	test('allows drop into webview when acceptsFileDrops is enabled', () => {
		assert.strictEqual(shouldAllowWebviewFileDrop({ shiftKey: false }, createWebview({ acceptsFileDrops: true })), true);
	});

	test('blocks drop into webview by default', () => {
		assert.strictEqual(shouldAllowWebviewFileDrop({ shiftKey: false }, createWebview({})), false);
	});

	test('blocks drop into webview when webview is undefined', () => {
		assert.strictEqual(shouldAllowWebviewFileDrop({ shiftKey: false }, undefined), false);
	});
});
