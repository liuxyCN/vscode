/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IElementData } from '../../../../platform/browserView/common/browserView.js';

export const BODY_DOM_PATH = '__body__';

export type HtmlEditDomPathKind = 'body' | 'path' | 'tpl';

export interface IHtmlEditDomPath {
	readonly kind: HtmlEditDomPathKind;
	readonly componentName?: string;
	readonly tplId?: number;
	readonly pathIndices?: number[];
}

const DC_TPL_DOM_PATH_RE = /^dc:([^:]+):tpl-(\d+)$/;
const TPL_DOM_PATH_RE = /^tpl-(\d+)$/;

export function parseHtmlEditDomPath(domPath: string): IHtmlEditDomPath {
	if (domPath === BODY_DOM_PATH) {
		return { kind: 'body' };
	}
	const dcMatch = domPath.match(DC_TPL_DOM_PATH_RE);
	if (dcMatch) {
		return { kind: 'tpl', componentName: dcMatch[1], tplId: Number(dcMatch[2]) };
	}
	const tplMatch = domPath.match(TPL_DOM_PATH_RE);
	if (tplMatch) {
		return { kind: 'tpl', tplId: Number(tplMatch[1]) };
	}
	if (domPath.startsWith('path-')) {
		const indices = domPath.slice('path-'.length).split('-').map(part => Number(part));
		if (indices.every(index => Number.isInteger(index) && index >= 0)) {
			return { kind: 'path', pathIndices: indices };
		}
	}
	return { kind: 'path', pathIndices: [] };
}

export function resolveDcTplLocator(data: IElementData, resource?: URI): IDcTplLocator | undefined {
	const tplRaw = data.attributes?.['data-dc-tpl'];
	if (tplRaw !== undefined && tplRaw !== '') {
		const tplId = Number(tplRaw);
		if (Number.isInteger(tplId) && tplId >= 0) {
			return {
				componentName: data.attributes?.['data-sc-name'] ?? (resource ? dcComponentNameFromResource(resource) : undefined),
				tplId,
			};
		}
	}
	return undefined;
}

export interface IDcTplLocator {
	readonly componentName?: string;
	readonly tplId: number;
}

/** Attribute stamped on picked elements when nested inside a parent `<dc-import>`. */
export const DC_IMPORT_TPL_ATTR = 'data-dc-import-tpl';
/** Prop name when template source at tpl id is a sole `{{prop}}` hole. */
export const DC_PROP_HOLE_ATTR = 'data-dc-prop-hole';
/** Where a prop-hole text edit should be written back (`import` | `default`). */
export const DC_PROP_SOURCE_ATTR = 'data-dc-prop-source';

export type DcPropSourceKind = 'import' | 'default';

export interface IDcPropBinding {
	readonly propName: string;
	readonly source: DcPropSourceKind;
	readonly importTplId?: number;
	readonly componentName?: string;
}

/** True when `text` is a single DC interpolation hole, e.g. `{{title}}` or `{{ item1 }}`. */
export function detectDcPropHole(text: string): string | undefined {
	const match = text.trim().match(/^\{\{\s*([\w$]+)\s*\}\}$/);
	return match?.[1];
}

export function getDcImportTplId(data: { readonly attributes?: Record<string, string> }): number | undefined {
	const raw = data.attributes?.[DC_IMPORT_TPL_ATTR];
	if (raw === undefined || raw === '') {
		return undefined;
	}
	const tplId = Number(raw);
	return Number.isInteger(tplId) && tplId >= 0 ? tplId : undefined;
}

/**
 * Decides where a `{{prop}}` text edit is written back.
 *
 * `ownerComponentName` is the component whose template the associated file defines: the name
 * derived from a `<name>.dc.html` file, or the page's DC root name for a plain `.html` host. When
 * the picked element belongs to a different component, the value the user sees comes from the
 * `<dc-import>` in this file; otherwise it comes from the component's own `data-props` default.
 *
 * The owner's own root element also carries a `data-dc-import-tpl` stamp (its root tpl id differs
 * from the picked element's), so the name comparison is what keeps that case out of `import`.
 */
export function resolveDcPropSource(
	data: { readonly attributes?: Record<string, string> },
	ownerComponentName: string | undefined,
	componentName: string | undefined,
): DcPropSourceKind {
	const importTplId = getDcImportTplId(data);
	if (importTplId !== undefined && ownerComponentName && componentName && ownerComponentName !== componentName) {
		return 'import';
	}
	return 'default';
}

export function getDcPropBinding(
	data: { readonly attributes?: Record<string, string> },
	fileComponentName?: string,
): IDcPropBinding | undefined {
	const propName = data.attributes?.[DC_PROP_HOLE_ATTR];
	if (!propName) {
		return undefined;
	}
	const sourceRaw = data.attributes?.[DC_PROP_SOURCE_ATTR];
	if (sourceRaw !== 'import' && sourceRaw !== 'default') {
		return undefined;
	}
	return {
		propName,
		source: sourceRaw,
		importTplId: getDcImportTplId(data),
		componentName: data.attributes?.['data-sc-name'],
	};
}

export function propNameToHtmlAttribute(propName: string): string {
	return propName.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

export function buildDcTplDomPath(locator: IDcTplLocator): string {
	if (locator.componentName) {
		return `dc:${locator.componentName}:tpl-${locator.tplId}`;
	}
	return `tpl-${locator.tplId}`;
}

export function dcComponentNameFromResource(resource: URI): string | undefined {
	const base = resource.path.split('/').pop() ?? '';
	const match = base.match(/^(.+)\.dc\.html$/i);
	if (match) {
		return match[1];
	}
	try {
		const decoded = decodeURIComponent(base);
		const decodedMatch = decoded.match(/^(.+)\.dc\.html$/i);
		return decodedMatch?.[1];
	} catch {
		return undefined;
	}
}

export type BrowserHtmlEditKind = 'text' | 'link' | 'image' | 'container';

export const BROWSER_HTML_EDIT_STYLE_PROPS = [
	'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'textAlign', 'textDecoration', 'lineHeight', 'letterSpacing',
	'width', 'height', 'minHeight', 'overflow',
	'gap', 'flexDirection', 'justifyContent', 'alignItems',
	'backgroundColor', 'opacity',
	'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
	'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
	'border', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
	'borderStyle', 'borderColor', 'borderRadius',
] as const;

export type BrowserHtmlEditStyleKey = typeof BROWSER_HTML_EDIT_STYLE_PROPS[number];

export type BrowserHtmlEditStyles = Record<BrowserHtmlEditStyleKey, string>;

export interface IBrowserHtmlEditDraft {
	readonly kind: BrowserHtmlEditKind;
	readonly text: string;
	readonly href: string;
	readonly src: string;
	readonly alt: string;
	readonly outerHtml: string;
	readonly styles: BrowserHtmlEditStyles;
}

const STYLE_KEY_TO_CSS: Record<BrowserHtmlEditStyleKey, string> = {
	fontFamily: 'font-family',
	fontSize: 'font-size',
	fontWeight: 'font-weight',
	fontStyle: 'font-style',
	color: 'color',
	textAlign: 'text-align',
	textDecoration: 'text-decoration',
	lineHeight: 'line-height',
	letterSpacing: 'letter-spacing',
	width: 'width',
	height: 'height',
	minHeight: 'min-height',
	overflow: 'overflow',
	gap: 'gap',
	flexDirection: 'flex-direction',
	justifyContent: 'justify-content',
	alignItems: 'align-items',
	backgroundColor: 'background-color',
	opacity: 'opacity',
	padding: 'padding',
	paddingTop: 'padding-top',
	paddingRight: 'padding-right',
	paddingBottom: 'padding-bottom',
	paddingLeft: 'padding-left',
	margin: 'margin',
	marginTop: 'margin-top',
	marginRight: 'margin-right',
	marginBottom: 'margin-bottom',
	marginLeft: 'margin-left',
	border: 'border',
	borderTopWidth: 'border-top-width',
	borderRightWidth: 'border-right-width',
	borderBottomWidth: 'border-bottom-width',
	borderLeftWidth: 'border-left-width',
	borderStyle: 'border-style',
	borderColor: 'border-color',
	borderRadius: 'border-radius',
};

export function cssNameForStyleKey(key: BrowserHtmlEditStyleKey): string {
	return STYLE_KEY_TO_CSS[key];
}

export function emptyBrowserHtmlEditStyles(): BrowserHtmlEditStyles {
	const styles: Record<BrowserHtmlEditStyleKey, string> = Object.create(null);
	for (const key of BROWSER_HTML_EDIT_STYLE_PROPS) {
		styles[key] = '';
	}
	return styles;
}

export function emptyBrowserHtmlEditDraft(): IBrowserHtmlEditDraft {
	return {
		kind: 'text',
		text: '',
		href: '',
		src: '',
		alt: '',
		outerHtml: '',
		styles: emptyBrowserHtmlEditStyles(),
	};
}

export function cloneBrowserHtmlEditDraft(draft: IBrowserHtmlEditDraft): IBrowserHtmlEditDraft {
	return {
		...draft,
		styles: { ...draft.styles },
	};
}

function normalizeStyleCompareValue(key: BrowserHtmlEditStyleKey, value: string | undefined): string {
	const trimmed = (value ?? '').trim();
	if (key === 'backgroundColor') {
		return normalizeBackgroundColorValue(trimmed);
	}
	if (key === 'borderStyle' && trimmed === 'none') {
		return '';
	}
	if (key.endsWith('Width') || key === 'width' || key === 'height' || key === 'minHeight' || key === 'gap' || key === 'borderRadius') {
		if (trimmed === '0' || trimmed === '0px' || trimmed === '0.0px') {
			return '';
		}
	}
	if (key === 'opacity' && (trimmed === '1' || trimmed === '1.0')) {
		return '1';
	}
	if ((key === 'lineHeight' || key === 'letterSpacing') && trimmed === 'normal') {
		return '';
	}
	if ((key === 'justifyContent' || key === 'alignItems') && trimmed === 'normal') {
		return '';
	}
	if (key === 'fontStyle' && trimmed === 'normal') {
		return '';
	}
	if (key === 'textDecoration') {
		const flags = parseTextDecorationFlags(trimmed);
		return composeTextDecorationFlags(flags.underline, flags.lineThrough);
	}
	return trimmed;
}

export function parseTextDecorationFlags(value: string | undefined): { underline: boolean; lineThrough: boolean } {
	const lower = (value ?? '').toLowerCase();
	return {
		underline: lower.includes('underline'),
		lineThrough: lower.includes('line-through'),
	};
}

export function composeTextDecorationFlags(underline: boolean, lineThrough: boolean): string {
	const parts: string[] = [];
	if (underline) {
		parts.push('underline');
	}
	if (lineThrough) {
		parts.push('line-through');
	}
	return parts.join(' ');
}

function normalizeTextDecorationValue(value: string): string {
	return composeTextDecorationFlags(parseTextDecorationFlags(value).underline, parseTextDecorationFlags(value).lineThrough);
}

function normalizeFontStyleValue(value: string): string {
	const trimmed = value.trim().toLowerCase();
	return trimmed === 'italic' ? 'italic' : '';
}

export function diffBrowserHtmlEditStyles(
	baseline: BrowserHtmlEditStyles,
	current: BrowserHtmlEditStyles,
): Partial<BrowserHtmlEditStyles> | undefined {
	const changed: Partial<BrowserHtmlEditStyles> = {};
	for (const key of BROWSER_HTML_EDIT_STYLE_PROPS) {
		if (normalizeStyleCompareValue(key, baseline[key]) !== normalizeStyleCompareValue(key, current[key])) {
			changed[key] = current[key] ?? '';
		}
	}
	return Object.keys(changed).length > 0 ? changed : undefined;
}

export function buildBrowserHtmlEditSavePatch(
	domPath: string,
	baseline: IBrowserHtmlEditDraft,
	current: IBrowserHtmlEditDraft,
): IBrowserHtmlPatch | undefined {
	const styles = diffBrowserHtmlEditStyles(baseline.styles, current.styles);
	const hasChanges = current.text !== baseline.text
		|| current.href !== baseline.href
		|| current.src !== baseline.src
		|| current.alt !== baseline.alt
		|| !!styles;

	if (!hasChanges) {
		return undefined;
	}

	return {
		domPath,
		kind: current.kind,
		...(current.text !== baseline.text ? { text: current.text } : {}),
		...(current.href !== baseline.href ? { href: current.href } : {}),
		...(current.src !== baseline.src ? { src: current.src } : {}),
		...(current.alt !== baseline.alt ? { alt: current.alt } : {}),
		...(styles ? { styles } : {}),
	};
}

const DC_CONTAINER_TAGS = new Set(['x-import', 'dc-import', 'deck-stage', 'x-dc', 'sc-if', 'sc-for', 'sc-else']);
const LAYOUT_CONTAINER_TAGS = new Set(['section', 'main', 'nav', 'div', 'article', 'header', 'footer']);
const SOURCE_TEXT_TAGS = new Set([
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'button', 'li', 'td', 'th',
	'em', 'strong', 'small', 'caption', 'legend', 'option', 'textarea', 'select',
]);

const IGNORABLE_INLINE_CHILD_TAGS = new Set(['br', 'wbr']);

/** Block-level or DC structural tags — their presence means layout, not a text leaf. */
export function isStructuralChildTag(tag: string): boolean {
	if (DC_CONTAINER_TAGS.has(tag) || LAYOUT_CONTAINER_TAGS.has(tag)) {
		return true;
	}
	if (/^h[1-6]$/.test(tag) || tag === 'p' || tag === 'li') {
		return true;
	}
	if (['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'form', 'fieldset'].includes(tag)) {
		return true;
	}
	if (/^sc-raw-(table|tbody|thead|tfoot|tr|td|th|select|caption)$/i.test(tag)) {
		return true;
	}
	return false;
}

/** True when child markup is compatible with inline/DC text editing (ignores whether copy is present). */
function hasEditableTextStructure(element: Element): boolean {
	if (element.childElementCount === 0) {
		return true;
	}
	for (const child of element.children) {
		const tag = child.tagName.toLowerCase();
		if (IGNORABLE_INLINE_CHILD_TAGS.has(tag)) {
			continue;
		}
		if (tag === 'span' && /\bsc-interp\b/.test(child.className)) {
			if (child.children.length > 0) {
				return false;
			}
			continue;
		}
		if (isStructuralChildTag(tag)) {
			return false;
		}
		if (!hasEditableTextStructure(child)) {
			return false;
		}
	}
	return true;
}

/** True when the element carries editable copy but no structural child tags (DC `sc-interp` / inline spans are ok). */
function hasOnlyEditableTextChildren(element: Element): boolean {
	if (element.childElementCount === 0) {
		return !!(element.textContent ?? '').trim();
	}
	return hasEditableTextStructure(element);
}

/** Read user-facing text, mapping `<br>` / `<wbr>` to `\n`. */
export function readEditableElementText(element: Element): string {
	const parts: string[] = [];
	for (const node of element.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			parts.push(node.textContent ?? '');
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const child = node as Element;
			const tag = child.tagName.toLowerCase();
			if (IGNORABLE_INLINE_CHILD_TAGS.has(tag)) {
				parts.push('\n');
			} else if (tag === 'span' && /\bsc-interp\b/.test(child.className)) {
				parts.push(child.textContent ?? '');
			} else if (!isStructuralChildTag(tag)) {
				parts.push(readEditableElementText(child));
			}
		}
	}
	return parts.join('');
}

export function elementHasEditableTextMarkup(element: Element): boolean {
	for (const child of element.children) {
		const tag = child.tagName.toLowerCase();
		if (IGNORABLE_INLINE_CHILD_TAGS.has(tag)) {
			return true;
		}
		if (tag === 'span' && /\bsc-interp\b/.test(child.className)) {
			return true;
		}
		if (elementHasEditableTextMarkup(child)) {
			return true;
		}
	}
	return false;
}

/** Write user-facing text back, mapping `\n` to `<br>` when the element already uses line breaks. */
export function applyEditableElementText(element: Element, text: string): void {
	if (!elementHasEditableTextMarkup(element)) {
		element.textContent = text;
		return;
	}
	while (element.firstChild) {
		element.removeChild(element.firstChild);
	}
	const lines = text.split('\n');
	const doc = element.ownerDocument;
	for (let i = 0; i < lines.length; i++) {
		if (i > 0) {
			element.appendChild(doc.createElement('br'));
		}
		if (lines[i].length > 0) {
			element.appendChild(doc.createTextNode(lines[i]));
		}
	}
}

/** Tags that DOMParser may auto-wrap inside `<table>` when parsed in isolation. */
const TABLE_FRAGMENT_TAGS = new Set(['td', 'th', 'tr', 'col', 'colgroup', 'caption', 'thead', 'tbody', 'tfoot']);

function outerHtmlRootTag(outerHTML: string): string | undefined {
	return outerHTML.match(/^<\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase();
}

function findFirstDescendantByTagName(root: Element, tagName: string): Element | undefined {
	for (const child of root.children) {
		if (child.tagName.toLowerCase() === tagName) {
			return child;
		}
		const nested = findFirstDescendantByTagName(child, tagName);
		if (nested) {
			return nested;
		}
	}
	return undefined;
}

export function parseOuterHtmlRootElement(outerHTML: string): Element | undefined {
	try {
		const doc = new DOMParser().parseFromString(outerHTML, 'text/html');
		const expectedTag = outerHtmlRootTag(outerHTML);
		const direct = doc.body.firstElementChild;
		if (!expectedTag) {
			return direct ?? undefined;
		}
		if (direct && direct.tagName.toLowerCase() === expectedTag) {
			return direct;
		}
		if (TABLE_FRAGMENT_TAGS.has(expectedTag)) {
			return findFirstDescendantByTagName(doc.body, expectedTag);
		}
		return direct ?? undefined;
	} catch {
		return undefined;
	}
}

export function shouldShowHtmlEditTextField(data: IElementData | undefined, kind: BrowserHtmlEditKind): boolean {
	if (!data) {
		return false;
	}
	if (kind === 'text' || kind === 'link') {
		return true;
	}
	return !!(data.innerText ?? '').trim();
}

export function inferBrowserHtmlEditKindFromSourceElement(element: Element): BrowserHtmlEditKind {
	const tag = element.tagName.toLowerCase();
	if (tag === 'a') {
		return 'link';
	}
	if (tag === 'img') {
		return 'image';
	}
	if (DC_CONTAINER_TAGS.has(tag)) {
		return 'container';
	}
	if (SOURCE_TEXT_TAGS.has(tag)) {
		return 'text';
	}
	if (LAYOUT_CONTAINER_TAGS.has(tag)) {
		return hasOnlyEditableTextChildren(element) ? 'text' : 'container';
	}
	if (element.childElementCount === 0) {
		return (element.textContent ?? '').trim() ? 'text' : 'container';
	}
	return hasOnlyEditableTextChildren(element) ? 'text' : 'container';
}

export function inferBrowserHtmlEditKind(data: IElementData): BrowserHtmlEditKind {
	const explicit = data.attributes?.['data-od-edit'];
	if (explicit === 'text' || explicit === 'link' || explicit === 'image' || explicit === 'container') {
		return explicit;
	}
	const tag = data.outerHTML.match(/^<([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? '';
	const classAttr = data.attributes?.class ?? '';
	if (/\bsc-interp\b/.test(classAttr)) {
		return 'text';
	}
	if (tag === 'a') {
		return 'link';
	}
	if (tag === 'img') {
		return 'image';
	}
	if (DC_CONTAINER_TAGS.has(tag)) {
		return 'container';
	}
	if (SOURCE_TEXT_TAGS.has(tag)) {
		return 'text';
	}
	if (LAYOUT_CONTAINER_TAGS.has(tag)) {
		const root = parseOuterHtmlRootElement(data.outerHTML);
		if (root && hasOnlyEditableTextChildren(root)) {
			return 'text';
		}
		return 'container';
	}
	const root = parseOuterHtmlRootElement(data.outerHTML);
	if (root) {
		return hasOnlyEditableTextChildren(root) ? 'text' : 'container';
	}
	return 'container';
}

/**
 * Strip characters that could inject additional CSS declarations when written to an inline style attribute.
 */
export function sanitizeInlineStyleValue(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return '';
	}
	const semicolon = trimmed.indexOf(';');
	if (semicolon !== -1) {
		return trimmed.slice(0, semicolon).trim();
	}
	if (/[{}]/.test(trimmed)) {
		return trimmed.replace(/[{}]/g, '').trim();
	}
	return trimmed;
}

export function parseInlineStyleAttribute(styleAttr: string | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	if (!styleAttr?.trim()) {
		return result;
	}
	for (const part of styleAttr.split(';')) {
		const colon = part.indexOf(':');
		if (colon === -1) {
			continue;
		}
		const name = part.slice(0, colon).trim().toLowerCase();
		const value = part.slice(colon + 1).trim();
		if (name && value) {
			result[name] = value;
		}
	}
	return result;
}

export function normalizeBackgroundColorValue(value: string | undefined): string {
	if (!value?.trim()) {
		return '';
	}
	const trimmed = value.trim();
	const normalized = trimmed.toLowerCase().replace(/\s/g, '');
	if (normalized === 'transparent' || normalized === 'rgba(0,0,0,0)' || normalized === 'rgba(0,0,0,0.0)') {
		return '';
	}
	return trimmed;
}

const unresolvedCssReferenceRegex = /\bvar\s*\(/i;

function containsUnresolvedCssReference(value: string | undefined): boolean {
	return !!value && unresolvedCssReferenceRegex.test(value);
}

/**
 * Prefer the computed value when inline/author values still contain unresolved
 * CSS references such as `var(--token)`.
 */
function resolveStyleValue(raw: string | undefined, computed: string | undefined): string {
	if (raw !== undefined) {
		if (containsUnresolvedCssReference(raw)) {
			return computed ?? raw;
		}
		return raw;
	}
	return computed ?? '';
}

function readLonghandStyle(
	inline: Record<string, string>,
	author: Record<string, string>,
	computed: Record<string, string>,
	cssName: string,
): string {
	if (inline[cssName] !== undefined) {
		return resolveStyleValue(inline[cssName], computed[cssName]);
	}
	if (author[cssName] !== undefined) {
		return resolveStyleValue(author[cssName], computed[cssName]);
	}
	return computed[cssName] ?? '';
}

const BORDER_STYLE_KEYWORDS = new Set([
	'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset',
]);

export interface IBorderShorthandParts {
	width?: string;
	style?: string;
	color?: string;
}

export function parseBorderShorthand(value: string): IBorderShorthandParts {
	const trimmed = value.trim();
	if (!trimmed) {
		return {};
	}

	let remaining = trimmed;
	let color: string | undefined;

	const functionalColor = remaining.match(/(?:rgb|rgba|hsl|hsla)\([^)]+\)/i)?.[0];
	if (functionalColor) {
		color = functionalColor;
		remaining = remaining.replace(functionalColor, ' ').replace(/\s+/g, ' ').trim();
	} else {
		const hexColor = remaining.match(/#[0-9a-f]{3,8}/i)?.[0];
		if (hexColor) {
			color = hexColor;
			remaining = remaining.replace(hexColor, ' ').replace(/\s+/g, ' ').trim();
		}
	}

	const parts: IBorderShorthandParts = {};
	const unmatched: string[] = [];
	for (const token of remaining.split(/\s+/).filter(Boolean)) {
		const lower = token.toLowerCase();
		if (BORDER_STYLE_KEYWORDS.has(lower)) {
			parts.style = lower;
		} else if (/^(thin|medium|thick)$/i.test(token) || /^[\d.]/.test(token)) {
			parts.width = token;
		} else {
			unmatched.push(token);
		}
	}

	if (!color && unmatched.length > 0) {
		parts.color = unmatched.join(' ');
	} else if (color) {
		parts.color = color;
	}

	return parts;
}

export function formatBorderShorthand(parts: IBorderShorthandParts): string {
	return [parts.width, parts.style, parts.color].filter(part => part?.trim()).join(' ');
}

export interface IBoxShorthandSides {
	top: string;
	right: string;
	bottom: string;
	left: string;
}

export function parseBoxShorthand(value: string): IBoxShorthandSides {
	const tokens = value.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return { top: '', right: '', bottom: '', left: '' };
	}
	if (tokens.length === 1) {
		return { top: tokens[0]!, right: tokens[0]!, bottom: tokens[0]!, left: tokens[0]! };
	}
	if (tokens.length === 2) {
		return { top: tokens[0]!, right: tokens[1]!, bottom: tokens[0]!, left: tokens[1]! };
	}
	if (tokens.length === 3) {
		return { top: tokens[0]!, right: tokens[1]!, bottom: tokens[2]!, left: tokens[1]! };
	}
	return { top: tokens[0]!, right: tokens[1]!, bottom: tokens[2]!, left: tokens[3]! };
}

export function formatBoxShorthand(sides: IBoxShorthandSides): string {
	const { top, right, bottom, left } = sides;
	if (!top.trim() && !right.trim() && !bottom.trim() && !left.trim()) {
		return '';
	}
	if (top === right && right === bottom && bottom === left) {
		return top;
	}
	if (top === bottom && right === left) {
		return `${top} ${right}`;
	}
	if (right === left) {
		return `${top} ${right} ${bottom}`;
	}
	return `${top} ${right} ${bottom} ${left}`;
}

export function isSimpleBackgroundColorValue(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}
	return !/(url\s*\(|gradient|\/|\srepeat|\sfixed|\sscroll)/i.test(trimmed);
}

function readBorderStyleFromInlineShorthand(inline: Record<string, string>): string {
	return parseBorderShorthand(inline['border'] ?? '').style ?? '';
}

function readBorderColorFromInlineShorthand(inline: Record<string, string>): string {
	return parseBorderShorthand(inline['border'] ?? '').color ?? '';
}

function readUniformComputedSide(
	computed: Record<string, string>,
	suffix: 'style' | 'color',
): string {
	const values = [
		computed[`border-top-${suffix}`],
		computed[`border-right-${suffix}`],
		computed[`border-bottom-${suffix}`],
		computed[`border-left-${suffix}`],
	].filter((value): value is string => !!value);
	if (values.length === 0) {
		return '';
	}
	const first = values[0]!;
	return values.every(value => value === first) ? first : values[0]!;
}

function readBorderStyle(
	inline: Record<string, string>,
	author: Record<string, string>,
	computed: Record<string, string>,
): string {
	const computedStyle = computed['border-style'];
	if (inline['border-style'] !== undefined) {
		return resolveStyleValue(inline['border-style'], computedStyle);
	}
	const fromShorthand = readBorderStyleFromInlineShorthand(inline);
	if (fromShorthand) {
		return resolveStyleValue(fromShorthand, computedStyle);
	}
	if (author['border-style'] !== undefined) {
		return resolveStyleValue(author['border-style'], computedStyle);
	}
	if (computedStyle) {
		return computedStyle;
	}
	return readUniformComputedSide(computed, 'style');
}

function readBorderColor(
	inline: Record<string, string>,
	author: Record<string, string>,
	computed: Record<string, string>,
): string {
	const computedColor = computed['border-color'];
	if (inline['border-color'] !== undefined) {
		return resolveStyleValue(inline['border-color'], computedColor);
	}
	const fromShorthand = readBorderColorFromInlineShorthand(inline);
	if (fromShorthand) {
		return resolveStyleValue(fromShorthand, computedColor);
	}
	if (author['border-color'] !== undefined) {
		return resolveStyleValue(author['border-color'], computedColor);
	}
	if (computedColor) {
		return computedColor;
	}
	return readUniformComputedSide(computed, 'color');
}

function hasInlineBorderSource(inline: Record<string, string>): boolean {
	return !!(inline['border'] || inline['border-width'] || inline['border-style'] || inline['border-color']
		|| inline['border-top-width'] || inline['border-top-style'] || inline['border-top-color']);
}

function normalizeBorderStyleValue(
	value: string,
	inline: Record<string, string>,
	author: Record<string, string>,
	cssName: string,
): string {
	if (value === 'none' && !hasInlineBorderSource(inline) && !author[cssName] && !inline[cssName]) {
		return '';
	}
	return value;
}

function normalizeBorderWidthValue(value: string, inline: Record<string, string>, author: Record<string, string>, cssName: string): string {
	if ((value === '0' || value === '0px') && !hasInlineBorderSource(inline) && !author[cssName] && !inline[cssName]) {
		return '';
	}
	return value;
}

export function readStyleValue(
	author: Record<string, string>,
	inline: Record<string, string>,
	computed: Record<string, string>,
	key: BrowserHtmlEditStyleKey,
): string {
	const cssName = STYLE_KEY_TO_CSS[key];
	if (key === 'backgroundColor') {
		const computedNorm = normalizeBackgroundColorValue(computed[cssName]);
		const inlineLonghand = inline[cssName];
		if (inlineLonghand !== undefined) {
			return normalizeBackgroundColorValue(resolveStyleValue(inlineLonghand, computed[cssName]));
		}
		if (inline['background']) {
			return computedNorm;
		}
		const authorVal = author[cssName];
		if (authorVal !== undefined) {
			if (!computedNorm) {
				return '';
			}
			return normalizeBackgroundColorValue(resolveStyleValue(authorVal, computed[cssName]));
		}
		return computedNorm;
	}
	if (key === 'color') {
		return readLonghandStyle(inline, author, computed, cssName);
	}
	if (key === 'fontStyle') {
		return normalizeFontStyleValue(readLonghandStyle(inline, author, computed, cssName));
	}
	if (key === 'textDecoration') {
		return normalizeTextDecorationValue(readLonghandStyle(inline, author, computed, cssName));
	}
	if (key === 'borderColor') {
		return readBorderColor(inline, author, computed);
	}
	if (key === 'borderStyle') {
		const value = readBorderStyle(inline, author, computed);
		return normalizeBorderStyleValue(value, inline, author, cssName);
	}
	if (key === 'borderTopWidth' || key === 'borderRightWidth' || key === 'borderBottomWidth' || key === 'borderLeftWidth') {
		const value = readLonghandStyle(inline, author, computed, cssName);
		return normalizeBorderWidthValue(value, inline, author, cssName);
	}
	if (key === 'overflow') {
		const value = readLonghandStyle(inline, author, computed, cssName);
		if (value === 'visible' && !inline[cssName] && !author[cssName]) {
			return '';
		}
		return value;
	}
	return readLonghandStyle(inline, author, computed, cssName);
}

export function readBrowserHtmlEditStyles(data: IElementData): BrowserHtmlEditStyles {
	const author = data.authorStyles ?? {};
	const computed = data.computedStyles ?? {};
	const inline = parseInlineStyleAttribute(data.attributes?.style);
	const styles = emptyBrowserHtmlEditStyles();
	for (const key of BROWSER_HTML_EDIT_STYLE_PROPS) {
		styles[key] = readStyleValue(author, inline, computed, key);
	}
	return styles;
}

export interface IBrowserHtmlPatch {
	readonly domPath: string;
	readonly kind?: BrowserHtmlEditKind;
	readonly text?: string;
	readonly href?: string;
	readonly src?: string;
	readonly alt?: string;
	readonly styles?: Partial<BrowserHtmlEditStyles>;
	readonly removeElement?: boolean;
	/** Replace the targeted element with parsed HTML (layout mode save). */
	readonly replaceOuterHtml?: string;
}
