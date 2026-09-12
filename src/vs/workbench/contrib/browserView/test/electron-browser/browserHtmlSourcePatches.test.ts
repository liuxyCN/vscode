/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { applyBrowserHtmlPatch, normalizeLayoutReplaceOuterHtml } from '../../electron-browser/browserHtmlSourcePatches.js';

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

	test('normalizeLayoutReplaceOuterHtml preserves table colgroup column widths', () => {
		const outerHtml = '<table style="table-layout: fixed"><colgroup><col style="width: 120px"><col style="width: 280px"></colgroup><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
		const normalized = normalizeLayoutReplaceOuterHtml(outerHtml, document);
		assert.ok(normalized.includes('colgroup'));
		assert.ok(/width:\s*120px/i.test(normalized));
		assert.ok(/width:\s*280px/i.test(normalized));
	});

	test('replaceOuterHtml patch preserves table column widths in source', () => {
		const source = wrap('<table id="grid"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
		const replacement = '<table id="grid" style="table-layout: fixed"><colgroup><col style="width: 120px"><col style="width: 280px"></colgroup><thead><tr><th style="width: 120px">H1</th><th style="width: 280px">H2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';

		const result = applyBrowserHtmlPatch(source, { domPath: 'path-0', replaceOuterHtml: replacement }, document);

		assert.strictEqual(result.ok, true);
		const table = queryElement(result.source, '#grid');
		assert.ok(table.querySelector('colgroup'));
		assert.ok(/width:\s*120px/i.test(table.outerHTML));
		assert.ok(/width:\s*280px/i.test(table.outerHTML));
		const headerCells = table.querySelectorAll('thead th');
		assert.strictEqual(headerCells.length, 2);
		assert.match(headerCells[0]!.getAttribute('style') ?? '', /width:\s*120px/i);
		assert.match(headerCells[1]!.getAttribute('style') ?? '', /width:\s*280px/i);
	});
});
