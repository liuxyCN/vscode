/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { applyBrowserHtmlPatch } from '../../electron-browser/browserHtmlSourcePatches.js';

suite('browserHtmlSourcePatches - text patches', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function wrap(body: string): string {
		return `<!DOCTYPE html><html><head><title>t</title></head><body>${body}</body></html>`;
	}

	function queryElement(source: string, selector: string): Element {
		const doc = new DOMParser().parseFromString(source, 'text/html');
		const el = doc.querySelector(selector);
		assert.ok(el, `expected to find ${selector} in patched source`);
		return el;
	}

	test('text edit writes the element own text, not a structural child', () => {
		const source = wrap('<ul><li id="outer">Item<ul><li id="inner">sub</li></ul></li></ul>');

		const result = applyBrowserHtmlPatch(source, { domPath: 'path-0-0', kind: 'text', text: 'Renamed' }, document);

		assert.strictEqual(result.ok, true);
		assert.strictEqual(queryElement(result.source, '#inner').textContent, 'sub');
		assert.strictEqual(queryElement(result.source, '#outer').firstChild?.nodeValue, 'Renamed');
	});

	test('text edit fails when only a structural child carries text', () => {
		const source = wrap('<ul><li id="outer"><ul><li id="inner">sub</li></ul></li></ul>');

		const result = applyBrowserHtmlPatch(source, { domPath: 'path-0-0', kind: 'text', text: 'Renamed' }, document);

		assert.strictEqual(result.ok, false);
		assert.ok(result.error);
		assert.strictEqual(queryElement(result.source, '#inner').textContent, 'sub');
	});

	test('text edit on a container applies when the container has a single text node', () => {
		const source = wrap('<div id="box">Old copy</div>');

		const result = applyBrowserHtmlPatch(source, { domPath: 'path-0', kind: 'container', text: 'New copy' }, document);

		assert.strictEqual(result.ok, true);
		assert.strictEqual(queryElement(result.source, '#box').textContent, 'New copy');
	});

	test('text edit on a container with ambiguous text reports an error instead of dropping it', () => {
		const source = wrap('<div id="box"><span>A</span><span>B</span></div>');

		const result = applyBrowserHtmlPatch(source, { domPath: 'path-0', kind: 'container', text: 'AC' }, document);

		assert.strictEqual(result.ok, false);
		assert.ok(result.error);
		assert.strictEqual(queryElement(result.source, '#box').textContent, 'AB');
	});
});
