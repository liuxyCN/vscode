/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	inferBrowserHtmlEditKind,
	parseOuterHtmlRootElement,
	readEditableElementText,
} from '../../electron-browser/browserHtmlEditTypes.js';

suite('browserHtmlEditTypes - text extraction', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parseOuterHtmlRootElement finds td wrapped by DOMParser table scaffolding', () => {
		const root = parseOuterHtmlRootElement('<td>Line1<br>Line2</td>');
		assert.ok(root);
		assert.strictEqual(root!.tagName.toLowerCase(), 'td');
		assert.strictEqual(readEditableElementText(root!), 'Line1\nLine2');
	});

	test('parseOuterHtmlRootElement finds th wrapped by DOMParser table scaffolding', () => {
		const root = parseOuterHtmlRootElement('<th>Header<br>Sub</th>');
		assert.ok(root);
		assert.strictEqual(root!.tagName.toLowerCase(), 'th');
		assert.strictEqual(readEditableElementText(root!), 'Header\nSub');
	});

	test('parseOuterHtmlRootElement preserves div with br line breaks', () => {
		const root = parseOuterHtmlRootElement('<div>Alpha<br>Beta</div>');
		assert.ok(root);
		assert.strictEqual(root!.tagName.toLowerCase(), 'div');
		assert.strictEqual(readEditableElementText(root!), 'Alpha\nBeta');
	});

	test('inferBrowserHtmlEditKind treats div with br-only inline markup as text', () => {
		const kind = inferBrowserHtmlEditKind({
			outerHTML: '<div>Alpha<br>Beta</div>',
			computedStyle: '',
			attributes: {},
			bounds: { x: 0, y: 0, width: 0, height: 0 },
		});
		assert.strictEqual(kind, 'text');
	});
});
