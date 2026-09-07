/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { browserViewLabel } from '../common/browserViewI18n.js';
import {
	applyEditableElementText,
	BrowserHtmlEditKind,
	BrowserHtmlEditStyleKey,
	BROWSER_HTML_EDIT_STYLE_PROPS,
	cssNameForStyleKey,
	elementHasEditableTextMarkup,
	formatBorderShorthand,
	formatBoxShorthand,
	IBrowserHtmlPatch,
	IBoxShorthandSides,
	IHtmlEditDomPath,
	isSimpleBackgroundColorValue,
	parseBorderShorthand,
	parseBoxShorthand,
	parseHtmlEditDomPath,
	parseInlineStyleAttribute,
	readEditableElementText,
	sanitizeInlineStyleValue,
} from './browserHtmlEditTypes.js';

export type { IBrowserHtmlPatch } from './browserHtmlEditTypes.js';

export interface IBrowserHtmlPatchOptions {
	readonly dcAnnotatedTemplate?: string;
	readonly dcComponentName?: string;
}

const RAW_UNWRAP: Record<string, string> = {
	'sc-raw-select': 'select',
	'sc-raw-table': 'table',
	'sc-raw-tbody': 'tbody',
	'sc-raw-thead': 'thead',
	'sc-raw-tfoot': 'tfoot',
	'sc-raw-tr': 'tr',
	'sc-raw-td': 'td',
	'sc-raw-th': 'th',
	'sc-raw-caption': 'caption',
};

const SC_CAMEL_ATTR_RE = /(\s)sc-camel-([a-z0-9-]+)(\s*=)/g;

function decodeCase(html: string): string {
	let out = html;
	for (const [alias, real] of Object.entries(RAW_UNWRAP)) {
		out = out.replace(new RegExp(`(</?)${alias}(?=[\\s>])`, 'gi'), `$1${real}`);
	}
	out = out.replace(/<sc-helmet(\s|>)/gi, '<helmet$1');
	out = out.replace(/<\/sc-helmet\s*>/gi, '</helmet>');
	out = out.replace(
		SC_CAMEL_ATTR_RE,
		(_, sp: string, name: string, eq: string) => sp + name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()) + eq,
	);
	return out;
}

function stripDataDcTplAttributes(root: ParentNode): void {
	// eslint-disable-next-line no-restricted-syntax -- strip runtime tpl ids from parsed HTML fragments
	for (const el of root.querySelectorAll('[data-dc-tpl]')) {
		el.removeAttribute('data-dc-tpl');
	}
}

function parseTemplateFragment(source: string, rootDocument: Document): Document | undefined {
	const trustedSource = toTrustedHtml(source) as string;
	try {
		const doc = rootDocument.implementation.createHTMLDocument('');
		doc.body.innerHTML = trustedSource;
		return doc;
	} catch {
		return undefined;
	}
}

function serializeTemplateFragment(doc: Document): string {
	return decodeCase(doc.body.innerHTML);
}

interface IFindElementByTplIdResult {
	readonly element: Element | null;
	readonly duplicate?: boolean;
}

function findElementByTplId(doc: ParentNode, tplId: number): IFindElementByTplIdResult {
	// eslint-disable-next-line no-restricted-syntax -- locate annotated template nodes by stable tpl id
	const matches = doc.querySelectorAll(`[data-dc-tpl="${tplId}"]`);
	if (matches.length === 0) {
		return { element: null };
	}
	if (matches.length > 1) {
		return { element: null, duplicate: true };
	}
	return { element: matches[0]! };
}

export interface IAnnotatedTemplateElementResult {
	readonly element: Element | null;
	readonly duplicate?: boolean;
}

export function findAnnotatedTemplateElement(annotatedHtml: string, tplId: number, rootDocument: Document): IAnnotatedTemplateElementResult {
	const doc = parseTemplateFragment(annotatedHtml, rootDocument);
	if (!doc) {
		return { element: null };
	}
	return findElementByTplId(doc, tplId);
}

export function serializeDcSourceElement(element: Element): string {
	const clone = element.cloneNode(true) as Element;
	stripDataDcTplAttributes(clone);
	return decodeCase(clone.outerHTML);
}

export function readDcSourceElementAttributes(element: Element): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const { name, value } of [...element.attributes]) {
		if (name === 'data-dc-tpl') {
			continue;
		}
		attributes[name] = value;
	}
	return attributes;
}

function updateXDcTemplate(source: string, templateHtml: string, rootDocument: Document): string | undefined {
	const doc = parseSource(source, rootDocument);
	// eslint-disable-next-line no-restricted-syntax -- read decoded DC template container from parsed source
	const xdc = doc?.querySelector('x-dc');
	if (!doc || !xdc) {
		return undefined;
	}
	xdc.innerHTML = toTrustedHtml(templateHtml) as string;
	return serializeSource(doc, source);
}

export interface IBrowserHtmlPatchResult {
	readonly ok: boolean;
	readonly source: string;
	readonly error?: string;
	readonly dcTemplateHtml?: string;
	readonly dcComponentName?: string;
}

const ttPolicy = createTrustedTypesPolicy('browserHtmlSourcePatches', { createHTML: value => value });

function toTrustedHtml(html: string): string | TrustedHTML {
	return ttPolicy?.createHTML(html) ?? html;
}

function firstSourceToken(source: string): string {
	let rest = source.trimStart();
	while (rest.startsWith('<!--') || rest.startsWith('<?')) {
		const close = rest.startsWith('<!--') ? '-->' : '?>';
		const end = rest.indexOf(close);
		if (end === -1) {
			return rest;
		}
		rest = rest.slice(end + close.length).trimStart();
	}
	return rest;
}

function isFullHtmlDocument(source: string): boolean {
	const normalized = firstSourceToken(source).slice(0, 32).toLowerCase();
	return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
}

function isDomParserErrorDocument(doc: Document): boolean {
	for (const child of doc.body.children) {
		if (child.nodeName.toLowerCase() === 'parsererror') {
			return true;
		}
	}
	return false;
}

function parseSource(source: string, rootDocument: Document): Document | undefined {
	const trustedSource = toTrustedHtml(source) as string;
	const DOMParserCtor = globalThis.DOMParser;
	if (DOMParserCtor) {
		try {
			const doc = new DOMParserCtor().parseFromString(trustedSource, 'text/html');
			if (doc.body && !isDomParserErrorDocument(doc)) {
				return doc;
			}
		} catch {
			// fall through
		}
	}

	try {
		const doc = rootDocument.implementation.createHTMLDocument('');
		if (isFullHtmlDocument(source)) {
			const htmlMatch = source.match(/<html[\s\S]*$/i);
			doc.documentElement.innerHTML = toTrustedHtml(htmlMatch?.[0] ?? source) as string;
		} else {
			doc.body.innerHTML = trustedSource;
		}
		return doc;
	} catch {
		return undefined;
	}
}

function serializeSource(doc: Document, originalSource: string): string {
	if (!isFullHtmlDocument(originalSource)) {
		return doc.body.innerHTML;
	}
	const doctype = doc.doctype ? '<!DOCTYPE html>\n' : '';
	return `${doctype}${doc.documentElement.outerHTML}`;
}

function resolveElementByDomPath(doc: Document, domPath: string): IFindElementByTplIdResult {
	const parsed = parseHtmlEditDomPath(domPath);
	if (parsed.kind === 'body') {
		return { element: doc.body };
	}
	if (parsed.kind === 'tpl' && parsed.tplId !== undefined) {
		return findElementByTplId(doc, parsed.tplId);
	}
	if (parsed.kind !== 'path' || !parsed.pathIndices?.length) {
		return { element: null };
	}
	let node: Element = doc.body;
	for (const index of parsed.pathIndices) {
		const child = node.children.item(index);
		if (!child) {
			return { element: null };
		}
		node = child;
	}
	return { element: node };
}

function resolveDcComponentName(parsed: IHtmlEditDomPath, options?: IBrowserHtmlPatchOptions): string | undefined {
	return parsed.componentName ?? options?.dcComponentName;
}

function applyDcTplPatch(
	source: string,
	patch: IBrowserHtmlPatch,
	parsed: IHtmlEditDomPath,
	rootDocument: Document,
	options?: IBrowserHtmlPatchOptions,
): IBrowserHtmlPatchResult {
	const annotated = options?.dcAnnotatedTemplate;
	const tplId = parsed.tplId;
	const componentName = resolveDcComponentName(parsed, options);
	if (!annotated || tplId === undefined) {
		return { ok: false, source, error: browserViewLabel('htmlEditElementNotFound', 'Selected element was not found in the HTML source.') };
	}
	if (componentName && options?.dcComponentName && componentName !== options.dcComponentName) {
		return {
			ok: false,
			source,
			error: browserViewLabel('htmlEditDcNestedComponent', 'Edit nested components from their own .dc.html file.'),
		};
	}

	const annDoc = parseTemplateFragment(annotated, rootDocument);
	if (!annDoc?.body) {
		return { ok: false, source, error: browserViewLabel('htmlEditParseFailed', 'Could not parse HTML source.') };
	}

	const tplResult = findElementByTplId(annDoc, tplId);
	if (tplResult.duplicate) {
		return { ok: false, source, error: browserViewLabel('htmlEditDuplicateTplId', 'Multiple elements share the same template id in the HTML source.') };
	}
	const el = tplResult.element;
	if (!el) {
		return { ok: false, source, error: browserViewLabel('htmlEditElementNotFound', 'Selected element was not found in the HTML source.') };
	}

	if (patch.removeElement) {
		if (!el.parentElement || el.parentElement === annDoc.body && annDoc.body.children.length <= 1) {
			return { ok: false, source, error: browserViewLabel('htmlEditRemoveLast', 'Cannot remove the last rendered element in the document.') };
		}
		el.remove();
	} else {
		const contentError = applyContentPatch(el, patch.kind, patch);
		if (contentError) {
			return { ...contentError, source };
		}
		if (patch.styles) {
			setInlineStyles(el as HTMLElement, patch.styles);
		}
	}

	stripDataDcTplAttributes(annDoc);
	const decodedTemplate = serializeTemplateFragment(annDoc);
	const updated = updateXDcTemplate(source, decodedTemplate, rootDocument);
	if (!updated) {
		return { ok: false, source, error: browserViewLabel('htmlEditDcTemplateMissing', 'Could not find <x-dc> template in the source file.') };
	}
	return { ok: true, source: updated, dcTemplateHtml: decodedTemplate, dcComponentName: componentName ?? options?.dcComponentName };
}

function hasElementChildren(el: Element): boolean {
	return Array.from(el.children).some(child => child.nodeType === Node.ELEMENT_NODE);
}

function findSoleMeaningfulTextNode(el: Element): Text | null {
	let found: Text | null = null;
	let ambiguous = false;
	const visit = (node: Node): void => {
		if (ambiguous) {
			return;
		}
		for (const child of node.childNodes) {
			if (ambiguous) {
				return;
			}
			if (child.nodeType === Node.TEXT_NODE) {
				const text = child as Text;
				const parentTag = (child.parentElement?.tagName ?? '').toLowerCase();
				const isInert = parentTag === 'script' || parentTag === 'style' || parentTag === 'template';
				if (!isInert && (text.nodeValue ?? '').trim() !== '') {
					if (found) {
						ambiguous = true;
						return;
					}
					found = text;
				}
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				visit(child);
			}
		}
	};
	visit(el);
	return ambiguous ? null : found;
}

function setTextContent(el: Element, value: string): IBrowserHtmlPatchResult | undefined {
	if (elementHasEditableTextMarkup(el)) {
		if (value === readEditableElementText(el)) {
			return undefined;
		}
		applyEditableElementText(el, value);
		return undefined;
	}
	if (!hasElementChildren(el)) {
		el.textContent = value;
		return undefined;
	}
	const currentText = (el.textContent ?? '').trim();
	if (value === currentText) {
		return undefined;
	}
	const soleText = findSoleMeaningfulTextNode(el);
	if (!soleText) {
		return {
			ok: false,
			source: '',
			error: browserViewLabel('htmlEditNestedMarkup', 'This element contains nested markup. Edit its text in the HTML source instead.'),
		};
	}
	soleText.nodeValue = value;
	return undefined;
}

const BORDER_WIDTH_STYLE_KEYS: BrowserHtmlEditStyleKey[] = [
	'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
];

const MARGIN_SIDE_STYLE_KEYS: BrowserHtmlEditStyleKey[] = [
	'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
];

const PADDING_SIDE_STYLE_KEYS: BrowserHtmlEditStyleKey[] = [
	'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
];

interface IBoxShorthandGroup {
	readonly shorthand: string;
	readonly shorthandKey: BrowserHtmlEditStyleKey;
	readonly sideKeys: BrowserHtmlEditStyleKey[];
	readonly sideCss: [string, string, string, string];
}

const MARGIN_BOX_GROUP: IBoxShorthandGroup = {
	shorthand: 'margin',
	shorthandKey: 'margin',
	sideKeys: MARGIN_SIDE_STYLE_KEYS,
	sideCss: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
};

const PADDING_BOX_GROUP: IBoxShorthandGroup = {
	shorthand: 'padding',
	shorthandKey: 'padding',
	sideKeys: PADDING_SIDE_STYLE_KEYS,
	sideCss: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
};

const BORDER_RADIUS_CORNER_CSS = [
	'border-top-left-radius',
	'border-top-right-radius',
	'border-bottom-right-radius',
	'border-bottom-left-radius',
] as const;

const BORDER_INLINE_LONGHANDS = [
	'border-width', 'border-style', 'border-color',
	'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
	'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
	'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
] as const;

function isBorderRelatedStyleKey(key: BrowserHtmlEditStyleKey): boolean {
	return key === 'border' || key === 'borderStyle' || key === 'borderColor' || BORDER_WIDTH_STYLE_KEYS.includes(key);
}

function isMarginRelatedStyleKey(key: BrowserHtmlEditStyleKey): boolean {
	return key === 'margin' || MARGIN_SIDE_STYLE_KEYS.includes(key);
}

function isPaddingRelatedStyleKey(key: BrowserHtmlEditStyleKey): boolean {
	return key === 'padding' || PADDING_SIDE_STYLE_KEYS.includes(key);
}

function serializeInlineStyleMap(styles: Record<string, string>): string {
	return Object.entries(styles)
		.map(([name, value]) => [name, sanitizeInlineStyleValue(value)] as const)
		.filter(([, value]) => value !== '')
		.map(([name, value]) => `${name}: ${value}`)
		.join('; ');
}

function removeBorderInlineLonghands(styles: Record<string, string>): void {
	delete styles['border'];
	for (const name of BORDER_INLINE_LONGHANDS) {
		delete styles[name];
	}
}

function getUniformBorderWidthFromPatch(
	patch: Partial<Record<BrowserHtmlEditStyleKey, string>>,
): string | undefined | null {
	const present = BORDER_WIDTH_STYLE_KEYS.filter(key => Object.prototype.hasOwnProperty.call(patch, key));
	if (present.length === 0) {
		return undefined;
	}
	const values = present.map(key => (patch[key] ?? '').trim());
	const first = values[0]!;
	if (values.every(value => value === first)) {
		return first;
	}
	return null;
}

function tryCollapseBorderLonghandsToShorthand(styles: Record<string, string>): void {
	const width = styles['border-width'];
	const style = styles['border-style'];
	const color = styles['border-color'];
	const hasSideLonghands = BORDER_INLINE_LONGHANDS.some(name => {
		if (name === 'border-width' || name === 'border-style' || name === 'border-color') {
			return false;
		}
		return styles[name] !== undefined;
	});
	if (!width || !style || hasSideLonghands) {
		return;
	}
	removeBorderInlineLonghands(styles);
	styles['border'] = formatBorderShorthand({ width, style, color });
}

function applyBorderLonghandPatch(
	styles: Record<string, string>,
	patch: Partial<Record<BrowserHtmlEditStyleKey, string>>,
): void {
	const uniformWidth = getUniformBorderWidthFromPatch(patch);
	if (uniformWidth !== undefined) {
		for (const key of BORDER_WIDTH_STYLE_KEYS) {
			delete styles[cssNameForStyleKey(key)];
		}
		delete styles['border-width'];
		if (uniformWidth) {
			styles['border-width'] = uniformWidth;
		}
	} else if (uniformWidth === null) {
		delete styles['border-width'];
		for (const key of BORDER_WIDTH_STYLE_KEYS) {
			if (!Object.prototype.hasOwnProperty.call(patch, key)) {
				continue;
			}
			const cssName = cssNameForStyleKey(key);
			const value = patch[key]?.trim() ?? '';
			if (value) {
				styles[cssName] = value;
			} else {
				delete styles[cssName];
			}
		}
	}

	if (Object.prototype.hasOwnProperty.call(patch, 'borderStyle')) {
		const value = patch.borderStyle?.trim() ?? '';
		for (const name of ['border-style', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']) {
			delete styles[name];
		}
		if (value) {
			styles['border-style'] = value;
		}
	}

	if (Object.prototype.hasOwnProperty.call(patch, 'borderColor')) {
		const value = patch.borderColor?.trim() ?? '';
		for (const name of ['border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']) {
			delete styles[name];
		}
		if (value) {
			styles['border-color'] = value;
		}
	}

	tryCollapseBorderLonghandsToShorthand(styles);
}

function applyBorderPatchToMap(
	styles: Record<string, string>,
	patch: Partial<Record<BrowserHtmlEditStyleKey, string>>,
): void {
	if (Object.prototype.hasOwnProperty.call(patch, 'border')) {
		removeBorderInlineLonghands(styles);
		const value = patch.border?.trim() ?? '';
		if (value) {
			styles['border'] = value;
		}
		return;
	}

	const existingShorthand = styles['border']?.trim();
	const uniformWidth = getUniformBorderWidthFromPatch(patch);

	if (existingShorthand && uniformWidth !== null) {
		const parts = parseBorderShorthand(existingShorthand);
		if (uniformWidth !== undefined) {
			if (uniformWidth) {
				parts.width = uniformWidth;
			} else {
				delete parts.width;
			}
		}
		if (Object.prototype.hasOwnProperty.call(patch, 'borderStyle')) {
			const style = patch.borderStyle?.trim() ?? '';
			if (style) {
				parts.style = style;
			} else {
				delete parts.style;
			}
		}
		if (Object.prototype.hasOwnProperty.call(patch, 'borderColor')) {
			const color = patch.borderColor?.trim() ?? '';
			if (color) {
				parts.color = color;
			} else {
				delete parts.color;
			}
		}
		removeBorderInlineLonghands(styles);
		const formatted = formatBorderShorthand(parts);
		if (formatted) {
			styles['border'] = formatted;
		}
		return;
	}

	if (existingShorthand && uniformWidth === null) {
		const parts = parseBorderShorthand(existingShorthand);
		removeBorderInlineLonghands(styles);
		if (parts.style) {
			styles['border-style'] = parts.style;
		}
		if (parts.color) {
			styles['border-color'] = parts.color;
		}
		for (const key of BORDER_WIDTH_STYLE_KEYS) {
			const cssName = cssNameForStyleKey(key);
			if (Object.prototype.hasOwnProperty.call(patch, key)) {
				const value = patch[key]?.trim() ?? '';
				if (value) {
					styles[cssName] = value;
				}
			} else if (parts.width) {
				styles[cssName] = parts.width;
			}
		}
		if (Object.prototype.hasOwnProperty.call(patch, 'borderStyle')) {
			const value = patch.borderStyle?.trim() ?? '';
			delete styles['border-style'];
			if (value) {
				styles['border-style'] = value;
			}
		}
		if (Object.prototype.hasOwnProperty.call(patch, 'borderColor')) {
			const value = patch.borderColor?.trim() ?? '';
			delete styles['border-color'];
			if (value) {
				styles['border-color'] = value;
			}
		}
		return;
	}

	applyBorderLonghandPatch(styles, patch);
}

function removeBoxInlineLonghands(styles: Record<string, string>, group: IBoxShorthandGroup): void {
	delete styles[group.shorthand];
	for (const name of group.sideCss) {
		delete styles[name];
	}
}

function getResolvedBoxSides(
	styles: Record<string, string>,
	group: IBoxShorthandGroup,
): IBoxShorthandSides | undefined {
	const shorthand = styles[group.shorthand]?.trim();
	if (shorthand) {
		return parseBoxShorthand(shorthand);
	}
	const [topCss, rightCss, bottomCss, leftCss] = group.sideCss;
	const top = styles[topCss];
	const right = styles[rightCss];
	const bottom = styles[bottomCss];
	const left = styles[leftCss];
	if (top === undefined && right === undefined && bottom === undefined && left === undefined) {
		return undefined;
	}
	return {
		top: top ?? '',
		right: right ?? top ?? '',
		bottom: bottom ?? top ?? '',
		left: left ?? right ?? top ?? '',
	};
}

function applyBoxSidesToStyles(
	styles: Record<string, string>,
	group: IBoxShorthandGroup,
	sides: IBoxShorthandSides,
): void {
	const values = [sides.top, sides.right, sides.bottom, sides.left];
	if (values.every(value => !value.trim())) {
		return;
	}
	if (values.some(value => !value.trim())) {
		const [topCss, rightCss, bottomCss, leftCss] = group.sideCss;
		if (sides.top.trim()) {
			styles[topCss] = sides.top.trim();
		}
		if (sides.right.trim()) {
			styles[rightCss] = sides.right.trim();
		}
		if (sides.bottom.trim()) {
			styles[bottomCss] = sides.bottom.trim();
		}
		if (sides.left.trim()) {
			styles[leftCss] = sides.left.trim();
		}
		return;
	}
	const formatted = formatBoxShorthand(sides);
	if (formatted) {
		styles[group.shorthand] = formatted;
	}
}

function applyBoxPatchToMap(
	styles: Record<string, string>,
	group: IBoxShorthandGroup,
	patch: Partial<Record<BrowserHtmlEditStyleKey, string>>,
): void {
	if (Object.prototype.hasOwnProperty.call(patch, group.shorthandKey)) {
		removeBoxInlineLonghands(styles, group);
		const value = patch[group.shorthandKey]?.trim() ?? '';
		if (value) {
			styles[group.shorthand] = value;
		}
		return;
	}

	const hasSidePatch = group.sideKeys.some(key => Object.prototype.hasOwnProperty.call(patch, key));
	if (!hasSidePatch) {
		return;
	}

	const sideOrder: Array<keyof IBoxShorthandSides> = ['top', 'right', 'bottom', 'left'];
	const sides = getResolvedBoxSides(styles, group) ?? { top: '', right: '', bottom: '', left: '' };
	for (let index = 0; index < group.sideKeys.length; index++) {
		const key = group.sideKeys[index]!;
		if (Object.prototype.hasOwnProperty.call(patch, key)) {
			sides[sideOrder[index]!] = patch[key]?.trim() ?? '';
		}
	}

	removeBoxInlineLonghands(styles, group);
	applyBoxSidesToStyles(styles, group, sides);
}

function removeBorderRadiusLonghands(styles: Record<string, string>): void {
	delete styles['border-radius'];
	for (const name of BORDER_RADIUS_CORNER_CSS) {
		delete styles[name];
	}
}

function applyBorderRadiusPatch(
	styles: Record<string, string>,
	patch: Partial<Record<BrowserHtmlEditStyleKey, string>>,
): void {
	if (!Object.prototype.hasOwnProperty.call(patch, 'borderRadius')) {
		return;
	}
	removeBorderRadiusLonghands(styles);
	const value = patch.borderRadius?.trim() ?? '';
	if (value) {
		styles['border-radius'] = value;
	}
}

function hasComplexBackground(styles: Record<string, string>): boolean {
	if (styles['background-image']?.trim() && styles['background-image'].trim() !== 'none') {
		return true;
	}
	const background = styles['background']?.trim();
	return !!background && !isSimpleBackgroundColorValue(background);
}

function applyBackgroundColorPatch(
	styles: Record<string, string>,
	patch: Partial<Record<BrowserHtmlEditStyleKey, string>>,
): void {
	if (!Object.prototype.hasOwnProperty.call(patch, 'backgroundColor')) {
		return;
	}
	const value = patch.backgroundColor?.trim() ?? '';
	const background = styles['background']?.trim();
	if (background && isSimpleBackgroundColorValue(background)) {
		delete styles['background'];
		delete styles['background-color'];
		if (value) {
			styles['background'] = value;
		}
		return;
	}
	if (hasComplexBackground(styles)) {
		delete styles['background-color'];
		if (value) {
			styles['background-color'] = value;
		}
		return;
	}
	delete styles['background'];
	delete styles['background-color'];
	if (value) {
		styles['background-color'] = value;
	}
}

function setInlineStyles(el: HTMLElement, styles: Partial<Record<BrowserHtmlEditStyleKey, string>>): void {
	const current = parseInlineStyleAttribute(el.getAttribute('style') ?? undefined);
	const borderPatch: Partial<Record<BrowserHtmlEditStyleKey, string>> = {};
	const marginPatch: Partial<Record<BrowserHtmlEditStyleKey, string>> = {};
	const paddingPatch: Partial<Record<BrowserHtmlEditStyleKey, string>> = {};
	const boxPatch: Partial<Record<BrowserHtmlEditStyleKey, string>> = {};

	for (const key of BROWSER_HTML_EDIT_STYLE_PROPS) {
		if (!Object.prototype.hasOwnProperty.call(styles, key)) {
			continue;
		}
		if (isBorderRelatedStyleKey(key)) {
			borderPatch[key] = styles[key];
			continue;
		}
		if (isMarginRelatedStyleKey(key)) {
			marginPatch[key] = styles[key];
			continue;
		}
		if (isPaddingRelatedStyleKey(key)) {
			paddingPatch[key] = styles[key];
			continue;
		}
		if (key === 'borderRadius' || key === 'backgroundColor') {
			boxPatch[key] = styles[key];
			continue;
		}
		const cssName = cssNameForStyleKey(key);
		const value = sanitizeInlineStyleValue(styles[key] ?? '');
		if (!value) {
			delete current[cssName];
		} else {
			current[cssName] = value;
		}
	}

	if (Object.keys(borderPatch).length > 0) {
		applyBorderPatchToMap(current, borderPatch);
	}
	if (Object.keys(marginPatch).length > 0) {
		applyBoxPatchToMap(current, MARGIN_BOX_GROUP, marginPatch);
	}
	if (Object.keys(paddingPatch).length > 0) {
		applyBoxPatchToMap(current, PADDING_BOX_GROUP, paddingPatch);
	}
	if (Object.keys(boxPatch).length > 0) {
		applyBorderRadiusPatch(current, boxPatch);
		applyBackgroundColorPatch(current, boxPatch);
	}

	const serialized = serializeInlineStyleMap(current);
	if (serialized) {
		el.setAttribute('style', serialized);
	} else {
		el.removeAttribute('style');
	}
}

function isNonRenderableBodyChild(el: Element): boolean {
	const tag = el.tagName.toLowerCase();
	return tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript';
}

function isLastRenderableBodyChild(doc: Document, el: Element): boolean {
	const renderableBodyChildren = Array.from(doc.body.children).filter(child => {
		if (child === el) {
			return true;
		}
		return !isNonRenderableBodyChild(child);
	});
	return renderableBodyChildren.length === 1 && renderableBodyChildren[0] === el;
}

function applyContentPatch(el: Element, kind: BrowserHtmlEditKind | undefined, patch: IBrowserHtmlPatch): IBrowserHtmlPatchResult | undefined {
	const resolvedKind = kind ?? 'text';
	if (resolvedKind === 'link') {
		if (patch.text !== undefined) {
			const textError = setTextContent(el, patch.text);
			if (textError) {
				return textError;
			}
		}
		if (patch.href !== undefined) {
			el.setAttribute('href', patch.href);
		}
		return undefined;
	}
	if (resolvedKind === 'image') {
		if (patch.src !== undefined) {
			el.setAttribute('src', patch.src);
		}
		if (patch.alt !== undefined) {
			el.setAttribute('alt', patch.alt);
		}
		return undefined;
	}
	if (resolvedKind === 'container') {
		return undefined;
	}
	if (patch.text !== undefined) {
		return setTextContent(el, patch.text);
	}
	return undefined;
}

export function applyBrowserHtmlPatch(
	source: string,
	patch: IBrowserHtmlPatch,
	rootDocument: Document,
	options?: IBrowserHtmlPatchOptions,
): IBrowserHtmlPatchResult {
	const parsed = parseHtmlEditDomPath(patch.domPath);
	if (parsed.kind === 'tpl') {
		return applyDcTplPatch(source, patch, parsed, rootDocument, options);
	}

	const doc = parseSource(source, rootDocument);
	if (!doc?.body) {
		return { ok: false, source, error: browserViewLabel('htmlEditParseFailed', 'Could not parse HTML source.') };
	}

	const resolved = resolveElementByDomPath(doc, patch.domPath);
	if (resolved.duplicate) {
		return { ok: false, source, error: browserViewLabel('htmlEditDuplicateTplId', 'Multiple elements share the same template id in the HTML source.') };
	}
	const el = resolved.element;
	if (!el) {
		return { ok: false, source, error: browserViewLabel('htmlEditElementNotFound', 'Selected element was not found in the HTML source.') };
	}

	if (patch.removeElement) {
		if (!el.parentElement) {
			return { ok: false, source, error: browserViewLabel('htmlEditRemoveRoot', 'Cannot remove the root element.') };
		}
		if (el.parentElement === doc.body && isLastRenderableBodyChild(doc, el)) {
			return { ok: false, source, error: browserViewLabel('htmlEditRemoveLast', 'Cannot remove the last rendered element in the document.') };
		}
		el.remove();
		return { ok: true, source: serializeSource(doc, source) };
	}

	const contentError = applyContentPatch(el, patch.kind, patch);
	if (contentError) {
		return { ...contentError, source };
	}

	if (patch.styles) {
		setInlineStyles(el as HTMLElement, patch.styles);
	}

	return { ok: true, source: serializeSource(doc, source) };
}
