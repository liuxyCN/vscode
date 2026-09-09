/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { resolveDefaultPdfUri, resolveFileSourceUri, suggestPdfFileName } from '../../common/browserExportPdf.js';

suite('browserExportPdf', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolveDefaultPdfUri strips .dc.html', () => {
		const source = URI.file('/workspace/neontractor-intro.dc.html');
		assert.strictEqual(resolveDefaultPdfUri(source).fsPath, '/workspace/neontractor-intro.pdf');
	});

	test('resolveDefaultPdfUri strips .html', () => {
		const source = URI.file('/workspace/neontractor.html');
		assert.strictEqual(resolveDefaultPdfUri(source).fsPath, '/workspace/neontractor.pdf');
	});

	test('resolveFileSourceUri prefers associatedResource', () => {
		const associated = URI.file('/workspace/page.dc.html');
		const model = { url: 'https://example.com', associatedResource: associated } as IBrowserViewModel;
		assert.strictEqual(resolveFileSourceUri(model, undefined)?.toString(), associated.toString());
	});

	test('resolveFileSourceUri uses file url', () => {
		const model = { url: 'file:///workspace/page.html', associatedResource: undefined } as IBrowserViewModel;
		assert.strictEqual(resolveFileSourceUri(model, undefined)?.fsPath, '/workspace/page.html');
	});

	test('suggestPdfFileName uses url path when title is default', () => {
		const name = suggestPdfFileName('Browser', 'https://example.com/docs/report.html');
		assert.strictEqual(name, 'report.pdf');
	});
});
