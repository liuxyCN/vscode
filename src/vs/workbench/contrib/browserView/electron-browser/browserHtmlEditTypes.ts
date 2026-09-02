/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElementData } from '../../../../platform/browserView/common/browserView.js';

export const BODY_DOM_PATH = '__body__';

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

export function inferBrowserHtmlEditKind(data: IElementData): BrowserHtmlEditKind {
	const explicit = data.attributes?.['data-od-edit'];
	if (explicit === 'text' || explicit === 'link' || explicit === 'image' || explicit === 'container') {
		return explicit;
	}
	const tag = data.outerHTML.match(/^<([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? '';
	if (tag === 'a') {
		return 'link';
	}
	if (tag === 'img') {
		return 'image';
	}
	if (['section', 'main', 'nav', 'div', 'article', 'header', 'footer'].includes(tag)) {
		return 'container';
	}
	return 'text';
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

function readLonghandStyle(
	inline: Record<string, string>,
	author: Record<string, string>,
	computed: Record<string, string>,
	cssName: string,
): string {
	return inline[cssName] ?? author[cssName] ?? computed[cssName] ?? '';
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
	if (inline['border-style']) {
		return inline['border-style'];
	}
	const fromShorthand = readBorderStyleFromInlineShorthand(inline);
	if (fromShorthand) {
		return fromShorthand;
	}
	if (author['border-style']) {
		return author['border-style'];
	}
	if (computed['border-style']) {
		return computed['border-style'];
	}
	return readUniformComputedSide(computed, 'style');
}

function readBorderColor(
	inline: Record<string, string>,
	author: Record<string, string>,
	computed: Record<string, string>,
): string {
	if (inline['border-color']) {
		return inline['border-color'];
	}
	const fromShorthand = readBorderColorFromInlineShorthand(inline);
	if (fromShorthand) {
		return fromShorthand;
	}
	if (author['border-color']) {
		return author['border-color'];
	}
	if (computed['border-color']) {
		return computed['border-color'];
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
		const inlineLonghand = inline[cssName];
		if (inlineLonghand) {
			return normalizeBackgroundColorValue(inlineLonghand);
		}
		if (inline['background']) {
			return normalizeBackgroundColorValue(computed[cssName]);
		}
		const authorVal = author[cssName];
		if (authorVal) {
			const computedNorm = normalizeBackgroundColorValue(computed[cssName]);
			if (!computedNorm) {
				return '';
			}
			return normalizeBackgroundColorValue(authorVal);
		}
		return normalizeBackgroundColorValue(computed[cssName]);
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
}
