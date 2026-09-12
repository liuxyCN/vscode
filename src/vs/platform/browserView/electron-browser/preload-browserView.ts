/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */

// Only `import type` is allowed in preload scripts — Electron preloads cannot resolve module imports at runtime.
import type { BrowserElementSelectionMode, IBrowserElementCommentsUpdate, IBrowserElementSelectionOptions, IBrowserHtmlEditPreview, IBrowserViewPreloadLocalizedStrings, IBrowserViewTheme, IBrowserViewRect } from '../common/browserView.js';

const commentElementSelectionMode = 'comment' as BrowserElementSelectionMode;
const editElementSelectionMode = 'edit' as BrowserElementSelectionMode;
let localizedStrings: IBrowserViewPreloadLocalizedStrings = {
	addComment: 'Add Comment',
	addCommentPlaceholder: 'Add a comment',
	commentOnSelectedElement: 'Comment on selected element',
	elementComment: 'Element comment {0}',
	elementCommentWithBody: 'Element comment {0}: {1}',
	emptyElementComment: 'Empty element comment {0}',
	removeComment: 'Remove Comment',
	removeElementComment: 'Remove element comment',
	htmlLayoutSave: 'Save',
	htmlLayoutCancel: 'Cancel',
	htmlLayoutDelete: 'Delete element',
};

/**
 * Preload script for pages loaded in Integrated Browser
 *
 * It runs in an isolated context that Electron calls an "isolated world".
 * Specifically the isolated world with worldId 999, which shows in DevTools as "Electron Isolated Context".
 * Despite being isolated, it still runs on the same page as the JS from the actual loaded website
 * which runs on the so-called "main world" (worldId 0. In DevTools as "top").
 *
 * Learn more: see Electron docs for Security, contextBridge, and Context Isolation.
 */
function init() {
	const { contextBridge, ipcRenderer } = require('electron');

	// #######################################################################
	// ###                                                                 ###
	// ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
	// ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
	// ###       (https://github.com/electron/electron/issues/25516)       ###
	// ###                                                                 ###
	// #######################################################################

	// Ctrl/Cmd keybindings that correspond to native editing shortcuts and should be handled by the browser / OS and not forwarded to the workbench.
	const nativeCtrlCmdKeybindings = {
		mac: {
			always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'backspace', 'delete']),
			noShift: new Set(['a', 'c', 'v', 'x', 'z']),
			withShift: new Set(['v', 'z']),
		},
		nonMac: {
			always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end', 'backspace', 'delete']),
			noShift: new Set(['a', 'c', 'v', 'x', 'z', 'y']),
			withShift: new Set(['v', 'z']),
		}
	};

	// Listen for keydown events that the page did not handle and forward them for shortcut handling.
	window.addEventListener('keydown', (event) => {
		// Require that the event is trusted -- i.e. user-initiated.
		if (!(event instanceof KeyboardEvent) || !event.isTrusted) {
			return;
		}

		// If the event was already handled by the page, do not forward it.
		if (event.defaultPrevented) {
			return;
		}

		const isNonEditingKey =
			event.key === 'Escape' ||
			/^F\d+$/.test(event.key) ||
			event.key.startsWith('Audio') || event.key.startsWith('Media') || event.key.startsWith('Browser');

		// Only forward if there's a command modifier or it's a non-editing key
		// (most plain key events should just be handled natively by the browser and not forwarded)
		if (!(event.ctrlKey || event.altKey || event.metaKey) && !isNonEditingKey) {
			return;
		}

		// Never handle plain modifier key presses as keybindings
		if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
			return;
		}

		const isMac = navigator.platform.indexOf('Mac') >= 0;

		// Alt+Key special character handling (Alt + Numpad keys on Windows/Linux, Alt + any key on Mac)
		if (event.altKey && !event.ctrlKey && !event.metaKey) {
			if (isMac || /^Numpad\d+$/.test(event.code)) {
				return;
			}
		}

		// Allow Shift+F10 for context menu
		if (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
			return;
		}

		// Allow native shortcuts to be handled by the browser
		const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
		if (ctrlCmd && !event.altKey) {
			let key = event.key.toLowerCase();
			// Prefer remapped Latin letters, falling back to the physical key for non-Latin layouts.
			if (!/^[a-z]$/.test(key) && /^Key[A-Z]$/.test(event.code)) {
				key = event.code.slice(3).toLowerCase();
			}
			const keySetsToCheck = [
				nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'].always,
				nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'][event.shiftKey ? 'withShift' : 'noShift'],
			];
			if (keySetsToCheck.some(set => set.has(key))) {
				return;
			}

			// Emoji picker on Mac
			if (isMac && event.ctrlKey && !event.shiftKey && key === ' ') {
				return;
			}
		}

		// Everything else should be forwarded to the workbench for potential shortcut handling.
		event.preventDefault();
		event.stopPropagation();
		ipcRenderer.send('vscode:browserView:keydown', {
			key: event.key,
			keyCode: event.keyCode,
			code: event.code,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
			repeat: event.repeat
		});
	});

	const elementPickerRef: { current?: ElementPicker } = {};
	const htmlLayoutEditBridge = new HtmlLayoutEditBridge({
		onSave: () => ipcRenderer.send('vscode:browserView:htmlLayoutSave'),
		onCancel: () => ipcRenderer.send('vscode:browserView:htmlLayoutCancel'),
	});
	const htmlEditBridge = new HtmlEditBridge(
		payload => {
			ipcRenderer.send('vscode:browserView:htmlEditTextCommit', payload);
		},
		({ active, element }) => {
			elementPickerRef.current?.setElementHighlight(active ? undefined : element);
		},
	);
	ipcRenderer.on('vscode:browserView:editPreview', (_event: unknown, preview: IBrowserHtmlEditPreview) => {
		htmlEditBridge.applyPreview(preview);
	});
	ipcRenderer.on('vscode:browserView:editTextFinish', (_event: unknown, data: { commit?: boolean }) => {
		htmlEditBridge.finishActiveTextEdit(data?.commit !== false);
	});
	ipcRenderer.on('vscode:browserView:reselectByDomPath', (_event: unknown, domPath: string) => {
		if (!domPath) {
			return;
		}
		const el = findElementByDomPath(domPath);
		if (!el) {
			return;
		}
		const elementId = track(el);
		const dcStamp = dcStampAttributesForElement(el);
		ipcRenderer.send('vscode:browserView:elementPicked', {
			elementId,
			domPath: domPathForElement(el),
			dcTplId: dcStamp.dcTplId,
			dcComponentName: dcStamp.dcComponentName,
			dcImportTplId: dcStamp.dcImportTplId,
		});
	});

	const elementPicker = new ElementPicker(
		(el, comment) => {
			const elementId = track(el);
			const dcStamp = dcStampAttributesForElement(el);
			ipcRenderer.send('vscode:browserView:elementPicked', {
				elementId,
				comment,
				domPath: domPathForElement(el),
				dcTplId: dcStamp.dcTplId,
				dcComponentName: dcStamp.dcComponentName,
				dcImportTplId: dcStamp.dcImportTplId,
			});
			return elementId;
		},
		elementId => ipcRenderer.send('vscode:browserView:elementCommentRemoved', elementId),
		() => ipcRenderer.send('vscode:browserView:elementPickStopped'),
		htmlEditBridge,
		htmlLayoutEditBridge,
	);
	elementPickerRef.current = elementPicker;
	ipcRenderer.on('vscode:browserView:setHtmlLayoutMode', (_event: unknown, data: { active?: boolean }) => {
		elementPicker.setHtmlLayoutMode(data?.active === true);
	});

	const areaPicker = new AreaPicker(
		rect => ipcRenderer.send('vscode:browserView:areaPicked', rect),
		() => ipcRenderer.send('vscode:browserView:areaPickStopped')
	);

	const trackedElementsById = new Map<string, WeakRef<Element>>();
	const finalizationRegistry = new FinalizationRegistry<string>(id => {
		trackedElementsById.delete(id);
	});

	function track(element: Element): string {
		const id = `el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		trackedElementsById.set(id, new WeakRef(element));
		finalizationRegistry.register(element, id);
		return id;
	}

	let contextMenuTarget: { ref: WeakRef<Element>; anchor: { x: number; y: number } } | undefined;
	window.addEventListener('contextmenu', (event) => {
		if (!event.isTrusted) {
			return;
		}
		const target = elementPicker.resolveContextMenuTarget(event);
		if (target) {
			const els = [target];
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed) {
				els.push(selection.anchorNode as Element, selection.focusNode as Element);
			}
			contextMenuTarget = {
				ref: new WeakRef(findCommonVisibleAncestor(els) ?? target),
				anchor: { x: event.clientX, y: event.clientY },
			};
		} else {
			contextMenuTarget = undefined;
		}
	}, { capture: true });

	// Invoked over IPC to support frames (executeJavaScriptInIsolatedWorld doesn't exist on WebFrameMain).
	ipcRenderer.on('vscode:browserView:setTheme', (_event: unknown, theme: IBrowserViewTheme) => {
		elementPicker.setTheme(theme);
		areaPicker.setTheme(theme);
		htmlLayoutEditBridge.setTheme(theme);
	});
	ipcRenderer.on('vscode:browserView:setLocalizedStrings', (_event: unknown, strings: IBrowserViewPreloadLocalizedStrings) => {
		localizedStrings = strings;
		elementPicker.updateLocalizedStrings();
		htmlLayoutEditBridge.updateLocalizedStrings();
	});
	ipcRenderer.on('vscode:browserView:startElementPicker', (_event: unknown, options: IBrowserElementSelectionOptions) => {
		elementPicker.start(options);
	});
	ipcRenderer.on('vscode:browserView:stopElementPicker', (_event: unknown) => {
		elementPicker.stop();
	});
	ipcRenderer.on('vscode:browserView:startAreaPicker', (_event: unknown) => {
		areaPicker.start();
	});
	ipcRenderer.on('vscode:browserView:stopAreaPicker', (_event: unknown) => {
		areaPicker.stop();
	});
	ipcRenderer.on('vscode:browserView:highlightElement', (_event: unknown, { elementId }: { elementId: string }) => {
		const element = getElement(elementId);
		if (element) {
			elementPicker.highlight(element);
		}
	});
	ipcRenderer.on('vscode:browserView:showElementComment', (_event: unknown, { elementId }: { elementId: string }) => {
		const element = getElement(elementId);
		if (element && contextMenuTarget) {
			elementPicker.comment(element, contextMenuTarget.anchor);
		}
	});
	ipcRenderer.on('vscode:browserView:hideHighlight', (_event: unknown) => {
		elementPicker.hideHighlight();
	});
	ipcRenderer.on('vscode:browserView:setElementComments', (_event: unknown, update: IBrowserElementCommentsUpdate) => {
		elementPicker.updateComments(update);
	});

	const getElement = (id: string): Element | null => {
		switch (id) {
			case 'active':
				return document.activeElement;
			case 'context-menu-target':
				return contextMenuTarget?.ref.deref() ?? null;
			default:
				return trackedElementsById.get(id)?.deref() ?? null;
		}
	};

	const isolatedHelpers = {
		/**
		 * Get the currently selected text in the page.
		 */
		getSelectedText(): string {
			try {
				// Even if the page has overridden window.getSelection, our call here will still reach the original
				// implementation. That's because Electron proxies functions, such as getSelectedText here, that are
				// exposed to a different context via exposeInIsolatedWorld or exposeInMainWorld.
				return window.getSelection()?.toString() ?? '';
			} catch {
				return '';
			}
		},
		getHtmlLayoutSavePayload(): IHtmlLayoutSavePayload | null {
			return htmlLayoutEditBridge.getSavePayload();
		},
		hasHtmlLayoutChanges(): boolean {
			return htmlLayoutEditBridge.hasChanges();
		},
		restoreHtmlLayoutDefaults(): void {
			htmlLayoutEditBridge.restoreDefaults();
		},
	};

	// Generate a unique token for this frame instance. This token is used to
	// correlate the Electron WebFrameMain (available via IPC senderFrame) with
	// the CDP target session (discoverable via Runtime.evaluate in the main world).
	const frameToken = `frame-${Date.now()}-${Math.random().toString(36).slice(2)}`;

	const mainWorldHelpers = {
		getElement,
		/** Opaque token exposed for CDP-side frame matching. */
		getFrameToken(): string { return frameToken; },
	};

	try {
		// Use `contextBridge` APIs to expose globals to the same isolated world where this preload script runs (worldId 999).
		// The isolatedHelpers object will be recursively frozen (and for functions also proxied) by Electron to prevent
		// modification within the given context.
		contextBridge.exposeInIsolatedWorld(999, 'browserViewAPI', isolatedHelpers);
		// Expose helpers on `window.__vscode_helpers` in the page's main world
		// for CDP `Runtime.evaluate` (which runs against the main world) to use.
		contextBridge.exposeInMainWorld('__vscode_helpers', mainWorldHelpers);
	} catch (error) {
		console.error(error);
	}

	ipcRenderer.send('vscode:browserView:preloadReady', frameToken);
}

/**
 * Find the deepest element that contains every element in `candidates`.
 * Walks up `parentElement` from each candidate to build chains, then
 * returns the last shared element. Returns `undefined` if the chains
 * don't overlap (shouldn't happen for elements in the same document).
 */
function findCommonVisibleAncestor(candidates: readonly (Node | null | undefined)[]): Element | undefined {
	const filteredNodes = candidates.filter(c => !!c) as Node[];
	const unique = [...new Set(filteredNodes.map(node => node instanceof Element ? node : node.parentElement).filter(e => !!e))] as Element[];
	if (unique.length === 0) {
		return undefined;
	}

	// Find the nearest visible ancestor of a single element.
	const findVisible = (el: Element): Element => {
		for (let cur: Element | null = el; cur; cur = cur.parentElement) {
			const width = cur instanceof HTMLElement ? cur.offsetWidth : cur.clientWidth;
			const height = cur instanceof HTMLElement ? cur.offsetHeight : cur.clientHeight;
			if (width > 0 && height > 0) {
				return cur;
			}
		}
		return el;
	};

	if (unique.length === 1) {
		return findVisible(unique[0]);
	}

	// Build the ancestor chain for the first candidate (root → element).
	const firstChain: Element[] = [];
	for (let cur: Element | null = unique[0]; cur; cur = cur.parentElement) {
		firstChain.unshift(cur);
	}

	// Reduce to chain prefix shared with every other candidate.
	let common = firstChain;
	for (let i = 1; i < unique.length; i++) {
		const otherChain: Element[] = [];
		for (let cur: Element | null = unique[i]; cur; cur = cur.parentElement) {
			otherChain.unshift(cur);
		}
		let j = 0;
		const limit = Math.min(common.length, otherChain.length);
		while (j < limit && common[j] === otherChain[j]) {
			j++;
		}
		common = common.slice(0, j);
		if (common.length === 0) {
			return undefined;
		}
	}
	return findVisible(common[common.length - 1]);
}

type ElementComment = {
	target: Element;
	pin: HTMLDivElement;
	numberElement: HTMLSpanElement;
	body: string;
	ordinal: number;
	offset: { x: number; y: number };
};

type PendingElementComment = {
	target: Element;
	anchor: { x: number; y: number };
	body: string;
	pointerInteraction: boolean;
};

type ScheduledCommentPin = {
	body: string;
	ordinal: number;
	animationFrame: number;
	timeout: number;
};

type CommentAnimation = {
	surface: Animation;
	supporting: Animation[];
};

const BODY_DOM_PATH = '__body__';

function dcRootNameFromWindow(): string | undefined {
	try {
		const name = (window as Window & { __dcRootName?: () => string }).__dcRootName?.();
		return typeof name === 'string' && name ? name : undefined;
	} catch {
		return undefined;
	}
}

function domPathStampTarget(el: Element): Element | null {
	let fallback: Element | null = null;
	for (let node: Element | null = el; node; node = node.parentElement) {
		const tpl = node.getAttribute('data-dc-tpl');
		if (tpl === null || tpl === '') {
			continue;
		}
		if (!node.classList.contains('sc-host-x')) {
			return node;
		}
		if (!fallback) {
			fallback = node;
		}
	}
	return fallback;
}

function domPathForElement(el: Element): string {
	const parts: number[] = [];
	let node: Element | null = el;
	while (node && node !== document.body) {
		const parentEl: Element | null = node.parentElement;
		if (!parentEl) {
			break;
		}
		parts.unshift(Array.prototype.indexOf.call(parentEl.children, node));
		node = parentEl;
	}
	return parts.length ? `path-${parts.join('-')}` : '';
}

function dcStampAttributesForElement(el: Element): { dcTplId?: string; dcComponentName?: string; dcImportTplId?: string } {
	const stamped = domPathStampTarget(el);
	const tplId = stamped?.getAttribute('data-dc-tpl');
	if (!tplId) {
		return {};
	}
	const host = el.closest('[data-sc-name]');
	const dcName = host?.getAttribute('data-sc-name') ?? dcRootNameFromWindow() ?? undefined;
	const hostTplId = host?.getAttribute('data-dc-tpl');
	const dcImportTplId = host && hostTplId && hostTplId !== tplId ? hostTplId : undefined;
	return { dcTplId: tplId, dcComponentName: dcName, dcImportTplId };
}

function cssEscapeSelectorValue(value: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(value);
	}
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sanitizeInlineStyleValue(value: string): string {
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

function findElementByDomPath(domPath: string): Element | null {
	if (domPath === BODY_DOM_PATH) {
		return document.body;
	}

	const dcMatch = domPath.match(/^dc:([^:]+):tpl-(\d+)$/);
	if (dcMatch) {
		const host = document.querySelector(`[data-sc-name="${cssEscapeSelectorValue(dcMatch[1]!)}"]`);
		const scope: ParentNode = host ?? document.getElementById('dc-root') ?? document;
		return findElementByTplId(scope, dcMatch[2]!);
	}

	const tplMatch = domPath.match(/^tpl-(\d+)$/);
	if (tplMatch) {
		const rootName = dcRootNameFromWindow();
		if (rootName) {
			const host = document.querySelector(`[data-sc-name="${cssEscapeSelectorValue(rootName)}"]`) ?? document.getElementById('dc-root');
			if (host) {
				const scoped = findElementByTplId(host, tplMatch[1]!);
				if (scoped) {
					return scoped;
				}
			}
		}
		return findElementByTplId(document, tplMatch[1]!);
	}

	if (!domPath.startsWith('path-')) {
		return null;
	}
	const parts = domPath.slice('path-'.length).split('-').map(part => Number(part));
	let node: Element | null = document.body;
	for (const idx of parts) {
		if (!node || !Number.isInteger(idx) || idx < 0) {
			return null;
		}
		node = node.children[idx] ?? null;
	}
	return node;
}

function findUniqueElementByTplId(scope: ParentNode, tplId: string): Element | null {
	const matches = scope.querySelectorAll(`[data-dc-tpl="${cssEscapeSelectorValue(tplId)}"]`);
	if (matches.length !== 1) {
		return null;
	}
	return matches[0]!;
}

function findElementByTplId(scope: ParentNode, tplId: string): Element | null {
	const scoped = findUniqueElementByTplId(scope, tplId);
	if (scoped) {
		return scoped;
	}
	if (scope !== document) {
		return findUniqueElementByTplId(document, tplId);
	}
	return null;
}

const HTML_EDIT_DC_CONTAINER_TAGS = new Set(['x-import', 'dc-import', 'deck-stage', 'x-dc', 'sc-if', 'sc-for', 'sc-else']);
const HTML_EDIT_LAYOUT_CONTAINER_TAGS = new Set(['section', 'main', 'nav', 'div', 'article', 'header', 'footer']);
const HTML_EDIT_IGNORABLE_INLINE_CHILD_TAGS = new Set(['br', 'wbr']);

function isStructuralChildTag(tag: string): boolean {
	if (HTML_EDIT_DC_CONTAINER_TAGS.has(tag) || HTML_EDIT_LAYOUT_CONTAINER_TAGS.has(tag)) {
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

function hasEditableTextStructure(element: Element): boolean {
	if (element.childElementCount === 0) {
		return true;
	}
	for (const child of element.children) {
		const tag = child.tagName.toLowerCase();
		if (HTML_EDIT_IGNORABLE_INLINE_CHILD_TAGS.has(tag)) {
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

function hasOnlyEditableTextChildren(element: Element): boolean {
	if (element.childElementCount === 0) {
		return !!(element.textContent ?? '').trim();
	}
	return hasEditableTextStructure(element);
}

function isDcInlineTextContainer(el: Element): boolean {
	if (el.children.length === 0) {
		return false;
	}
	for (const child of el.children) {
		const tag = child.tagName.toLowerCase();
		if (tag === 'br' || tag === 'wbr') {
			continue;
		}
		if (!child.classList.contains('sc-interp')) {
			return false;
		}
		if (child.children.length > 0) {
			return false;
		}
	}
	return true;
}

function elementHasEditableTextMarkup(el: Element): boolean {
	for (const child of el.children) {
		const tag = child.tagName.toLowerCase();
		if (HTML_EDIT_IGNORABLE_INLINE_CHILD_TAGS.has(tag)) {
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

function readEditableElementText(el: Element): string {
	const parts: string[] = [];
	for (const node of el.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			parts.push(node.textContent ?? '');
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const child = node as Element;
			const tag = child.tagName.toLowerCase();
			if (HTML_EDIT_IGNORABLE_INLINE_CHILD_TAGS.has(tag)) {
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

function isLayoutTextEditable(el: Element): boolean {
	const tag = el.tagName.toLowerCase();
	if (!HTML_EDIT_LAYOUT_CONTAINER_TAGS.has(tag)) {
		return false;
	}
	return hasOnlyEditableTextChildren(el);
}

function applyEditableElementText(el: HTMLElement, text: string): void {
	if (!elementHasEditableTextMarkup(el)) {
		el.textContent = text;
		return;
	}
	while (el.firstChild) {
		el.removeChild(el.firstChild);
	}
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (i > 0) {
			el.appendChild(document.createElement('br'));
		}
		if (lines[i]!.length > 0) {
			el.appendChild(document.createTextNode(lines[i]!));
		}
	}
}

function canApplyTextPreview(el: HTMLElement): boolean {
	if (el === document.body) {
		return false;
	}
	return hasEditableTextStructure(el);
}

function applyTextPreview(el: HTMLElement, text: string): void {
	if (isDcInlineTextContainer(el)) {
		const scInterpChildren = [...el.children].filter(child =>
			child.classList.contains('sc-interp') && child.children.length === 0);
		if (scInterpChildren.length === 1) {
			scInterpChildren[0]!.textContent = text;
			return;
		}
	}
	applyEditableElementText(el, text);
}

function camelToKebab(name: string): string {
	return name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

const HTML_EDIT_BORDER_PREVIEW_LONGHANDS = new Set([
	'borderStyle',
	'borderColor',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
]);

const HTML_EDIT_BORDER_INLINE_PROPS = [
	'border',
	'border-width', 'border-style', 'border-color',
	'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
	'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
	'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
] as const;

const HTML_EDIT_BORDER_WIDTH_KEYS = [
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
] as const;

function applyBorderPreviewBatch(el: HTMLElement, styles: Record<string, string>): void {
	for (const prop of HTML_EDIT_BORDER_INLINE_PROPS) {
		el.style.removeProperty(prop);
	}

	const widthValues = HTML_EDIT_BORDER_WIDTH_KEYS
		.filter(key => Object.prototype.hasOwnProperty.call(styles, key))
		.map(key => sanitizeInlineStyleValue(styles[key] ?? ''));
	if (widthValues.length > 0) {
		const first = widthValues[0]!;
		if (widthValues.every(value => value === first)) {
			if (first) {
				el.style.setProperty('border-width', first);
			}
		} else {
			for (const key of HTML_EDIT_BORDER_WIDTH_KEYS) {
				if (!Object.prototype.hasOwnProperty.call(styles, key)) {
					continue;
				}
				const value = sanitizeInlineStyleValue(styles[key] ?? '');
				if (value) {
					el.style.setProperty(camelToKebab(key), value);
				}
			}
		}
	}

	if (Object.prototype.hasOwnProperty.call(styles, 'borderStyle')) {
		const value = sanitizeInlineStyleValue(styles.borderStyle ?? '');
		if (value) {
			el.style.setProperty('border-style', value);
		}
	}

	if (Object.prototype.hasOwnProperty.call(styles, 'borderColor')) {
		const value = sanitizeInlineStyleValue(styles.borderColor ?? '');
		if (value) {
			el.style.setProperty('border-color', value);
		}
	}
}

function caretRangeFromClick(clickEvent: MouseEvent | PointerEvent): Range | null {
	try {
		if (document.caretPositionFromPoint) {
			const position = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
			if (!position) {
				return null;
			}
			const range = document.createRange();
			range.setStart(position.offsetNode, position.offset);
			range.collapse(true);
			return range;
		}
		if (document.caretRangeFromPoint) {
			return document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
		}
	} catch {
		// ignore
	}
	return null;
}

function placeCaretFromClick(clickEvent: MouseEvent | PointerEvent | undefined, el: Element): void {
	let range = clickEvent ? caretRangeFromClick(clickEvent) : null;
	if (!range) {
		range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
	}
	try {
		const selection = window.getSelection();
		if (!selection) {
			return;
		}
		selection.removeAllRanges();
		selection.addRange(range);
	} catch {
		// ignore
	}
}

const HTML_EDIT_INLINE_INPUT_DEBOUNCE_MS = 50;

function ensureHtmlEditPageStyles(): void {
	if (document.getElementById('vscode-html-edit-styles')) {
		return;
	}
	const style = document.createElement('style');
	style.id = 'vscode-html-edit-styles';
	style.textContent = `
		[data-vscode-editing="true"] {
			outline: none !important;
			box-shadow: none !important;
		}
	`;
	document.head.appendChild(style);
}

interface IHtmlEditEditingState {
	readonly active: boolean;
	readonly element?: Element;
}

type HtmlEditEditingChangeCallback = (state: IHtmlEditEditingState) => void;

interface IActiveTextEdit {
	readonly el: HTMLElement;
	readonly domPath: string;
	originalText: string;
	readonly onKey: (ev: Event) => void;
	readonly onInput: (ev: Event) => void;
	inputDebounceHandle: ReturnType<typeof setTimeout> | undefined;
}

/** Inline text editing and live preview for workspace HTML edit mode. */
class HtmlEditBridge {
	private _activeTextEdit: IActiveTextEdit | undefined;

	constructor(
		private readonly _onTextCommit: (payload: { domPath: string; value: string }) => void,
		private readonly _onEditingChange: HtmlEditEditingChangeCallback | undefined,
	) { }

	get activeTextEditElement(): Element | undefined {
		return this._activeTextEdit?.el;
	}

	isEditingElement(el: Element): boolean {
		return this._activeTextEdit?.el === el;
	}

	isEditInteractionTarget(el: Element | undefined): boolean {
		if (!el || !this._activeTextEdit) {
			return false;
		}
		const editing = this._activeTextEdit.el;
		return el === editing || editing.contains(el);
	}

	shouldStartInlineEdit(el: Element): boolean {
		const explicit = el.getAttribute('data-od-edit');
		if (explicit === 'image' || explicit === 'container') {
			return false;
		}
		const tag = el.tagName.toLowerCase();
		if (tag === 'a') {
			return true;
		}
		if (el.children.length > 0 && !hasOnlyEditableTextChildren(el)) {
			return false;
		}
		if (['script', 'style', 'img', 'br', 'hr', 'input', 'textarea', 'select', 'button', 'svg'].includes(tag)) {
			return false;
		}
		if (explicit === 'text' || explicit === 'link') {
			return true;
		}
		if (isLayoutTextEditable(el)) {
			return true;
		}
		return !['section', 'main', 'nav', 'div', 'article', 'header', 'footer'].includes(tag);
	}

	finishActiveTextEdit(commit: boolean): boolean {
		if (!this._activeTextEdit) {
			return false;
		}
		const session = this._activeTextEdit;
		this._activeTextEdit = undefined;
		const el = session.el;
		if (session.inputDebounceHandle !== undefined) {
			clearTimeout(session.inputDebounceHandle);
		}
		el.removeAttribute('contenteditable');
		el.removeAttribute('data-vscode-editing');
		el.removeEventListener('keydown', session.onKey);
		el.removeEventListener('input', session.onInput);
		const value = readEditableElementText(el);
		const changed = value !== session.originalText;
		if (commit && changed) {
			this._onTextCommit({ domPath: session.domPath, value });
		} else if (!commit) {
			applyEditableElementText(el, session.originalText);
		}
		this._onEditingChange?.({ active: false, element: el });
		return true;
	}

	makeEditable(el: Element, clickEvent?: MouseEvent | PointerEvent): void {
		if (!(el instanceof HTMLElement) || el === document.body) {
			return;
		}
		if (this._activeTextEdit?.el === el) {
			if (clickEvent) {
				placeCaretFromClick(clickEvent, el);
			}
			return;
		}
		this.finishActiveTextEdit(true);
		if (el.getAttribute('contenteditable') === 'true') {
			return;
		}
		const originalText = readEditableElementText(el);
		ensureHtmlEditPageStyles();
		el.setAttribute('contenteditable', 'true');
		el.setAttribute('data-vscode-editing', 'true');
		this._onEditingChange?.({ active: true, element: el });
		try {
			el.focus();
		} catch {
			// ignore
		}
		if (clickEvent) {
			placeCaretFromClick(clickEvent, el);
		}
		const domPath = domPathForElement(el);
		const onKey = (ev: Event) => {
			if (!(ev instanceof KeyboardEvent)) {
				return;
			}
			if (ev.key === 'Enter' && !ev.shiftKey) {
				ev.preventDefault();
				this.finishActiveTextEdit(true);
			}
			if (ev.key === 'Escape') {
				ev.preventDefault();
				this.finishActiveTextEdit(false);
			}
		};
		const onInput = () => {
			const active = this._activeTextEdit;
			if (!active) {
				return;
			}
			if (active.inputDebounceHandle !== undefined) {
				clearTimeout(active.inputDebounceHandle);
			}
			active.inputDebounceHandle = setTimeout(() => {
				if (this._activeTextEdit !== active) {
					return;
				}
				active.inputDebounceHandle = undefined;
				this._onTextCommit({ domPath, value: readEditableElementText(el) });
			}, HTML_EDIT_INLINE_INPUT_DEBOUNCE_MS);
		};
		this._activeTextEdit = { el, domPath, originalText, onKey, onInput, inputDebounceHandle: undefined };
		el.addEventListener('keydown', onKey);
		el.addEventListener('input', onInput);
	}

	applyPreview(preview: IBrowserHtmlEditPreview): void {
		const el = findElementByDomPath(preview.domPath);
		if (!(el instanceof HTMLElement)) {
			return;
		}
		if (preview.styles) {
			const hasBorderPreview = Object.keys(preview.styles).some(key => HTML_EDIT_BORDER_PREVIEW_LONGHANDS.has(key));
			if (hasBorderPreview) {
				applyBorderPreviewBatch(el, preview.styles);
			}
			for (const [key, value] of Object.entries(preview.styles)) {
				if (HTML_EDIT_BORDER_PREVIEW_LONGHANDS.has(key)) {
					continue;
				}
				const cssName = camelToKebab(key);
				if (typeof value !== 'string' || value.trim() === '') {
					el.style.removeProperty(cssName);
				} else {
					el.style.setProperty(cssName, sanitizeInlineStyleValue(value));
				}
			}
		}
		if (typeof preview.text === 'string' && el !== document.body) {
			// Programmatic DOM writes do not fire `input`, so the inline edit session cannot
			// echo this preview back as a commit.
			if (canApplyTextPreview(el)) {
				applyTextPreview(el, preview.text);
			} else if (el.childElementCount === 0) {
				el.textContent = preview.text;
			}
			if (this._activeTextEdit?.el === el) {
				this._activeTextEdit.originalText = preview.text;
			}
		}
		if (typeof preview.href === 'string' && el instanceof HTMLAnchorElement) {
			el.href = preview.href;
		}
		if (typeof preview.src === 'string' && el instanceof HTMLImageElement) {
			el.src = preview.src;
		}
		if (typeof preview.alt === 'string' && el instanceof HTMLImageElement) {
			el.alt = preview.alt;
		}
	}
}

const HTML_LAYOUT_EDIT_OUTLINE_BLUE = '#0078d4';
const HTML_LAYOUT_EDIT_OUTLINE_ORANGE = '#ca5010';
const HTML_LAYOUT_EDIT_OUTLINE_SELECTED = '#0078d4';
const HTML_LAYOUT_SELECT_DRAG_THRESHOLD_SQ = 16;
const HTML_LAYOUT_TABLE_COLUMN_DRAG_THRESHOLD_SQ = 1;
// VS Code Codicons trash (16×16)
const HTML_LAYOUT_TRASH_ICON_PATH = 'M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z';
interface IHtmlLayoutGapHit {
	readonly container: HTMLElement;
	readonly axis: 'column' | 'row';
	/** Between adjacent tracks: 0..n-2. */
	readonly index: number;
}

type HtmlLayoutInsertKind = 'gap' | 'prepend' | 'append' | 'nest' | 'slotPrepend' | 'slotAppend';

interface IHtmlLayoutInsertHit {
	readonly kind: HtmlLayoutInsertKind;
	readonly container: HTMLElement;
	readonly axis: 'column' | 'row';
	readonly gapIndex?: number;
	readonly nest?: {
		readonly target: HTMLElement;
		readonly axis: 'column' | 'row';
		readonly edge: 'start' | 'end';
	};
	/** Whole sub-grid slot when inserting relative to parent. */
	readonly slot?: HTMLElement;
}

type HtmlLayoutInsertTier = 'gap' | 'edgeCard' | 'blank' | 'nest';

interface IHtmlLayoutInsertCandidate {
	readonly hit: IHtmlLayoutInsertHit;
	readonly tier: HtmlLayoutInsertTier;
	readonly distanceSq: number;
	readonly depth: number;
}

interface IHtmlLayoutContainerSnapshot {
	readonly style: string;
	readonly tplC: string | null;
	readonly tplR: string | null;
	readonly minC: string | null;
	readonly minR: string | null;
	readonly childOrder: readonly Element[];
}

interface IHtmlLayoutSavePatch {
	readonly domPath: string;
	readonly replaceOuterHtml: string;
}

interface IHtmlLayoutSavePayload {
	readonly patches: readonly IHtmlLayoutSavePatch[];
}

type HtmlLayoutDragKind = 'resize' | 'insert' | 'tableColumnResize';

interface IHtmlLayoutTableColumnHit {
	readonly table: HTMLElement;
	readonly boundaryIndex: number;
}

interface IHtmlLayoutTableColumnGrid {
	readonly columnCount: number;
	readonly resizableBoundaries: readonly boolean[];
}

interface IHtmlLayoutTableSnapshot {
	readonly tableStyle: string;
	readonly colgroupOuterHtml: string | null;
	readonly firstRowCellStyles: readonly string[];
}

interface IHtmlLayoutDragState {
	readonly kind: HtmlLayoutDragKind;
	readonly pointerId: number;
	readonly startX: number;
	readonly startY: number;
	readonly gap?: IHtmlLayoutGapHit;
	readonly startSizes?: readonly number[];
	readonly startTrackTotalPx?: number;
	readonly card?: HTMLElement;
	readonly tableColumn?: IHtmlLayoutTableColumnHit;
	readonly startTableColumnWidths?: readonly number[];
	readonly startTableWidth?: number;
	readonly tablePrepared?: boolean;
}

const HTML_LAYOUT_TABLE_MIN_COL_WIDTH_PX = 24;

function htmlLayoutDeckCanvasScale(): number {
	const deck = document.querySelector('deck-stage');
	const canvas = deck?.shadowRoot?.querySelector('.canvas');
	if (!(canvas instanceof HTMLElement)) {
		return 1;
	}
	const inline = canvas.style.transform;
	const inlineMatch = inline.match(/scale\(([\d.]+)\)/);
	if (inlineMatch) {
		return parseFloat(inlineMatch[1]!) || 1;
	}
	const transform = getComputedStyle(canvas).transform;
	if (!transform || transform === 'none') {
		return 1;
	}
	const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
	if (!matrixMatch) {
		return 1;
	}
	const parts = matrixMatch[1]!.split(',').map(part => parseFloat(part.trim()));
	return parts[0] || 1;
}

function htmlLayoutActiveSlideRoot(): HTMLElement {
	const activeSlide = document.querySelector('section[data-deck-active]');
	if (activeSlide instanceof HTMLElement) {
		return activeSlide;
	}
	const deck = document.querySelector('deck-stage');
	if (deck) {
		for (const child of deck.children) {
			if (child instanceof HTMLElement && child.hasAttribute('data-deck-active')) {
				return child;
			}
		}
	}
	return document.body;
}

function htmlLayoutIsGridContainer(element: Element | null | undefined): element is HTMLElement {
	return element instanceof HTMLElement && element.hasAttribute('data-dc-grid');
}

function htmlLayoutElementFromPoint(clientX: number, clientY: number): Element | null {
	const previous = document.documentElement.style.pointerEvents;
	document.documentElement.style.pointerEvents = 'none';
	let target: Element | null = null;
	try {
		target = document.elementFromPoint(clientX, clientY);
	} finally {
		document.documentElement.style.pointerEvents = previous;
	}
	return target;
}

function htmlLayoutTrackChildren(container: HTMLElement): HTMLElement[] {
	return [...container.children].filter((child): child is HTMLElement => {
		if (!(child instanceof HTMLElement)) {
			return false;
		}
		const position = getComputedStyle(child).position;
		return position !== 'absolute' && position !== 'fixed';
	});
}

function htmlLayoutSortedChildren(container: HTMLElement, axis: 'column' | 'row'): HTMLElement[] {
	return htmlLayoutTrackChildren(container).sort((left, right) => {
		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();
		return axis === 'column' ? leftRect.left - rightRect.left : leftRect.top - rightRect.top;
	});
}

function htmlLayoutTemplateTrackCount(template: string | null | undefined): number {
	if (!template || template === 'none') {
		return 0;
	}
	const repeatMatch = template.match(/repeat\s*\(\s*(\d+)\s*,/i);
	if (repeatMatch) {
		return parseInt(repeatMatch[1]!, 10) || 0;
	}
	return template.split(/\s+/).filter(Boolean).length;
}

function htmlLayoutTrackCount(container: HTMLElement, axis: 'column' | 'row'): number {
	const attr = axis === 'column' ? container.getAttribute('data-tpl-c') : container.getAttribute('data-tpl-r');
	if (attr) {
		const attrCount = htmlLayoutTemplateTrackCount(attr);
		if (attrCount > 0) {
			return attrCount;
		}
	}
	const style = getComputedStyle(container);
	const computed = axis === 'column' ? style.gridTemplateColumns : style.gridTemplateRows;
	const computedCount = htmlLayoutTemplateTrackCount(computed);
	if (computedCount > 0) {
		return computedCount;
	}
	return htmlLayoutTrackChildren(container).length;
}

function htmlLayoutTrackSizesPx(container: HTMLElement, axis: 'column' | 'row'): number[] {
	const trackCount = htmlLayoutTrackCount(container, axis);
	const children = htmlLayoutSortedChildren(container, axis);
	const sizes: number[] = [];
	for (let index = 0; index < trackCount; index++) {
		const child = children[index];
		if (!child) {
			sizes.push(0);
			continue;
		}
		sizes.push(axis === 'column' ? child.offsetWidth : child.offsetHeight);
	}
	return sizes;
}

function htmlLayoutGridGap(container: HTMLElement, axis: 'column' | 'row'): number {
	const style = getComputedStyle(container);
	if (axis === 'column') {
		const columnGap = parseFloat(style.columnGap);
		if (!Number.isNaN(columnGap)) {
			return columnGap;
		}
	} else {
		const rowGap = parseFloat(style.rowGap);
		if (!Number.isNaN(rowGap)) {
			return rowGap;
		}
	}
	const gap = parseFloat(style.gap);
	return Number.isNaN(gap) ? 0 : gap;
}

function htmlLayoutGridContentSize(container: HTMLElement, axis: 'column' | 'row'): number {
	const style = getComputedStyle(container);
	if (axis === 'column') {
		const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
		return container.clientWidth - padding;
	}
	const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
	return container.clientHeight - padding;
}

function htmlLayoutTrackTotalPx(container: HTMLElement, axis: 'column' | 'row'): number {
	const count = htmlLayoutTrackCount(container, axis);
	if (count === 0) {
		return 0;
	}
	const gap = htmlLayoutGridGap(container, axis);
	return htmlLayoutGridContentSize(container, axis) - gap * (count - 1);
}

function htmlLayoutNormalizedTrackSizes(container: HTMLElement, axis: 'column' | 'row'): number[] {
	const sizes = htmlLayoutTrackSizesPx(container, axis);
	if (sizes.length === 0) {
		return sizes;
	}
	const total = htmlLayoutTrackTotalPx(container, axis);
	const sum = sizes.reduce((acc, size) => acc + size, 0);
	const drift = total - sum;
	if (Math.abs(drift) > 0.5) {
		sizes[sizes.length - 1] = (sizes[sizes.length - 1] ?? 0) + drift;
	}
	return sizes;
}

function htmlLayoutAnchorFarTrack(sizes: number[], total: number, mins: readonly number[]): void {
	if (sizes.length === 0) {
		return;
	}
	const lastIndex = sizes.length - 1;
	sizes[lastIndex] = total - sizes.slice(0, lastIndex).reduce((sum, size) => sum + size, 0);
	const lastMin = mins[lastIndex] ?? 0;
	if ((sizes[lastIndex] ?? 0) < lastMin && lastIndex > 0) {
		sizes[lastIndex] = lastMin;
		sizes[lastIndex - 1] = total - lastMin - sizes.slice(0, lastIndex - 1).reduce((sum, size) => sum + size, 0);
	}
}

function htmlLayoutTrackMinsPx(container: HTMLElement, axis: 'column' | 'row'): number[] {
	const trackCount = htmlLayoutTrackCount(container, axis);
	const attr = axis === 'column' ? container.getAttribute('data-min-c') : container.getAttribute('data-min-r');
	const domChildren = htmlLayoutTrackChildren(container);
	const sortedChildren = htmlLayoutSortedChildren(container, axis);
	const attrMins = attr ? attr.split(/\s+/).map(part => parseFloat(part) || 0) : [];
	while (attrMins.length < trackCount) {
		attrMins.push(0);
	}
	const mins: number[] = [];
	for (let index = 0; index < trackCount; index++) {
		const child = sortedChildren[index];
		if (!child) {
			mins.push(attrMins[index] ?? 0);
			continue;
		}
		const domIndex = domChildren.indexOf(child);
		mins.push(domIndex >= 0 ? (attrMins[domIndex] ?? attrMins[index] ?? 0) : (attrMins[index] ?? 0));
	}
	return mins;
}

function htmlLayoutGapHitSlopPx(): number {
	return 6 / htmlLayoutDeckCanvasScale();
}

function htmlLayoutGapHitMinPx(): number {
	return 8 / htmlLayoutDeckCanvasScale();
}

function htmlLayoutAreTracksAdjacent(axis: 'column' | 'row', beforeRect: DOMRect, afterRect: DOMRect): boolean {
	const maxGapPx = 200;
	if (axis === 'column') {
		const gap = afterRect.left - beforeRect.right;
		if (gap < -2 || gap > maxGapPx) {
			return false;
		}
		const overlapY = Math.min(beforeRect.bottom, afterRect.bottom) - Math.max(beforeRect.top, afterRect.top);
		return overlapY > 0;
	}
	const gap = afterRect.top - beforeRect.bottom;
	if (gap < -2 || gap > maxGapPx) {
		return false;
	}
	const overlapX = Math.min(beforeRect.right, afterRect.right) - Math.max(beforeRect.left, afterRect.left);
	return overlapX > 0;
}

interface IHtmlLayoutGapBounds {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

function htmlLayoutContainerContentRect(container: HTMLElement): { left: number; top: number; right: number; bottom: number } {
	const rect = container.getBoundingClientRect();
	const style = getComputedStyle(container);
	const padLeft = parseFloat(style.paddingLeft) || 0;
	const padTop = parseFloat(style.paddingTop) || 0;
	const padRight = parseFloat(style.paddingRight) || 0;
	const padBottom = parseFloat(style.paddingBottom) || 0;
	return {
		left: rect.left + padLeft,
		top: rect.top + padTop,
		right: rect.right - padRight,
		bottom: rect.bottom - padBottom,
	};
}

function htmlLayoutChildrenSpan(sorted: readonly HTMLElement[]): { top: number; bottom: number; left: number; right: number } {
	let top = Infinity;
	let bottom = -Infinity;
	let left = Infinity;
	let right = -Infinity;
	for (const child of sorted) {
		const rect = child.getBoundingClientRect();
		top = Math.min(top, rect.top);
		bottom = Math.max(bottom, rect.bottom);
		left = Math.min(left, rect.left);
		right = Math.max(right, rect.right);
	}
	return { top, bottom, left, right };
}

function htmlLayoutPointerRectStripDistance(clientX: number, clientY: number, strip: IHtmlLayoutGapBounds, slop: number): number {
	const left = strip.left - slop;
	const right = strip.left + strip.width + slop;
	const top = strip.top - slop;
	const bottom = strip.top + strip.height + slop;
	if (clientX < left) {
		return left - clientX;
	}
	if (clientX > right) {
		return clientX - right;
	}
	if (clientY < top) {
		return top - clientY;
	}
	if (clientY > bottom) {
		return clientY - bottom;
	}
	return 0;
}

function htmlLayoutEdgeInsertStrip(
	container: HTMLElement,
	axis: 'column' | 'row',
	edge: 'start' | 'end',
	sorted: readonly HTMLElement[],
): IHtmlLayoutGapBounds | null {
	if (sorted.length === 0) {
		return null;
	}
	const content = htmlLayoutContainerContentRect(container);
	const span = htmlLayoutChildrenSpan(sorted);
	const minHit = htmlLayoutGapHitMinPx();
	if (axis === 'column') {
		const first = sorted[0]!.getBoundingClientRect();
		const last = sorted[sorted.length - 1]!.getBoundingClientRect();
		if (edge === 'start') {
			const stripRight = first.left;
			const stripLeft = Math.min(content.left, stripRight - minHit);
			return { left: stripLeft, top: span.top, width: Math.max(stripRight - stripLeft, minHit), height: span.bottom - span.top };
		}
		const stripLeft = last.right;
		const stripRight = Math.max(content.right, stripLeft + minHit);
		return { left: stripLeft, top: span.top, width: Math.max(stripRight - stripLeft, minHit), height: span.bottom - span.top };
	}
	const first = sorted[0]!.getBoundingClientRect();
	const last = sorted[sorted.length - 1]!.getBoundingClientRect();
	if (edge === 'start') {
		const stripBottom = first.top;
		const stripTop = Math.min(content.top, stripBottom - minHit);
		return { left: span.left, top: stripTop, width: span.right - span.left, height: Math.max(stripBottom - stripTop, minHit) };
	}
	const stripTop = last.bottom;
	const stripBottom = Math.max(content.bottom, stripTop + minHit);
	return { left: span.left, top: stripTop, width: span.right - span.left, height: Math.max(stripBottom - stripTop, minHit) };
}

function htmlLayoutOuterEdgeHitPx(): number {
	return 8 / htmlLayoutDeckCanvasScale();
}

function htmlLayoutPrimaryInsertAxis(container: HTMLElement): 'column' | 'row' {
	const rowCount = htmlLayoutTrackCount(container, 'row');
	const colCount = htmlLayoutTrackCount(container, 'column');
	if (rowCount !== colCount) {
		return rowCount > colCount ? 'row' : 'column';
	}
	return 'column';
}

function htmlLayoutIsSlideRootGrid(grid: HTMLElement): boolean {
	return grid.tagName === 'MAIN' && grid.hasAttribute('data-dc-grid');
}

function htmlLayoutPointerInElementRect(clientX: number, clientY: number, rect: DOMRect): boolean {
	return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function htmlLayoutDeepestGridAt(clientX: number, clientY: number): HTMLElement | null {
	const root = htmlLayoutActiveSlideRoot();
	let deepest: HTMLElement | null = null;
	let maxDepth = -1;
	for (const grid of htmlLayoutListGridsInSlide(root)) {
		const content = htmlLayoutContainerContentRect(grid);
		if (clientX < content.left || clientX > content.right || clientY < content.top || clientY > content.bottom) {
			continue;
		}
		const depth = htmlLayoutGridNestingDepth(grid);
		if (depth > maxDepth) {
			maxDepth = depth;
			deepest = grid;
		}
	}
	return deepest;
}

function htmlLayoutPointerOnAnyTrackChild(clientX: number, clientY: number, container: HTMLElement): boolean {
	for (const child of htmlLayoutTrackChildren(container)) {
		if (htmlLayoutPointerInElementRect(clientX, clientY, child.getBoundingClientRect())) {
			return true;
		}
	}
	return false;
}

type HtmlLayoutCardOuterEdgeHit =
	| { readonly mode: 'primary'; readonly edge: 'start' | 'end' }
	| { readonly mode: 'secondary'; readonly edge: 'start' | 'end' };

function htmlLayoutPointerOnEdgeCardOuterEdge(
	card: HTMLElement,
	container: HTMLElement,
	clientX: number,
	clientY: number,
): HtmlLayoutCardOuterEdgeHit | null {
	const primary = htmlLayoutPrimaryInsertAxis(container);
	const sorted = htmlLayoutSortedChildren(container, primary);
	const index = sorted.indexOf(card);
	if (index < 0) {
		return null;
	}
	const isFirst = index === 0;
	const isLast = index === sorted.length - 1;
	if (!isFirst && !isLast) {
		return null;
	}
	const rect = card.getBoundingClientRect();
	const hit = htmlLayoutOuterEdgeHitPx();
	if (!htmlLayoutPointerInElementRect(clientX, clientY, rect)) {
		return null;
	}
	if (primary === 'column') {
		if (isFirst && clientX >= rect.left && clientX <= rect.left + hit) {
			return { mode: 'primary', edge: 'start' };
		}
		if (isLast && clientX >= rect.right - hit && clientX <= rect.right) {
			return { mode: 'primary', edge: 'end' };
		}
		if ((isFirst || isLast) && clientY >= rect.top && clientY <= rect.top + hit) {
			return { mode: 'secondary', edge: 'start' };
		}
		if ((isFirst || isLast) && clientY >= rect.bottom - hit && clientY <= rect.bottom) {
			return { mode: 'secondary', edge: 'end' };
		}
		return null;
	}
	if (isFirst && clientY >= rect.top && clientY <= rect.top + hit) {
		return { mode: 'primary', edge: 'start' };
	}
	if (isLast && clientY >= rect.bottom - hit && clientY <= rect.bottom) {
		return { mode: 'primary', edge: 'end' };
	}
	if ((isFirst || isLast) && clientX >= rect.left && clientX <= rect.left + hit) {
		return { mode: 'secondary', edge: 'start' };
	}
	if ((isFirst || isLast) && clientX >= rect.right - hit && clientX <= rect.right) {
		return { mode: 'secondary', edge: 'end' };
	}
	return null;
}

function htmlLayoutCardNestFromPointer(
	card: HTMLElement,
	clientX: number,
	clientY: number,
): { readonly axis: 'column' | 'row'; readonly edge: 'start' | 'end' } | null {
	const rect = card.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return null;
	}
	const nx = (clientX - rect.left) / rect.width;
	const ny = (clientY - rect.top) / rect.height;
	if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
		return null;
	}
	let quadrant: 'top' | 'bottom' | 'left' | 'right';
	if (ny < nx && ny < 1 - nx) {
		quadrant = 'top';
	} else if (ny > nx && ny > 1 - nx) {
		quadrant = 'bottom';
	} else if (ny < 1 - nx && ny > nx) {
		quadrant = 'left';
	} else if (ny > 1 - nx && ny < nx) {
		quadrant = 'right';
	} else if (nx < 0.5) {
		quadrant = 'left';
	} else if (nx > 0.5) {
		quadrant = 'right';
	} else if (ny < 0.5) {
		quadrant = 'top';
	} else {
		quadrant = 'bottom';
	}
	switch (quadrant) {
		case 'top':
			return { axis: 'row', edge: 'start' };
		case 'bottom':
			return { axis: 'row', edge: 'end' };
		case 'left':
			return { axis: 'column', edge: 'start' };
		default:
			return { axis: 'column', edge: 'end' };
	}
}

function htmlLayoutNestInsertPreviewBounds(hit: IHtmlLayoutInsertHit): IHtmlLayoutGapBounds | null {
	const nest = hit.nest;
	if (!nest) {
		return null;
	}
	const rect = nest.target.getBoundingClientRect();
	if (nest.axis === 'column') {
		if (nest.edge === 'start') {
			return { left: rect.left, top: rect.top, width: rect.width / 2, height: rect.height };
		}
		return { left: rect.left + rect.width / 2, top: rect.top, width: rect.width / 2, height: rect.height };
	}
	if (nest.edge === 'start') {
		return { left: rect.left, top: rect.top, width: rect.width, height: rect.height / 2 };
	}
	return { left: rect.left, top: rect.top + rect.height / 2, width: rect.width, height: rect.height / 2 };
}

function htmlLayoutInsertPreviewBounds(hit: IHtmlLayoutInsertHit): IHtmlLayoutGapBounds | null {
	if (hit.kind === 'nest') {
		return htmlLayoutNestInsertPreviewBounds(hit);
	}
	const sorted = htmlLayoutSortedChildren(hit.container, hit.axis);
	if (sorted.length === 0) {
		return null;
	}
	if (hit.kind === 'gap' && hit.gapIndex !== undefined) {
		const before = sorted[hit.gapIndex];
		const after = sorted[hit.gapIndex + 1];
		if (!before || !after) {
			return null;
		}
		return htmlLayoutGapBounds(hit.axis, before.getBoundingClientRect(), after.getBoundingClientRect());
	}
	if (hit.kind === 'prepend' || hit.kind === 'slotPrepend') {
		return htmlLayoutEdgeInsertStrip(hit.container, hit.axis, 'start', sorted);
	}
	if (hit.kind === 'append' || hit.kind === 'slotAppend') {
		return htmlLayoutEdgeInsertStrip(hit.container, hit.axis, 'end', sorted);
	}
	return null;
}

function htmlLayoutGapBounds(axis: 'column' | 'row', beforeRect: DOMRect, afterRect: DOMRect): IHtmlLayoutGapBounds {
	const minHit = htmlLayoutGapHitMinPx();
	if (axis === 'column') {
		const gapLeft = beforeRect.right;
		const gapRight = afterRect.left;
		const top = Math.min(beforeRect.top, afterRect.top);
		const bottom = Math.max(beforeRect.bottom, afterRect.bottom);
		const gapWidth = gapRight - gapLeft;
		if (gapWidth >= minHit) {
			return { left: gapLeft, top, width: gapWidth, height: bottom - top };
		}
		const centerX = (gapLeft + gapRight) / 2;
		return { left: centerX - minHit / 2, top, width: minHit, height: bottom - top };
	}
	const gapTop = beforeRect.bottom;
	const gapBottom = afterRect.top;
	const left = Math.min(beforeRect.left, afterRect.left);
	const right = Math.max(beforeRect.right, afterRect.right);
	const gapHeight = gapBottom - gapTop;
	if (gapHeight >= minHit) {
		return { left, top: gapTop, width: right - left, height: gapHeight };
	}
	const centerY = (gapTop + gapBottom) / 2;
	return { left, top: centerY - minHit / 2, width: right - left, height: minHit };
}

function htmlLayoutPointerGapDistance(clientX: number, clientY: number, axis: 'column' | 'row', beforeRect: DOMRect, afterRect: DOMRect, slop: number): number {
	const minHit = htmlLayoutGapHitMinPx();
	if (axis === 'column') {
		const gapLeft = beforeRect.right;
		const gapRight = afterRect.left;
		const top = Math.min(beforeRect.top, afterRect.top) - slop;
		const bottom = Math.max(beforeRect.bottom, afterRect.bottom) + slop;
		if (clientY < top || clientY > bottom) {
			return Infinity;
		}
		const gapWidth = gapRight - gapLeft;
		let left: number;
		let right: number;
		if (gapWidth >= minHit) {
			left = gapLeft;
			right = gapRight;
		} else {
			const centerX = (gapLeft + gapRight) / 2;
			left = centerX - minHit / 2;
			right = centerX + minHit / 2;
		}
		left -= slop;
		right += slop;
		if (clientX < left) {
			return left - clientX;
		}
		if (clientX > right) {
			return clientX - right;
		}
		return 0;
	}
	const gapTop = beforeRect.bottom;
	const gapBottom = afterRect.top;
	const left = Math.min(beforeRect.left, afterRect.left) - slop;
	const right = Math.max(beforeRect.right, afterRect.right) + slop;
	if (clientX < left || clientX > right) {
		return Infinity;
	}
	const gapHeight = gapBottom - gapTop;
	let top: number;
	let bottom: number;
	if (gapHeight >= minHit) {
		top = gapTop;
		bottom = gapBottom;
	} else {
		const centerY = (gapTop + gapBottom) / 2;
		top = centerY - minHit / 2;
		bottom = centerY + minHit / 2;
	}
	top -= slop;
	bottom += slop;
	if (clientY < top) {
		return top - clientY;
	}
	if (clientY > bottom) {
		return clientY - bottom;
	}
	return 0;
}

interface IHtmlLayoutGapCandidate {
	readonly hit: IHtmlLayoutGapHit;
	readonly distanceSq: number;
}

function htmlLayoutIsBetterInsertCandidate(candidate: IHtmlLayoutInsertCandidate, best: IHtmlLayoutInsertCandidate | undefined): boolean {
	if (!best) {
		return true;
	}
	const priority = (value: IHtmlLayoutInsertCandidate): [number, number, number] => {
		let tierRank: number;
		if (value.tier === 'gap' && value.distanceSq === 0) {
			tierRank = 0;
		} else if (value.tier === 'edgeCard') {
			tierRank = 1;
		} else if (value.tier === 'blank') {
			tierRank = 2;
		} else if (value.tier === 'gap') {
			tierRank = 3;
		} else {
			tierRank = 4;
		}
		return [tierRank, value.distanceSq, -value.depth];
	};
	const next = priority(candidate);
	const prev = priority(best);
	for (let index = 0; index < next.length; index++) {
		if (next[index]! < prev[index]!) {
			return true;
		}
		if (next[index]! > prev[index]!) {
			return false;
		}
	}
	return false;
}

function htmlLayoutListGridsInSlide(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll('[data-dc-grid]')].filter((element): element is HTMLElement => element instanceof HTMLElement);
}

function htmlLayoutGridNestingDepth(grid: HTMLElement): number {
	let depth = 0;
	let parent = grid.parentElement;
	while (parent) {
		if (htmlLayoutIsGridContainer(parent)) {
			depth++;
		}
		parent = parent.parentElement;
	}
	return depth;
}

function htmlLayoutFindCardAt(clientX: number, clientY: number): HTMLElement | null {
	for (let node = htmlLayoutElementFromPoint(clientX, clientY); node; node = node.parentElement) {
		const parent = node.parentElement;
		if (!parent || !htmlLayoutIsGridContainer(parent)) {
			continue;
		}
		let card: Element = node;
		while (card.parentElement && card.parentElement !== parent) {
			card = card.parentElement;
		}
		if (card instanceof HTMLElement && htmlLayoutTrackChildren(parent).includes(card)) {
			return card;
		}
	}
	return null;
}

function htmlLayoutBestGapInContainer(container: HTMLElement, clientX: number, clientY: number, maxDistancePx: number): IHtmlLayoutGapCandidate | null {
	const slop = htmlLayoutGapHitSlopPx();
	let best: IHtmlLayoutGapCandidate | undefined;

	for (const axis of ['column', 'row'] as const) {
		if (htmlLayoutTrackCount(container, axis) < 2) {
			continue;
		}
		const sorted = htmlLayoutSortedChildren(container, axis);
		const pairCount = Math.min(sorted.length, htmlLayoutTrackCount(container, axis)) - 1;
		for (let index = 0; index < pairCount; index++) {
			const before = sorted[index];
			const after = sorted[index + 1];
			if (!before || !after) {
				continue;
			}
			const beforeRect = before.getBoundingClientRect();
			const afterRect = after.getBoundingClientRect();
			if (!htmlLayoutAreTracksAdjacent(axis, beforeRect, afterRect)) {
				continue;
			}
			const distance = htmlLayoutPointerGapDistance(clientX, clientY, axis, beforeRect, afterRect, slop);
			if (!Number.isFinite(distance) || distance > maxDistancePx) {
				continue;
			}
			const candidate: IHtmlLayoutGapCandidate = {
				hit: { container, axis, index },
				distanceSq: distance * distance,
			};
			if (!best || candidate.distanceSq < best.distanceSq) {
				best = candidate;
			}
		}
	}
	return best ?? null;
}

function htmlLayoutBestEdgeInsertInContainer(
	container: HTMLElement,
	clientX: number,
	clientY: number,
	maxDistancePx: number,
	primaryAxisOnly = false,
): IHtmlLayoutGapCandidate | null {
	const slop = htmlLayoutGapHitSlopPx();
	let best: IHtmlLayoutGapCandidate | undefined;
	const axes = primaryAxisOnly ? [htmlLayoutPrimaryInsertAxis(container)] : (['column', 'row'] as const);

	for (const axis of axes) {
		const sorted = htmlLayoutSortedChildren(container, axis);
		if (sorted.length === 0) {
			continue;
		}
		for (const edge of ['start', 'end'] as const) {
			const strip = htmlLayoutEdgeInsertStrip(container, axis, edge, sorted);
			if (!strip) {
				continue;
			}
			const distance = htmlLayoutPointerRectStripDistance(clientX, clientY, strip, slop);
			if (!Number.isFinite(distance) || distance > maxDistancePx) {
				continue;
			}
			const index = edge === 'start' ? -1 : sorted.length - 1;
			const candidate: IHtmlLayoutGapCandidate = {
				hit: { container, axis, index },
				distanceSq: distance * distance,
			};
			if (!best || candidate.distanceSq < best.distanceSq) {
				best = candidate;
			}
		}
	}
	return best ?? null;
}

function htmlLayoutEdgeCardInsertAtPointer(clientX: number, clientY: number, draggedCard: HTMLElement | undefined): IHtmlLayoutInsertCandidate | null {
	if (!draggedCard) {
		return null;
	}
	const target = htmlLayoutFindCardAt(clientX, clientY);
	if (!target || target === draggedCard || draggedCard.contains(target) || target.contains(draggedCard)) {
		return null;
	}
	const container = target.parentElement;
	if (!container || !htmlLayoutIsGridContainer(container)) {
		return null;
	}
	const outerEdge = htmlLayoutPointerOnEdgeCardOuterEdge(target, container, clientX, clientY);
	if (!outerEdge) {
		return null;
	}
	const primary = htmlLayoutPrimaryInsertAxis(container);
	if (outerEdge.mode === 'primary') {
		return {
			hit: {
				kind: outerEdge.edge === 'start' ? 'prepend' : 'append',
				container,
				axis: primary,
			},
			tier: 'edgeCard',
			distanceSq: 0,
			depth: htmlLayoutGridNestingDepth(container),
		};
	}
	const parent = container.parentElement;
	if (!parent || !htmlLayoutIsGridContainer(parent)) {
		return null;
	}
	return {
		hit: {
			kind: outerEdge.edge === 'start' ? 'slotPrepend' : 'slotAppend',
			container: parent,
			axis: htmlLayoutPrimaryInsertAxis(parent),
			slot: container,
		},
		tier: 'edgeCard',
		distanceSq: 0,
		depth: htmlLayoutGridNestingDepth(parent),
	};
}

function htmlLayoutBlankInsertAtPointer(clientX: number, clientY: number, maxDistancePx: number): IHtmlLayoutInsertCandidate | null {
	const container = htmlLayoutDeepestGridAt(clientX, clientY);
	if (!container) {
		return null;
	}
	if (htmlLayoutPointerOnAnyTrackChild(clientX, clientY, container)) {
		return null;
	}
	const axis = htmlLayoutPrimaryInsertAxis(container);
	const edge = htmlLayoutBestEdgeInsertInContainer(container, clientX, clientY, maxDistancePx, true);
	if (!edge) {
		return null;
	}
	return {
		hit: {
			kind: edge.hit.index === -1 ? 'prepend' : 'append',
			container,
			axis,
		},
		tier: 'blank',
		distanceSq: edge.distanceSq,
		depth: htmlLayoutGridNestingDepth(container),
	};
}

function htmlLayoutNestInsertAtPointer(clientX: number, clientY: number, draggedCard: HTMLElement | undefined): IHtmlLayoutInsertCandidate | null {
	if (!draggedCard) {
		return null;
	}
	const target = htmlLayoutFindCardAt(clientX, clientY);
	if (!target || target === draggedCard || draggedCard.contains(target) || target.contains(draggedCard)) {
		return null;
	}
	const container = target.parentElement;
	if (!container || !htmlLayoutIsGridContainer(container)) {
		return null;
	}
	if (htmlLayoutPointerOnEdgeCardOuterEdge(target, container, clientX, clientY)) {
		return null;
	}
	const nest = htmlLayoutCardNestFromPointer(target, clientX, clientY);
	if (!nest) {
		return null;
	}
	return {
		hit: {
			kind: 'nest',
			container,
			axis: nest.axis,
			nest: { target, axis: nest.axis, edge: nest.edge },
		},
		tier: 'nest',
		distanceSq: 0,
		depth: htmlLayoutGridNestingDepth(container) + 1,
	};
}

function htmlLayoutCollapseGridContainers(root: HTMLElement): HTMLElement[] {
	const affected: HTMLElement[] = [];
	let changed = true;
	while (changed) {
		changed = false;
		for (const grid of [...htmlLayoutListGridsInSlide(root)]) {
			if (htmlLayoutIsSlideRootGrid(grid)) {
				continue;
			}
			const children = htmlLayoutTrackChildren(grid);
			const parent = grid.parentElement;
			if (children.length === 0) {
				grid.remove();
				if (parent && htmlLayoutIsGridContainer(parent)) {
					affected.push(parent);
				}
				changed = true;
				continue;
			}
			if (children.length === 1 && parent) {
				const child = children[0]!;
				parent.insertBefore(child, grid);
				grid.remove();
				if (htmlLayoutIsGridContainer(parent)) {
					htmlLayoutRetune(parent);
					affected.push(parent);
				}
				changed = true;
			}
		}
	}
	return affected;
}

function htmlLayoutCreateSubGrid(axis: 'column' | 'row'): HTMLElement {
	const grid = document.createElement('div');
	grid.setAttribute('data-dc-grid', '');
	grid.setAttribute(axis === 'column' ? 'data-tpl-c' : 'data-tpl-r', '1fr 1fr');
	grid.style.display = 'grid';
	grid.style.minHeight = '0';
	grid.style.minWidth = '0';
	if (axis === 'column') {
		grid.style.gridTemplateColumns = '1fr 1fr';
	} else {
		grid.style.gridTemplateRows = '1fr 1fr';
	}
	return grid;
}

/** Resize / hover: pointer must be inside the gap strip (not merely closest to it). */
function htmlLayoutHitTestGapForResize(clientX: number, clientY: number): IHtmlLayoutGapHit | null {
	let best: IHtmlLayoutGapCandidate | undefined;
	for (let node = htmlLayoutElementFromPoint(clientX, clientY); node; node = node.parentElement) {
		if (!htmlLayoutIsGridContainer(node)) {
			continue;
		}
		const candidate = htmlLayoutBestGapInContainer(node, clientX, clientY, 0);
		if (candidate && (!best || candidate.distanceSq < best.distanceSq)) {
			best = candidate;
		}
	}
	return best?.hit ?? null;
}

/** Priority: gap > edge card > blank > gap(slop) > diagonal nest. */
function htmlLayoutHitTestForInsert(clientX: number, clientY: number, draggedCard?: HTMLElement): IHtmlLayoutInsertHit | null {
	const slop = htmlLayoutGapHitSlopPx();
	const root = htmlLayoutActiveSlideRoot();
	let best: IHtmlLayoutInsertCandidate | undefined;

	for (const container of htmlLayoutListGridsInSlide(root)) {
		const gap = htmlLayoutBestGapInContainer(container, clientX, clientY, slop);
		if (!gap) {
			continue;
		}
		const candidate: IHtmlLayoutInsertCandidate = {
			hit: {
				kind: 'gap',
				container,
				axis: gap.hit.axis,
				gapIndex: gap.hit.index,
			},
			tier: 'gap',
			distanceSq: gap.distanceSq,
			depth: htmlLayoutGridNestingDepth(container),
		};
		if (htmlLayoutIsBetterInsertCandidate(candidate, best)) {
			best = candidate;
		}
	}

	const edgeCard = htmlLayoutEdgeCardInsertAtPointer(clientX, clientY, draggedCard);
	if (edgeCard && htmlLayoutIsBetterInsertCandidate(edgeCard, best)) {
		best = edgeCard;
	}

	const blank = htmlLayoutBlankInsertAtPointer(clientX, clientY, slop);
	if (blank && htmlLayoutIsBetterInsertCandidate(blank, best)) {
		best = blank;
	}

	const nest = htmlLayoutNestInsertAtPointer(clientX, clientY, draggedCard);
	if (nest && htmlLayoutIsBetterInsertCandidate(nest, best)) {
		best = nest;
	}

	return best?.hit ?? null;
}

function htmlLayoutRetune(container: HTMLElement): void {
	const count = htmlLayoutTrackChildren(container).length;
	if (count === 0) {
		return;
	}
	const template = Array.from({ length: count }, () => '1fr').join(' ');
	const rowCount = htmlLayoutTrackCount(container, 'row');
	const colCount = htmlLayoutTrackCount(container, 'column');
	if (rowCount > colCount && rowCount >= 2) {
		container.style.gridTemplateRows = template;
		container.setAttribute('data-tpl-r', template);
		container.removeAttribute('data-min-r');
		return;
	}
	container.style.gridTemplateColumns = template;
	container.setAttribute('data-tpl-c', template);
	container.removeAttribute('data-min-c');
}

function htmlLayoutApplyTrackSizes(container: HTMLElement, axis: 'column' | 'row', sizesPx: readonly number[], mins?: readonly number[], totalPx?: number): void {
	const trackMins = mins ?? htmlLayoutTrackMinsPx(container, axis);
	const count = Math.min(sizesPx.length, htmlLayoutTrackCount(container, axis));
	const total = totalPx ?? htmlLayoutTrackTotalPx(container, axis);
	const rounded: number[] = [];
	for (let index = 0; index < count - 1; index++) {
		rounded.push(Math.max(trackMins[index] ?? 0, Math.round(sizesPx[index] ?? 0)));
	}
	if (count > 0) {
		const lastMin = trackMins[count - 1] ?? 0;
		const othersSum = rounded.reduce((sum, size) => sum + size, 0);
		rounded.push(Math.max(lastMin, total - othersSum));
	}
	const template = rounded.map(size => `${size}px`).join(' ');
	if (axis === 'column') {
		container.style.gridTemplateColumns = template;
		container.setAttribute('data-tpl-c', template);
	} else {
		container.style.gridTemplateRows = template;
		container.setAttribute('data-tpl-r', template);
	}
}

function htmlLayoutSnapshotContainer(container: HTMLElement): IHtmlLayoutContainerSnapshot {
	return {
		style: container.getAttribute('style') ?? '',
		tplC: container.getAttribute('data-tpl-c'),
		tplR: container.getAttribute('data-tpl-r'),
		minC: container.getAttribute('data-min-c'),
		minR: container.getAttribute('data-min-r'),
		childOrder: [...container.children],
	};
}

function htmlLayoutRestoreContainer(container: HTMLElement, snapshot: IHtmlLayoutContainerSnapshot): void {
	if (snapshot.style) {
		container.setAttribute('style', snapshot.style);
	} else {
		container.removeAttribute('style');
	}
	for (const [attr, value] of [
		['data-tpl-c', snapshot.tplC],
		['data-tpl-r', snapshot.tplR],
		['data-min-c', snapshot.minC],
		['data-min-r', snapshot.minR],
	] as const) {
		if (value === null) {
			container.removeAttribute(attr);
		} else {
			container.setAttribute(attr, value);
		}
	}
	for (const child of snapshot.childOrder) {
		container.appendChild(child);
	}
}

function htmlLayoutSnapshotsEqual(left: IHtmlLayoutContainerSnapshot, right: IHtmlLayoutContainerSnapshot): boolean {
	if (left.style !== right.style || left.tplC !== right.tplC || left.tplR !== right.tplR || left.minC !== right.minC || left.minR !== right.minR) {
		return false;
	}
	if (left.childOrder.length !== right.childOrder.length) {
		return false;
	}
	for (let index = 0; index < left.childOrder.length; index++) {
		if (left.childOrder[index] !== right.childOrder[index]) {
			return false;
		}
	}
	return true;
}

function htmlLayoutSaveRoot(): HTMLElement | null {
	const root = htmlLayoutActiveSlideRoot();
	const main = root.querySelector('main[data-dc-grid]');
	return main instanceof HTMLElement ? main : null;
}

function htmlLayoutDomPathForSaveTarget(element: HTMLElement): string {
	const stamped = domPathStampTarget(element);
	const tplId = stamped?.getAttribute('data-dc-tpl') ?? element.getAttribute('data-dc-tpl');
	if (tplId) {
		const attrs = dcStampAttributesForElement(element);
		if (attrs.dcComponentName) {
			return `dc:${attrs.dcComponentName}:tpl-${tplId}`;
		}
		return `tpl-${tplId}`;
	}
	return domPathForElement(element);
}

function htmlLayoutStripRuntimeAttributes(root: Element): void {
	root.removeAttribute('data-vscode-layout-insert-preview');
	for (const element of root.querySelectorAll('[data-dc-tpl], [data-vscode-layout-insert-preview]')) {
		element.removeAttribute('data-dc-tpl');
		element.removeAttribute('data-vscode-layout-insert-preview');
	}
	for (const element of root.querySelectorAll('[style]')) {
		if (element instanceof HTMLElement) {
			element.style.removeProperty('outline');
			element.style.removeProperty('outline-offset');
		}
	}
}

function htmlLayoutIsTableElement(element: Element | null | undefined): element is HTMLElement {
	if (!(element instanceof HTMLElement)) {
		return false;
	}
	const tag = element.tagName.toLowerCase();
	return tag === 'table' || tag === 'sc-raw-table';
}

function htmlLayoutTableRows(table: HTMLElement): HTMLTableRowElement[] {
	if (table instanceof HTMLTableElement) {
		return [...table.rows];
	}
	return [...table.querySelectorAll('tr')].filter((row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement);
}

function htmlLayoutBuildTableCellGrid(table: HTMLElement): { readonly columnCount: number; readonly cellGrid: HTMLTableCellElement[][] } | null {
	const rows = htmlLayoutTableRows(table);
	if (rows.length === 0) {
		return null;
	}

	const cellGrid: HTMLTableCellElement[][] = [];
	let columnCount = 0;

	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex]!;
		if (!cellGrid[rowIndex]) {
			cellGrid[rowIndex] = [];
		}
		let colIndex = 0;
		for (const cell of [...row.cells]) {
			while (cellGrid[rowIndex]![colIndex]) {
				colIndex++;
			}
			const colspan = cell.colSpan || 1;
			const rowspan = cell.rowSpan || 1;
			for (let rowOffset = 0; rowOffset < rowspan; rowOffset++) {
				for (let colOffset = 0; colOffset < colspan; colOffset++) {
					const targetRow = rowIndex + rowOffset;
					const targetCol = colIndex + colOffset;
					if (!cellGrid[targetRow]) {
						cellGrid[targetRow] = [];
					}
					cellGrid[targetRow]![targetCol] = cell;
				}
			}
			colIndex += colspan;
		}
		columnCount = Math.max(columnCount, colIndex);
	}

	if (columnCount < 2) {
		return null;
	}

	for (const row of cellGrid) {
		if (row.length !== columnCount) {
			return null;
		}
		for (let col = 0; col < columnCount; col++) {
			if (!row[col]) {
				return null;
			}
		}
	}

	return { columnCount, cellGrid };
}

function htmlLayoutBuildTableColumnGrid(table: HTMLElement): IHtmlLayoutTableColumnGrid | null {
	const built = htmlLayoutBuildTableCellGrid(table);
	if (!built) {
		return null;
	}
	const { columnCount, cellGrid } = built;
	const resizableBoundaries: boolean[] = [];
	for (let boundary = 0; boundary < columnCount - 1; boundary++) {
		let resizable = true;
		for (const row of cellGrid) {
			if (row[boundary] === row[boundary + 1]) {
				resizable = false;
				break;
			}
		}
		resizableBoundaries.push(resizable);
	}
	if (!resizableBoundaries.some(Boolean)) {
		return null;
	}
	return { columnCount, resizableBoundaries };
}

function htmlLayoutEnsureTableLayoutFixed(table: HTMLElement): void {
	table.style.tableLayout = 'fixed';
}

function htmlLayoutMeasureTableColumnWidthsFromCells(cellGrid: readonly (readonly HTMLTableCellElement[])[], columnCount: number): number[] {
	const widths = new Array<number>(columnCount).fill(0);
	for (let col = 0; col < columnCount; col++) {
		for (const row of cellGrid) {
			const cell = row[col]!;
			const colspan = cell.colSpan || 1;
			const perColumn = cell.getBoundingClientRect().width / colspan;
			widths[col] = Math.max(widths[col] ?? 0, perColumn);
		}
	}
	return widths;
}

function htmlLayoutTableColumnTotalPx(table: HTMLElement, widthsPx: readonly number[]): number {
	const rectWidth = table.getBoundingClientRect().width;
	if (rectWidth > 0) {
		return rectWidth;
	}
	const sum = widthsPx.reduce((acc, size) => acc + size, 0);
	return sum > 0 ? sum : 0;
}

function htmlLayoutParseColWidthToPx(widthValue: string, tableWidth: number): number | null {
	const trimmed = widthValue.trim();
	if (!trimmed) {
		return null;
	}
	if (trimmed.endsWith('%')) {
		const percent = parseFloat(trimmed);
		if (Number.isNaN(percent) || percent <= 0 || tableWidth <= 0) {
			return null;
		}
		return tableWidth * percent / 100;
	}
	const px = parseFloat(trimmed);
	return Number.isNaN(px) || px <= 0 ? null : px;
}

function htmlLayoutEnsureColgroupStructure(table: HTMLElement, columnCount: number): HTMLTableColElement[] {
	let colgroup = table.querySelector('colgroup');
	if (!colgroup) {
		colgroup = document.createElement('colgroup');
		table.insertBefore(colgroup, table.firstChild);
	}
	while (colgroup.children.length < columnCount) {
		colgroup.appendChild(document.createElement('col'));
	}
	while (colgroup.children.length > columnCount) {
		colgroup.lastElementChild?.remove();
	}
	return [...colgroup.children].filter((col): col is HTMLTableColElement => col instanceof HTMLTableColElement);
}

function htmlLayoutReadTableColumnWidthsFromColgroup(table: HTMLElement): number[] | null {
	const built = htmlLayoutBuildTableCellGrid(table);
	if (!built) {
		return null;
	}
	const cols = htmlLayoutEnsureColgroupStructure(table, built.columnCount);
	if (cols.length !== built.columnCount) {
		return null;
	}
	const tableWidth = htmlLayoutTableColumnTotalPx(table, []);
	const widths: number[] = [];
	for (const col of cols) {
		const parsed = htmlLayoutParseColWidthToPx(col.style.width, tableWidth);
		if (parsed === null) {
			return null;
		}
		widths.push(parsed);
	}
	return widths;
}

function htmlLayoutReadTableColumnWidthsPx(table: HTMLElement): number[] | null {
	const fromColgroup = htmlLayoutReadTableColumnWidthsFromColgroup(table);
	if (fromColgroup) {
		return fromColgroup;
	}
	const built = htmlLayoutBuildTableCellGrid(table);
	if (!built) {
		return null;
	}
	const tableWidth = htmlLayoutTableColumnTotalPx(table, []);
	if (tableWidth <= 0) {
		return null;
	}
	return htmlLayoutMeasureTableColumnWidthsFromCells(built.cellGrid, built.columnCount);
}

function htmlLayoutInitializeTableColumnWidths(table: HTMLElement): number[] | null {
	const grid = htmlLayoutBuildTableColumnGrid(table);
	if (!grid) {
		return null;
	}
	htmlLayoutEnsureTableLayoutFixed(table);
	const built = htmlLayoutBuildTableCellGrid(table);
	if (!built) {
		return null;
	}
	const tableWidth = htmlLayoutTableColumnTotalPx(table, []);
	const measured = htmlLayoutMeasureTableColumnWidthsFromCells(built.cellGrid, grid.columnCount);
	if (tableWidth <= 0) {
		return measured;
	}
	htmlLayoutWriteTableColumnWidthsPx(table, measured, tableWidth);
	return htmlLayoutReadTableColumnWidthsPx(table);
}

function htmlLayoutPrepareTableForColumnResize(table: HTMLElement): number[] | null {
	const grid = htmlLayoutBuildTableColumnGrid(table);
	if (!grid) {
		return null;
	}
	htmlLayoutEnsureTableLayoutFixed(table);
	htmlLayoutEnsureColgroupStructure(table, grid.columnCount);
	return htmlLayoutReadTableColumnWidthsPx(table) ?? htmlLayoutInitializeTableColumnWidths(table);
}

function htmlLayoutWriteTableColumnWidthsPx(table: HTMLElement, widthsPx: readonly number[], totalPx?: number): void {
	const grid = htmlLayoutBuildTableColumnGrid(table);
	if (!grid) {
		return;
	}
	htmlLayoutEnsureTableLayoutFixed(table);
	const cols = htmlLayoutEnsureColgroupStructure(table, grid.columnCount);
	if (cols.length !== grid.columnCount) {
		return;
	}
	const min = HTML_LAYOUT_TABLE_MIN_COL_WIDTH_PX;
	const sizes = widthsPx.map(width => Math.max(min, Math.round(width)));
	if (sizes.length === 0) {
		return;
	}
	const total = totalPx ?? htmlLayoutTableColumnTotalPx(table, sizes);
	if (total > 0) {
		sizes[sizes.length - 1] = Math.max(min, total - sizes.slice(0, -1).reduce((sum, size) => sum + size, 0));
	}
	for (let index = 0; index < grid.columnCount; index++) {
		cols[index]!.style.width = `${sizes[index] ?? min}px`;
	}
	htmlLayoutSyncTableColumnWidthsToFirstRow(table, sizes);
}

function htmlLayoutApplyTableColumnWidths(table: HTMLElement, widthsPx: readonly number[], totalPx?: number): void {
	htmlLayoutWriteTableColumnWidthsPx(table, widthsPx, totalPx);
}

function htmlLayoutSyncTableColumnWidthsToFirstRow(table: HTMLElement, widthsPx: readonly number[]): void {
	const built = htmlLayoutBuildTableCellGrid(table);
	if (!built) {
		return;
	}
	for (let col = 0; col < built.columnCount; col++) {
		const cell = built.cellGrid[0]![col]!;
		if ((cell.colSpan || 1) !== 1) {
			continue;
		}
		cell.style.width = `${Math.round(widthsPx[col] ?? 0)}px`;
	}
}

function htmlLayoutFirstRowCellStyleSnapshot(table: HTMLElement): string[] {
	const built = htmlLayoutBuildTableCellGrid(table);
	if (!built) {
		return [];
	}
	const styles: string[] = [];
	for (let col = 0; col < built.columnCount; col++) {
		const cell = built.cellGrid[0]![col]!;
		styles.push(cell.getAttribute('style') ?? '');
	}
	return styles;
}

function htmlLayoutNormalizeColWidthsToPxForSave(table: HTMLElement): void {
	const built = htmlLayoutBuildTableCellGrid(table);
	if (!built) {
		return;
	}
	const cols = htmlLayoutEnsureColgroupStructure(table, built.columnCount);
	if (cols.length !== built.columnCount) {
		return;
	}
	const tableWidth = htmlLayoutTableColumnTotalPx(table, []);
	const pxWidths: number[] = [];
	for (const col of cols) {
		const px = htmlLayoutParseColWidthToPx(col.style.width, tableWidth);
		if (px === null) {
			return;
		}
		pxWidths.push(px);
	}
	const total = tableWidth > 0 ? tableWidth : pxWidths.reduce((sum, width) => sum + width, 0);
	if (total <= 0) {
		return;
	}
	htmlLayoutWriteTableColumnWidthsPx(table, pxWidths, total);
}

function htmlLayoutFinalizeTableForSave(table: HTMLElement): void {
	htmlLayoutEnsureTableLayoutFixed(table);
	htmlLayoutNormalizeColWidthsToPxForSave(table);
}

function htmlLayoutListTableElements(root: HTMLElement): HTMLElement[] {
	const tag = root.tagName.toLowerCase();
	if (tag === 'table' || tag === 'sc-raw-table') {
		return [root];
	}
	return [...root.querySelectorAll('table, sc-raw-table')].filter((table): table is HTMLElement => {
		return table instanceof HTMLElement && htmlLayoutIsTableElement(table);
	});
}

function htmlLayoutCloneForSave(element: HTMLElement): HTMLElement {
	const clone = element.cloneNode(true) as HTMLElement;
	htmlLayoutStripRuntimeAttributes(clone);
	for (const table of htmlLayoutListTableElements(clone)) {
		htmlLayoutFinalizeTableForSave(table);
	}
	return clone;
}

function htmlLayoutSnapshotTable(table: HTMLElement): IHtmlLayoutTableSnapshot {
	const colgroup = table.querySelector('colgroup');
	return {
		tableStyle: table.getAttribute('style') ?? '',
		colgroupOuterHtml: colgroup ? colgroup.outerHTML : null,
		firstRowCellStyles: htmlLayoutFirstRowCellStyleSnapshot(table),
	};
}

function htmlLayoutRestoreTable(table: HTMLElement, snapshot: IHtmlLayoutTableSnapshot): void {
	if (snapshot.tableStyle) {
		table.setAttribute('style', snapshot.tableStyle);
	} else {
		table.removeAttribute('style');
	}
	table.querySelector('colgroup')?.remove();
	if (snapshot.colgroupOuterHtml) {
		const template = document.createElement('template');
		template.innerHTML = snapshot.colgroupOuterHtml;
		const colgroup = template.content.firstElementChild;
		if (colgroup) {
			table.insertBefore(colgroup, table.firstChild);
		}
	}
	const built = htmlLayoutBuildTableCellGrid(table);
	if (built) {
		for (let col = 0; col < built.columnCount; col++) {
			const cell = built.cellGrid[0]![col]!;
			const style = snapshot.firstRowCellStyles[col] ?? '';
			if (style) {
				cell.setAttribute('style', style);
			} else {
				cell.removeAttribute('style');
			}
		}
	}
}

function htmlLayoutTableSnapshotsEqual(left: IHtmlLayoutTableSnapshot, right: IHtmlLayoutTableSnapshot): boolean {
	if (left.tableStyle !== right.tableStyle || left.colgroupOuterHtml !== right.colgroupOuterHtml) {
		return false;
	}
	if (left.firstRowCellStyles.length !== right.firstRowCellStyles.length) {
		return false;
	}
	for (let index = 0; index < left.firstRowCellStyles.length; index++) {
		if (left.firstRowCellStyles[index] !== right.firstRowCellStyles[index]) {
			return false;
		}
	}
	return true;
}

function htmlLayoutFindTableAt(clientX: number, clientY: number): HTMLElement | null {
	for (let node = htmlLayoutElementFromPoint(clientX, clientY); node; node = node.parentElement) {
		if (htmlLayoutIsTableElement(node)) {
			return node;
		}
	}
	return null;
}

function htmlLayoutHitTestTableColumnBoundary(clientX: number, clientY: number): IHtmlLayoutTableColumnHit | null {
	const table = htmlLayoutFindTableAt(clientX, clientY);
	if (!table) {
		return null;
	}
	const tableRect = table.getBoundingClientRect();
	if (clientY < tableRect.top || clientY > tableRect.bottom || clientX < tableRect.left || clientX > tableRect.right) {
		return null;
	}
	const grid = htmlLayoutBuildTableColumnGrid(table);
	if (!grid) {
		return null;
	}
	const widths = htmlLayoutReadTableColumnWidthsPx(table);
	if (!widths) {
		return null;
	}
	const slop = htmlLayoutGapHitSlopPx();
	let bestBoundary = -1;
	let bestDistance = Infinity;
	let x = tableRect.left;
	for (let index = 0; index < grid.resizableBoundaries.length; index++) {
		x += widths[index] ?? 0;
		if (!grid.resizableBoundaries[index]) {
			continue;
		}
		const distance = Math.abs(clientX - x);
		if (distance <= slop && distance < bestDistance) {
			bestDistance = distance;
			bestBoundary = index;
		}
	}
	if (bestBoundary < 0) {
		return null;
	}
	return { table, boundaryIndex: bestBoundary };
}

function htmlLayoutListResizableTables(root: ParentNode): HTMLElement[] {
	return [...root.querySelectorAll('table, sc-raw-table')].filter((element): element is HTMLElement => {
		return element instanceof HTMLElement && htmlLayoutIsTableElement(element) && !!htmlLayoutBuildTableColumnGrid(element);
	});
}

interface IHtmlLayoutEditBridgeCallbacks {
	readonly onSave: () => void;
	readonly onCancel: () => void;
}

/** Grid layout editing for DC deck slides — pointer-driven, inline-style only. */
class HtmlLayoutEditBridge {
	private _active = false;
	private _pageStyle: HTMLStyleElement | undefined;
	private _insertPreview: HTMLDivElement | undefined;
	private _actionBar: HTMLDivElement | undefined;
	private _cancelButton: HTMLButtonElement | undefined;
	private _saveButton: HTMLButtonElement | undefined;
	private _deleteToolbar: HTMLDivElement | undefined;
	private _deleteButton: HTMLButtonElement | undefined;
	private _selectedCard: HTMLElement | undefined;
	private _selectionSyncListenersAttached = false;
	private _theme: IBrowserViewTheme | undefined;
	private _snapshots = new Map<HTMLElement, IHtmlLayoutContainerSnapshot>();
	private _tableSnapshots = new Map<HTMLElement, IHtmlLayoutTableSnapshot>();
	private _drag: IHtmlLayoutDragState | undefined;
	private _outlineTargets = new Set<HTMLElement>();

	constructor(private readonly _callbacks: IHtmlLayoutEditBridgeCallbacks) {
		window.addEventListener('beforeprint', () => {
			if (this._active) {
				this.restoreDefaults();
				this.setActive(false);
			}
		});
	}

	setTheme(theme: IBrowserViewTheme): void {
		this._theme = theme;
		this._applyActionBarTheme();
		this._applyDeleteToolbarTheme();
	}

	updateLocalizedStrings(): void {
		if (this._cancelButton) {
			this._cancelButton.textContent = localizedStrings.htmlLayoutCancel;
		}
		if (this._saveButton) {
			this._saveButton.textContent = localizedStrings.htmlLayoutSave;
		}
		if (this._deleteButton) {
			this._deleteButton.title = localizedStrings.htmlLayoutDelete;
			this._deleteButton.setAttribute('aria-label', localizedStrings.htmlLayoutDelete);
		}
	}

	setActive(active: boolean): void {
		if (active === this._active) {
			return;
		}
		this._active = active;
		if (active) {
			this._captureSnapshots();
			this._ensurePageStyles();
			this._ensureActionBar();
			document.documentElement.setAttribute('data-vscode-layout-edit', 'true');
		} else {
			this._finishDrag();
			this._clearOutlines();
			this._clearSelection();
			this._removeDeleteToolbar();
			this._removeInsertPreview();
			this._removeActionBar();
			document.documentElement.removeAttribute('data-vscode-layout-edit');
			this._pageStyle?.remove();
			this._pageStyle = undefined;
			this._snapshots.clear();
			this._tableSnapshots.clear();
		}
	}

	restoreDefaults(): void {
		for (const [container, snapshot] of this._snapshots) {
			htmlLayoutRestoreContainer(container, snapshot);
		}
		for (const [table, snapshot] of this._tableSnapshots) {
			htmlLayoutRestoreTable(table, snapshot);
		}
	}

	hasChanges(): boolean {
		if (!this._active) {
			return false;
		}
		const root = htmlLayoutActiveSlideRoot();
		for (const grid of root.querySelectorAll('[data-dc-grid]')) {
			if (!(grid instanceof HTMLElement)) {
				continue;
			}
			const snapshot = this._snapshots.get(grid);
			if (!snapshot) {
				return true;
			}
			if (!htmlLayoutSnapshotsEqual(snapshot, htmlLayoutSnapshotContainer(grid))) {
				return true;
			}
		}
		for (const table of htmlLayoutListResizableTables(root)) {
			const snapshot = this._tableSnapshots.get(table);
			if (!snapshot) {
				return true;
			}
			if (!htmlLayoutTableSnapshotsEqual(snapshot, htmlLayoutSnapshotTable(table))) {
				return true;
			}
		}
		return false;
	}

	getSavePayload(): IHtmlLayoutSavePayload | null {
		if (!this._active || !this.hasChanges()) {
			return null;
		}
		const patches: IHtmlLayoutSavePatch[] = [];
		if (this._hasGridChanges()) {
			const main = htmlLayoutSaveRoot();
			if (main) {
				const domPath = htmlLayoutDomPathForSaveTarget(main);
				if (domPath) {
					patches.push({
						domPath,
						replaceOuterHtml: htmlLayoutCloneForSave(main).outerHTML,
					});
				}
			}
		}
		for (const [table, snapshot] of this._tableSnapshots) {
			if (htmlLayoutTableSnapshotsEqual(snapshot, htmlLayoutSnapshotTable(table))) {
				continue;
			}
			const domPath = htmlLayoutDomPathForSaveTarget(table);
			if (!domPath) {
				continue;
			}
			patches.push({
				domPath,
				replaceOuterHtml: htmlLayoutCloneForSave(table).outerHTML,
			});
		}
		if (patches.length === 0) {
			return null;
		}
		return { patches };
	}

	private _hasGridChanges(): boolean {
		for (const [container, snapshot] of this._snapshots) {
			if (!htmlLayoutSnapshotsEqual(snapshot, htmlLayoutSnapshotContainer(container))) {
				return true;
			}
		}
		return false;
	}

	handlePointerDown(event: PointerEvent): boolean {
		if (!this._active || event.button !== 0) {
			return false;
		}
		if (this._isLayoutUiTarget(event.target)) {
			return false;
		}
		const tableColumn = htmlLayoutHitTestTableColumnBoundary(event.clientX, event.clientY);
		if (tableColumn) {
			const widths = htmlLayoutReadTableColumnWidthsPx(tableColumn.table);
			if (widths) {
				this._clearSelection();
				this._drag = {
					kind: 'tableColumnResize',
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					tableColumn,
					startTableColumnWidths: widths,
					startTableWidth: htmlLayoutTableColumnTotalPx(tableColumn.table, widths),
				};
				this._setForcedCursor('col-resize');
				event.preventDefault();
				return true;
			}
		}
		const gap = htmlLayoutHitTestGapForResize(event.clientX, event.clientY);
		if (gap) {
			this._clearSelection();
			this._drag = {
				kind: 'resize',
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				gap,
				startSizes: htmlLayoutNormalizedTrackSizes(gap.container, gap.axis),
				startTrackTotalPx: htmlLayoutTrackTotalPx(gap.container, gap.axis),
			};
			this._setForcedCursor(gap.axis === 'column' ? 'col-resize' : 'row-resize');
			event.preventDefault();
			return true;
		}
		const card = htmlLayoutFindCardAt(event.clientX, event.clientY);
		if (!card) {
			this._clearSelection();
			return false;
		}
		this._clearSelection();
		this._drag = {
			kind: 'insert',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			card,
		};
		this._setOutline(card, HTML_LAYOUT_EDIT_OUTLINE_BLUE);
		this._setForcedCursor('grabbing');
		event.preventDefault();
		return true;
	}

	handlePointerMove(event: PointerEvent): boolean {
		if (!this._active) {
			return false;
		}
		if (this._drag) {
			if (event.pointerId !== this._drag.pointerId) {
				return true;
			}
			if (this._drag.kind === 'resize') {
				this._applyResizeDrag(event);
			} else if (this._drag.kind === 'tableColumnResize') {
				this._applyTableColumnResizeDrag(event);
			} else {
				this._applyInsertDrag(event);
			}
			event.preventDefault();
			return true;
		}
		this._updateHoverCursor(event.clientX, event.clientY);
		return !!this._drag
			|| !!htmlLayoutHitTestTableColumnBoundary(event.clientX, event.clientY)
			|| !!htmlLayoutHitTestGapForResize(event.clientX, event.clientY)
			|| !!htmlLayoutFindCardAt(event.clientX, event.clientY);
	}

	handlePointerUp(event: PointerEvent): boolean {
		if (!this._drag || event.pointerId !== this._drag.pointerId) {
			return false;
		}
		let cardToSelect: HTMLElement | undefined;
		if (this._drag.kind === 'insert') {
			const dx = event.clientX - this._drag.startX;
			const dy = event.clientY - this._drag.startY;
			if (dx * dx + dy * dy <= HTML_LAYOUT_SELECT_DRAG_THRESHOLD_SQ) {
				cardToSelect = this._drag.card;
			} else {
				this._commitCardInsert(event.clientX, event.clientY);
			}
		}
		this._finishDrag();
		if (cardToSelect) {
			this._selectCard(cardToSelect);
		}
		this._updateHoverCursor(event.clientX, event.clientY);
		event.preventDefault();
		return true;
	}

	handlePointerCancel(event: PointerEvent): boolean {
		if (!this._drag || event.pointerId !== this._drag.pointerId) {
			return false;
		}
		this._finishDrag();
		this._updateHoverCursor(event.clientX, event.clientY);
		return true;
	}

	private _applyTableColumnResizeDrag(event: PointerEvent): void {
		let drag = this._drag;
		if (!drag?.tableColumn || !drag.startTableColumnWidths) {
			return;
		}
		const { table, boundaryIndex } = drag.tableColumn;
		if (!drag.tablePrepared) {
			const dx = event.clientX - drag.startX;
			const dy = event.clientY - drag.startY;
			if (dx * dx + dy * dy <= HTML_LAYOUT_TABLE_COLUMN_DRAG_THRESHOLD_SQ) {
				return;
			}
			const prepared = htmlLayoutPrepareTableForColumnResize(table);
			if (!prepared) {
				return;
			}
			drag = {
				...drag,
				tablePrepared: true,
				startTableColumnWidths: prepared,
				startTableWidth: htmlLayoutTableColumnTotalPx(table, prepared),
				startX: event.clientX,
				startY: event.clientY,
			};
			this._drag = drag;
			return;
		}
		const scale = htmlLayoutDeckCanvasScale();
		const delta = (event.clientX - drag.startX) / scale;
		const sizes = [...drag.startTableColumnWidths];
		if (boundaryIndex < 0 || boundaryIndex >= sizes.length - 1) {
			return;
		}
		sizes[boundaryIndex] = (sizes[boundaryIndex] ?? 0) + delta;
		sizes[boundaryIndex + 1] = (sizes[boundaryIndex + 1] ?? 0) - delta;
		const min = HTML_LAYOUT_TABLE_MIN_COL_WIDTH_PX;
		for (let pass = 0; pass < 2; pass++) {
			for (let index = 0; index < sizes.length; index++) {
				if ((sizes[index] ?? 0) >= min) {
					continue;
				}
				const overflow = min - (sizes[index] ?? 0);
				sizes[index] = min;
				const neighbor = index < sizes.length - 1 ? index + 1 : index - 1;
				if (neighbor >= 0) {
					sizes[neighbor] = (sizes[neighbor] ?? 0) - overflow;
				}
			}
		}
		const total = drag.startTableWidth ?? htmlLayoutTableColumnTotalPx(table, sizes);
		htmlLayoutAnchorFarTrack(sizes, total, new Array<number>(sizes.length).fill(min));
		htmlLayoutApplyTableColumnWidths(table, sizes, total);
	}

	private _applyResizeDrag(event: PointerEvent): void {
		const drag = this._drag;
		if (!drag?.gap || !drag.startSizes) {
			return;
		}
		const { container, axis } = drag.gap;
		const scale = htmlLayoutDeckCanvasScale();
		const delta = (axis === 'column' ? event.clientX - drag.startX : event.clientY - drag.startY) / scale;
		const sortedIndex = drag.gap.index;
		const sizes = [...drag.startSizes];
		const mins = htmlLayoutTrackMinsPx(container, axis);
		const total = drag.startTrackTotalPx ?? htmlLayoutTrackTotalPx(container, axis);
		if (sortedIndex < 0 || sortedIndex >= sizes.length - 1) {
			return;
		}

		sizes[sortedIndex] = (sizes[sortedIndex] ?? 0) + delta;
		sizes[sortedIndex + 1] = (sizes[sortedIndex + 1] ?? 0) - delta;

		for (let pass = 0; pass < 2; pass++) {
			for (let index = 0; index < sizes.length; index++) {
				const min = mins[index] ?? 0;
				if ((sizes[index] ?? 0) >= min) {
					continue;
				}
				const overflow = min - (sizes[index] ?? 0);
				sizes[index] = min;
				const neighbor = index < sizes.length - 1 ? index + 1 : index - 1;
				if (neighbor >= 0) {
					sizes[neighbor] = (sizes[neighbor] ?? 0) - overflow;
				}
			}
		}

		htmlLayoutAnchorFarTrack(sizes, total, mins);

		htmlLayoutApplyTrackSizes(container, axis, sizes, mins, total);
		const children = htmlLayoutSortedChildren(container, axis);
		this._setOutline(children[sortedIndex], HTML_LAYOUT_EDIT_OUTLINE_BLUE);
		this._setOutline(children[sortedIndex + 1], HTML_LAYOUT_EDIT_OUTLINE_ORANGE);
	}

	private _applyInsertDrag(event: PointerEvent): void {
		const drag = this._drag;
		if (!drag?.card) {
			return;
		}
		this._clearOutlines();
		this._setOutline(drag.card, HTML_LAYOUT_EDIT_OUTLINE_BLUE);
		const hit = htmlLayoutHitTestForInsert(event.clientX, event.clientY, drag.card);
		if (hit) {
			this._showInsertPreview(hit);
		} else {
			this._hideInsertPreview();
		}
		this._setForcedCursor('grabbing');
	}

	private _commitCardInsert(clientX: number, clientY: number): void {
		const drag = this._drag;
		if (!drag?.card) {
			return;
		}
		const hit = htmlLayoutHitTestForInsert(clientX, clientY, drag.card);
		if (!hit) {
			return;
		}
		this._commitInsertHit(hit, drag.card);
	}

	private _commitInsertHit(hit: IHtmlLayoutInsertHit, card: HTMLElement): void {
		if (card.contains(hit.container) || (hit.slot && (card.contains(hit.slot) || card === hit.slot))) {
			return;
		}
		if (hit.kind === 'nest' && hit.nest) {
			this._commitNestInsert(hit, card);
			return;
		}
		const targetContainer = hit.container;
		const sorted = htmlLayoutSortedChildren(targetContainer, hit.axis);
		let insertBefore: HTMLElement | null;
		switch (hit.kind) {
			case 'gap': {
				const gapIndex = hit.gapIndex;
				if (gapIndex === undefined) {
					return;
				}
				insertBefore = sorted[gapIndex + 1] ?? null;
				if (!insertBefore || insertBefore === card) {
					return;
				}
				if (card.parentElement === targetContainer && card.nextElementSibling === insertBefore) {
					return;
				}
				break;
			}
			case 'prepend':
				insertBefore = sorted[0] ?? null;
				if (card.parentElement === targetContainer && card === insertBefore) {
					return;
				}
				break;
			case 'append':
				insertBefore = null;
				if (card.parentElement === targetContainer && targetContainer.lastElementChild === card) {
					return;
				}
				break;
			case 'slotPrepend': {
				const slot = hit.slot;
				if (!slot || slot === card) {
					return;
				}
				insertBefore = slot;
				if (card.parentElement === targetContainer && card.nextElementSibling === slot) {
					return;
				}
				break;
			}
			case 'slotAppend': {
				const slot = hit.slot;
				if (!slot || slot === card) {
					return;
				}
				insertBefore = slot.nextElementSibling instanceof HTMLElement ? slot.nextElementSibling : null;
				if (card.parentElement === targetContainer && card.previousElementSibling === slot) {
					return;
				}
				break;
			}
			default:
				return;
		}
		const sourceParent = card.parentElement;
		if (!sourceParent) {
			return;
		}
		if (insertBefore) {
			targetContainer.insertBefore(card, insertBefore);
		} else {
			targetContainer.appendChild(card);
		}
		this._finalizeInsert(sourceParent, targetContainer);
	}

	private _commitNestInsert(hit: IHtmlLayoutInsertHit, dragged: HTMLElement): void {
		const nest = hit.nest;
		if (!nest) {
			return;
		}
		const { target, edge } = nest;
		const parent = hit.container;
		if (target === dragged || !parent.contains(target) || dragged.contains(target) || target.contains(dragged)) {
			return;
		}
		const existingParent = target.parentElement;
		if (existingParent && htmlLayoutIsGridContainer(existingParent)) {
			const siblings = htmlLayoutTrackChildren(existingParent);
			if (siblings.length === 2 && siblings.includes(dragged)) {
				if (edge === 'start' && siblings[0] === dragged && siblings[1] === target) {
					return;
				}
				if (edge === 'end' && siblings[0] === target && siblings[1] === dragged) {
					return;
				}
			}
		}
		const sourceParent = dragged.parentElement;
		const subGrid = htmlLayoutCreateSubGrid(nest.axis);
		parent.insertBefore(subGrid, target);
		subGrid.appendChild(target);
		if (edge === 'start') {
			subGrid.insertBefore(dragged, target);
		} else {
			subGrid.appendChild(dragged);
		}
		if (sourceParent && sourceParent !== subGrid && sourceParent !== parent) {
			htmlLayoutRetune(sourceParent);
		}
		this._collapseGridContainers();
	}

	private _finalizeInsert(sourceParent: HTMLElement, targetContainer: HTMLElement): void {
		if (sourceParent !== targetContainer) {
			htmlLayoutRetune(sourceParent);
		}
		htmlLayoutRetune(targetContainer);
		this._collapseGridContainers();
	}

	private _collapseGridContainers(): void {
		htmlLayoutCollapseGridContainers(htmlLayoutActiveSlideRoot());
	}

	private _finishDrag(): void {
		this._drag = undefined;
		this._clearOutlines();
		this._hideInsertPreview();
		this._clearCursorVisuals();
	}

	private _ensureInsertPreview(): HTMLDivElement {
		if (this._insertPreview) {
			return this._insertPreview;
		}
		const preview = document.createElement('div');
		preview.setAttribute('data-vscode-layout-insert-preview', 'true');
		preview.style.cssText = [
			'position:fixed',
			'pointer-events:none',
			'z-index:2147483000',
			'box-sizing:border-box',
			'border:2px dashed #0078d4',
			'background:color-mix(in srgb, #0078d4 16%, transparent)',
			'border-radius:3px',
			'display:none',
		].join(';');
		document.body.appendChild(preview);
		this._insertPreview = preview;
		return preview;
	}

	private _showInsertPreview(hit: IHtmlLayoutInsertHit): void {
		const bounds = htmlLayoutInsertPreviewBounds(hit);
		if (!bounds) {
			this._hideInsertPreview();
			return;
		}
		const preview = this._ensureInsertPreview();
		preview.style.display = 'block';
		preview.style.left = `${bounds.left}px`;
		preview.style.top = `${bounds.top}px`;
		preview.style.width = `${Math.max(bounds.width, 1)}px`;
		preview.style.height = `${Math.max(bounds.height, 1)}px`;
	}

	private _hideInsertPreview(): void {
		if (this._insertPreview) {
			this._insertPreview.style.display = 'none';
		}
	}

	private _removeInsertPreview(): void {
		this._insertPreview?.remove();
		this._insertPreview = undefined;
	}

	private _updateHoverCursor(clientX: number, clientY: number): void {
		if (this._drag) {
			return;
		}
		if (htmlLayoutHitTestTableColumnBoundary(clientX, clientY)) {
			this._setForcedCursor('col-resize');
			return;
		}
		const gap = htmlLayoutHitTestGapForResize(clientX, clientY);
		if (gap) {
			this._setForcedCursor(gap.axis === 'column' ? 'col-resize' : 'row-resize');
			return;
		}
		if (htmlLayoutFindCardAt(clientX, clientY)) {
			this._setForcedCursor('grab');
			return;
		}
		this._clearCursorVisuals();
	}

	private _setForcedCursor(cursor: 'col-resize' | 'row-resize' | 'grab' | 'grabbing' | undefined): void {
		this._clearCursorVisuals();
		if (!cursor) {
			return;
		}
		document.documentElement.style.cursor = cursor;
	}

	private _clearCursorVisuals(): void {
		document.documentElement.style.removeProperty('cursor');
	}

	private _setOutline(element: HTMLElement | undefined, color: string | undefined): void {
		if (!element) {
			return;
		}
		if (color) {
			element.style.outline = `2px solid ${color}`;
			element.style.outlineOffset = '-2px';
			this._outlineTargets.add(element);
			return;
		}
		element.style.removeProperty('outline');
		element.style.removeProperty('outline-offset');
		this._outlineTargets.delete(element);
	}

	private _clearOutlines(): void {
		for (const element of this._outlineTargets) {
			element.style.removeProperty('outline');
			element.style.removeProperty('outline-offset');
		}
		this._outlineTargets.clear();
	}

	private _captureSnapshots(): void {
		this._snapshots.clear();
		this._tableSnapshots.clear();
		const root = htmlLayoutActiveSlideRoot();
		for (const container of root.querySelectorAll('[data-dc-grid]')) {
			if (container instanceof HTMLElement) {
				this._captureContainer(container);
			}
		}
		for (const table of htmlLayoutListResizableTables(root)) {
			this._tableSnapshots.set(table, htmlLayoutSnapshotTable(table));
		}
	}

	private _captureContainer(container: HTMLElement): void {
		this._snapshots.set(container, htmlLayoutSnapshotContainer(container));
	}

	private _ensurePageStyles(): void {
		if (this._pageStyle) {
			return;
		}
		const style = document.createElement('style');
		style.id = 'vscode-html-layout-edit-styles';
		style.textContent = `
			html[data-vscode-layout-edit], html[data-vscode-layout-edit] * {
				user-select: none !important;
				-webkit-user-select: none !important;
			}
			html[data-vscode-layout-edit] main[data-dc-grid] {
				background-image: repeating-linear-gradient(
					45deg,
					color-mix(in srgb, #0078d4 10%, transparent) 0 8px,
					transparent 8px 16px
				) !important;
			}
			html[data-vscode-layout-edit] [data-dc-grid] > * {
				outline: 1px dashed color-mix(in srgb, #0078d4 55%, transparent) !important;
				outline-offset: -1px;
			}
			html[data-vscode-layout-edit] table,
			html[data-vscode-layout-edit] sc-raw-table {
				outline: 1px dashed color-mix(in srgb, #0078d4 35%, transparent) !important;
				outline-offset: -1px;
			}
			#vscode-html-layout-action-bar {
				position: fixed;
				top: 12px;
				right: 12px;
				z-index: 2147483647;
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 6px;
				box-sizing: border-box;
				padding: 4px;
				border-radius: 6px;
				border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
				background-color: var(--vscode-widget-background, rgba(255, 255, 255, 0.96));
				color: var(--vscode-widget-foreground, #333);
				box-shadow: var(--vscode-widget-shadow, 0 2px 8px rgba(0, 0, 0, 0.16));
				pointer-events: auto;
				font: 12px/1.4 var(--vscode-font-family, system-ui, sans-serif);
			}
			#vscode-html-layout-action-bar button {
				box-sizing: border-box;
				min-width: 56px;
				padding: 4px 12px;
				border-radius: 4px;
				border: 1px solid transparent;
				font: inherit;
				cursor: pointer;
			}
			#vscode-html-layout-action-bar button[data-kind="secondary"] {
				background: transparent;
				border-color: var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
				color: inherit;
			}
			#vscode-html-layout-action-bar button[data-kind="primary"] {
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, #fff);
			}
			#vscode-html-layout-action-bar button:disabled {
				opacity: 0.5;
				cursor: default;
			}
			#vscode-html-layout-delete-toolbar {
				position: fixed;
				z-index: 2147483647;
				display: none;
				pointer-events: none;
			}
			#vscode-html-layout-delete-toolbar button {
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 26px;
				height: 26px;
				padding: 0;
				border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
				border-radius: 6px;
				background-color: var(--vscode-widget-background, rgba(255, 255, 255, 0.96));
				color: var(--vscode-foreground, #333);
				box-shadow: var(--vscode-widget-shadow, 0 2px 8px rgba(0, 0, 0, 0.16));
				cursor: pointer;
				pointer-events: auto;
			}
			#vscode-html-layout-delete-toolbar button:hover {
				background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.12));
				color: var(--vscode-errorForeground, #f14c4c);
			}
			#vscode-html-layout-delete-toolbar button:focus-visible {
				outline: 2px solid var(--vscode-focusBorder, #0078d4);
				outline-offset: 1px;
			}
			#vscode-html-layout-delete-toolbar svg {
				display: block;
				width: 16px;
				height: 16px;
				fill: currentColor;
			}
		`;
		document.head.appendChild(style);
		this._pageStyle = style;
	}

	private _ensureActionBar(): void {
		if (this._actionBar) {
			return;
		}
		const bar = document.createElement('div');
		bar.id = 'vscode-html-layout-action-bar';

		const cancelButton = document.createElement('button');
		cancelButton.type = 'button';
		cancelButton.dataset.kind = 'secondary';
		cancelButton.textContent = localizedStrings.htmlLayoutCancel;
		cancelButton.addEventListener('pointerdown', event => {
			event.stopPropagation();
		});
		cancelButton.addEventListener('click', event => {
			event.stopPropagation();
			this._callbacks.onCancel();
		});

		const saveButton = document.createElement('button');
		saveButton.type = 'button';
		saveButton.dataset.kind = 'primary';
		saveButton.textContent = localizedStrings.htmlLayoutSave;
		saveButton.addEventListener('pointerdown', event => {
			event.stopPropagation();
		});
		saveButton.addEventListener('click', event => {
			event.stopPropagation();
			this._callbacks.onSave();
		});

		bar.appendChild(cancelButton);
		bar.appendChild(saveButton);
		document.body.appendChild(bar);

		this._actionBar = bar;
		this._cancelButton = cancelButton;
		this._saveButton = saveButton;
		this._applyActionBarTheme();
	}

	private _removeActionBar(): void {
		this._actionBar?.remove();
		this._actionBar = undefined;
		this._cancelButton = undefined;
		this._saveButton = undefined;
	}

	private _isLayoutUiTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Node)) {
			return false;
		}
		return !!(
			(this._actionBar && this._actionBar.contains(target))
			|| (this._deleteToolbar && this._deleteToolbar.contains(target))
		);
	}

	private _selectCard(card: HTMLElement | undefined): void {
		if (!card || !this._active) {
			this._clearSelection();
			return;
		}
		if (this._selectedCard === card) {
			this._syncDeleteToolbarPosition();
			return;
		}
		this._clearSelection();
		this._selectedCard = card;
		this._setOutline(card, HTML_LAYOUT_EDIT_OUTLINE_SELECTED);
		this._ensureDeleteToolbar();
		this._syncDeleteToolbarPosition();
		this._attachSelectionSyncListeners();
	}

	private _clearSelection(): void {
		if (this._selectedCard) {
			this._setOutline(this._selectedCard, undefined);
		}
		this._selectedCard = undefined;
		this._hideDeleteToolbar();
		this._detachSelectionSyncListeners();
	}

	private _deleteSelectedCard(): void {
		const card = this._selectedCard;
		if (!card || !this._active || htmlLayoutIsSlideRootGrid(card)) {
			return;
		}
		const parent = card.parentElement;
		if (!parent || !htmlLayoutIsGridContainer(parent)) {
			return;
		}
		this._clearSelection();
		card.remove();
		htmlLayoutRetune(parent);
		this._collapseGridContainers();
	}

	private _ensureDeleteToolbar(): void {
		if (this._deleteToolbar) {
			this._deleteToolbar.style.display = 'block';
			return;
		}
		const toolbar = document.createElement('div');
		toolbar.id = 'vscode-html-layout-delete-toolbar';

		const deleteButton = document.createElement('button');
		deleteButton.type = 'button';
		deleteButton.title = localizedStrings.htmlLayoutDelete;
		deleteButton.setAttribute('aria-label', localizedStrings.htmlLayoutDelete);
		deleteButton.addEventListener('pointerdown', event => {
			event.stopPropagation();
		});
		deleteButton.addEventListener('click', event => {
			event.stopPropagation();
			this._deleteSelectedCard();
		});

		const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		icon.setAttribute('viewBox', '0 0 16 16');
		icon.setAttribute('fill', 'currentColor');
		icon.setAttribute('aria-hidden', 'true');
		const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		iconPath.setAttribute('d', HTML_LAYOUT_TRASH_ICON_PATH);
		icon.appendChild(iconPath);
		deleteButton.appendChild(icon);

		toolbar.appendChild(deleteButton);
		document.body.appendChild(toolbar);

		this._deleteToolbar = toolbar;
		this._deleteButton = deleteButton;
		this._applyDeleteToolbarTheme();
	}

	private _hideDeleteToolbar(): void {
		if (this._deleteToolbar) {
			this._deleteToolbar.style.display = 'none';
		}
	}

	private _removeDeleteToolbar(): void {
		this._deleteToolbar?.remove();
		this._deleteToolbar = undefined;
		this._deleteButton = undefined;
	}

	private _syncDeleteToolbarPosition(): void {
		const card = this._selectedCard;
		const toolbar = this._deleteToolbar;
		if (!card || !toolbar || !card.isConnected) {
			this._clearSelection();
			return;
		}
		toolbar.style.display = 'block';
		const rect = card.getBoundingClientRect();
		toolbar.style.top = `${Math.max(rect.top + 4, 4)}px`;
		toolbar.style.left = `${rect.right - 4}px`;
		toolbar.style.transform = 'translate(-100%, 0)';
	}

	private _onSelectionSync = (): void => {
		this._syncDeleteToolbarPosition();
	};

	private _attachSelectionSyncListeners(): void {
		if (this._selectionSyncListenersAttached) {
			return;
		}
		window.addEventListener('scroll', this._onSelectionSync, true);
		window.addEventListener('resize', this._onSelectionSync);
		this._selectionSyncListenersAttached = true;
	}

	private _detachSelectionSyncListeners(): void {
		if (!this._selectionSyncListenersAttached) {
			return;
		}
		window.removeEventListener('scroll', this._onSelectionSync, true);
		window.removeEventListener('resize', this._onSelectionSync);
		this._selectionSyncListenersAttached = false;
	}

	private _applyActionBarTheme(): void {
		if (!this._actionBar) {
			return;
		}
		const theme = this._theme;
		const host = this._actionBar;
		host.style.setProperty('--vscode-widget-background', theme?.widgetBackground ?? null);
		host.style.setProperty('--vscode-widget-foreground', theme?.widgetForeground ?? null);
		host.style.setProperty('--vscode-widget-border', theme?.widgetBorder ?? null);
		host.style.setProperty('--vscode-widget-shadow', theme?.widgetShadow ?? null);
		host.style.setProperty('--vscode-button-background', theme?.buttonBackground ?? null);
		host.style.setProperty('--vscode-button-foreground', theme?.buttonForeground ?? null);
		host.style.setProperty('--vscode-font-family', theme?.font ?? null);
	}

	private _applyDeleteToolbarTheme(): void {
		if (!this._deleteButton) {
			return;
		}
		const theme = this._theme;
		const host = this._deleteButton;
		host.style.setProperty('--vscode-widget-background', theme?.widgetBackground ?? null);
		host.style.setProperty('--vscode-foreground', theme?.widgetForeground ?? null);
		host.style.setProperty('--vscode-widget-border', theme?.widgetBorder ?? null);
		host.style.setProperty('--vscode-widget-shadow', theme?.widgetShadow ?? null);
		host.style.setProperty('--vscode-toolbar-hoverBackground', theme?.toolbarHoverBackground ?? null);
	}
}

/**
 * Element-pick controller used by the "Add Element to Chat" flow.
 *
 * `start({ theme })` mounts a transparent overlay on the page that
 * highlights the element under the pointer (click) or finds the deepest
 * common ancestor of the elements covered by a click+drag rectangle. On
 * selection the picked `Element` is registered with the shared `track()`
 * helper and the host is notified with the resulting id; the overlay is
 * then torn down. `stop()` tears down without picking.
 */
class ElementPicker {
	private static readonly _DRAG_THRESHOLD_PX = 4;
	private static readonly _COMMENT_PIN_SIZE = 22;
	private static readonly _COMMENT_PIN_RESTORE_FRAMES = 5;
	private static readonly _COMMENT_PIN_RESTORE_TIMEOUT = 100;
	private static readonly _COMMENT_PREVIEW_HIT_PADDING = ElementPicker._COMMENT_PIN_SIZE / 2;
	private static readonly _COMMENT_PREVIEW_HIDE_DELAY = 80;
	private static readonly _COMMENT_SURFACE_ANIMATION_DURATION = 140;
	private static readonly _COMMENT_SUPPORTING_FADE_DURATION = 120;
	private static readonly _CURSOR_DEFAULT = '/* VS Code injected style */ * { cursor: default !important; }';
	private static readonly _CURSOR_CROSSHAIR = '/* VS Code injected style */ * { cursor: crosshair !important; }';

	private _selectionActive = false;
	private _continuous = false;
	private _commentMode = false;
	private _editMode = false;
	private _layoutEditMode = false;
	private _layoutPointerListenersAttached = false;

	// DOM — created once in the constructor, reused across start/stop cycles.
	private readonly _shadowHost: HTMLDivElement;
	private readonly _commentBackdrop: SVGSVGElement;
	private readonly _commentBackdropCutout: SVGRectElement;
	private readonly _highlightShape: SVGRectElement;
	private readonly _highlight: HTMLDivElement;
	private readonly _commentPreviewRemoveButton: HTMLButtonElement;
	private readonly _overlay: HTMLDivElement;
	private readonly _label: HTMLDivElement;
	private readonly _labelSelector: HTMLSpanElement;
	private readonly _labelClasses: HTMLSpanElement;
	private readonly _labelDims: HTMLSpanElement;
	private readonly _commentPreviewHitArea: HTMLDivElement;
	private readonly _commentPreview: HTMLDivElement;
	private readonly _commentPreviewBody: HTMLSpanElement;
	private readonly _dragbox: HTMLDivElement;
	private readonly _commentLayer: HTMLDivElement;
	private readonly _commentComposer: HTMLDivElement;
	private readonly _commentInput: HTMLTextAreaElement;
	private readonly _commentSendButton: HTMLButtonElement;
	private readonly _comments = new Map<string, ElementComment>();
	private readonly _pendingComments = new Map<string, PendingElementComment>();
	private readonly _scheduledCommentPins = new Map<string, ScheduledCommentPin>();

	// Interaction state (reset on stop)
	private _dragStart: { x: number; y: number } | undefined;
	private _dragStartTarget: Element | undefined;
	private _highlightTarget: Element | undefined;
	private _externalHighlightTarget: Element | undefined;
	private _focusedTarget: Element | undefined;
	private _cursorStylesheet: HTMLStyleElement | undefined;
	private _dismissedCommentOnPointerDown = false;
	private _commentTarget: Element | undefined;
	private _commentAnchor: { x: number; y: number } | undefined;
	private _commentPointerInteraction = false;
	private _pendingCommentInteractionId: string | undefined;
	private _commentBackdropTarget: Element | undefined;
	private _commentBackdropRequest = 0;
	private _commentPreviewElementId: string | undefined;
	private _commentPreviewHideTimeout: number | undefined;
	private _commentAnimation: CommentAnimation | undefined;
	private _commentPreviewCollapsing = false;
	private _reducedMotion = false;
	private _lastCommitPointerEvent: PointerEvent | undefined;

	constructor(
		private readonly _onPicked: (element: Element, comment?: string) => string,
		private readonly _onCommentRemoved: (elementId: string) => void,
		private readonly _onStopped: () => void,
		private readonly _htmlEdit?: HtmlEditBridge,
		private readonly _htmlLayoutEdit?: HtmlLayoutEditBridge,
	) {
		// Build the shadow DOM tree once. The host is appended/removed from the
		// document on start/stop so the overlay only captures events when active.
		const shadowHost = document.createElement('div');
		shadowHost.setAttribute('data-vscode-pick-host', '');
		shadowHost.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
		const root = shadowHost.attachShadow({ mode: 'closed' });
		root.appendChild(ElementPicker._buildStyle());
		this._shadowHost = shadowHost;

		const svgNamespace = 'http://www.w3.org/2000/svg';
		const commentBackdrop = document.createElementNS(svgNamespace, 'svg');
		commentBackdrop.classList.add('comment-backdrop');
		const backdropMaskId = `vscode-comment-cutout-${Math.random().toString(36).slice(2)}`;
		const backdropDefinitions = document.createElementNS(svgNamespace, 'defs');
		const backdropMask = document.createElementNS(svgNamespace, 'mask');
		backdropMask.id = backdropMaskId;
		backdropMask.setAttribute('maskUnits', 'userSpaceOnUse');
		backdropMask.setAttribute('x', '0');
		backdropMask.setAttribute('y', '0');
		backdropMask.setAttribute('width', '100%');
		backdropMask.setAttribute('height', '100%');
		const backdropMaskFill = document.createElementNS(svgNamespace, 'rect');
		backdropMaskFill.setAttribute('width', '100%');
		backdropMaskFill.setAttribute('height', '100%');
		backdropMaskFill.setAttribute('fill', 'white');
		const backdropCutout = document.createElementNS(svgNamespace, 'rect');
		backdropCutout.setAttribute('fill', 'black');
		backdropMask.append(backdropMaskFill, backdropCutout);
		backdropDefinitions.appendChild(backdropMask);
		const backdropFill = document.createElementNS(svgNamespace, 'rect');
		backdropFill.classList.add('comment-backdrop-fill');
		backdropFill.setAttribute('width', '100%');
		backdropFill.setAttribute('height', '100%');
		backdropFill.setAttribute('mask', `url(#${backdropMaskId})`);
		const highlightShape = document.createElementNS(svgNamespace, 'rect');
		highlightShape.classList.add('highlight-shape');
		highlightShape.style.display = 'none';
		commentBackdrop.append(backdropDefinitions, backdropFill, highlightShape);
		root.appendChild(commentBackdrop);
		this._commentBackdrop = commentBackdrop;
		this._commentBackdropCutout = backdropCutout;
		this._highlightShape = highlightShape;

		const highlight = document.createElement('div');
		highlight.className = 'highlight';
		highlight.style.display = 'none';
		root.appendChild(highlight);
		this._highlight = highlight;

		const commentPreviewRemoveButton = document.createElement('button');
		commentPreviewRemoveButton.className = 'comment-preview-remove';
		commentPreviewRemoveButton.type = 'button';
		const commentPreviewRemoveIcon = document.createElementNS(svgNamespace, 'svg');
		commentPreviewRemoveIcon.setAttribute('viewBox', '0 0 16 16');
		commentPreviewRemoveIcon.setAttribute('fill', 'currentColor');
		commentPreviewRemoveIcon.setAttribute('aria-hidden', 'true');
		const commentPreviewRemoveIconPath = document.createElementNS(svgNamespace, 'path');
		commentPreviewRemoveIconPath.setAttribute('d', 'M3.854 3.146a.5.5 0 0 0-.708.708L7.293 8l-4.147 4.146a.5.5 0 0 0 .708.708L8 8.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 8l4.147-4.146a.5.5 0 0 0-.708-.708L8 7.293 3.854 3.146Z');
		commentPreviewRemoveIcon.appendChild(commentPreviewRemoveIconPath);
		commentPreviewRemoveButton.appendChild(commentPreviewRemoveIcon);
		commentPreviewRemoveButton.title = localizedStrings.removeComment;
		commentPreviewRemoveButton.setAttribute('aria-label', localizedStrings.removeElementComment);
		commentPreviewRemoveButton.addEventListener('click', () => {
			if (this._commentPreviewElementId) {
				this._removeComment(this._commentPreviewElementId);
			}
		});
		this._commentPreviewRemoveButton = commentPreviewRemoveButton;

		const overlay = document.createElement('div');
		overlay.className = 'overlay';
		root.appendChild(overlay);
		this._overlay = overlay;

		const label = document.createElement('div');
		label.className = 'label';
		label.style.display = 'none';
		root.appendChild(label);
		this._label = label;

		const labelInfo = document.createElement('span');
		labelInfo.className = 'label-info';
		label.appendChild(labelInfo);

		const labelSelector = document.createElement('span');
		labelSelector.className = 'label-selector';
		labelInfo.appendChild(labelSelector);
		this._labelSelector = labelSelector;

		const labelClasses = document.createElement('span');
		labelClasses.className = 'label-classes';
		labelInfo.appendChild(labelClasses);
		this._labelClasses = labelClasses;

		const labelDims = document.createElement('span');
		labelDims.className = 'label-dims';
		label.appendChild(labelDims);
		this._labelDims = labelDims;

		const commentPreviewHitArea = document.createElement('div');
		commentPreviewHitArea.className = 'comment-preview-hit-area';
		commentPreviewHitArea.style.display = 'none';
		root.appendChild(commentPreviewHitArea);
		this._commentPreviewHitArea = commentPreviewHitArea;

		const commentPreview = document.createElement('div');
		commentPreview.className = 'comment-surface comment-preview';
		commentPreview.style.display = 'none';
		commentPreview.setAttribute('role', 'note');
		const commentPreviewBody = document.createElement('span');
		commentPreviewBody.className = 'comment-preview-body';
		commentPreview.appendChild(commentPreviewBody);
		commentPreview.appendChild(commentPreviewRemoveButton);
		commentPreviewHitArea.appendChild(commentPreview);
		this._commentPreview = commentPreview;
		this._commentPreviewBody = commentPreviewBody;

		commentPreviewHitArea.addEventListener('mouseenter', () => this._cancelCommentPreviewHide());
		commentPreviewHitArea.addEventListener('mouseleave', () => this._scheduleCommentPreviewHide());
		commentPreviewHitArea.addEventListener('focusin', () => this._cancelCommentPreviewHide());
		commentPreviewHitArea.addEventListener('focusout', () => this._scheduleCommentPreviewHide());

		const dragbox = document.createElement('div');
		dragbox.className = 'dragbox';
		dragbox.style.display = 'none';
		root.appendChild(dragbox);
		this._dragbox = dragbox;

		const commentLayer = document.createElement('div');
		commentLayer.className = 'comment-layer';
		root.appendChild(commentLayer);
		this._commentLayer = commentLayer;

		const commentComposer = document.createElement('div');
		commentComposer.className = 'comment-surface comment-composer';
		commentComposer.style.display = 'none';
		commentComposer.setAttribute('role', 'dialog');
		commentComposer.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		commentComposer.setAttribute('aria-modal', 'true');
		commentLayer.appendChild(commentComposer);
		this._commentComposer = commentComposer;

		const commentInput = document.createElement('textarea');
		commentInput.className = 'comment-input';
		commentInput.rows = 1;
		commentInput.placeholder = localizedStrings.addCommentPlaceholder;
		commentInput.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		commentInput.addEventListener('input', () => this._layoutCommentInput());
		commentInput.addEventListener('keydown', event => {
			event.stopPropagation();
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				this._submitComment();
			}
		});
		commentInput.addEventListener('keypress', event => event.stopPropagation());
		commentInput.addEventListener('keyup', event => event.stopPropagation());
		commentComposer.appendChild(commentInput);
		this._commentInput = commentInput;

		const sendButton = document.createElement('button');
		sendButton.className = 'comment-send';
		sendButton.type = 'button';
		const sendButtonIcon = document.createElementNS(svgNamespace, 'svg');
		sendButtonIcon.setAttribute('viewBox', '0 0 16 16');
		sendButtonIcon.setAttribute('fill', 'currentColor');
		sendButtonIcon.setAttribute('aria-hidden', 'true');
		const sendButtonIconPath = document.createElementNS(svgNamespace, 'path');
		sendButtonIconPath.setAttribute('d', 'M8.5 3a.5.5 0 0 0-1 0v4.5H3a.5.5 0 0 0 0 1h4.5V13a.5.5 0 0 0 1 0V8.5H13a.5.5 0 0 0 0-1H8.5V3Z');
		sendButtonIcon.appendChild(sendButtonIconPath);
		sendButton.appendChild(sendButtonIcon);
		sendButton.title = localizedStrings.addComment;
		sendButton.setAttribute('aria-label', localizedStrings.addComment);
		sendButton.addEventListener('click', () => this._submitComment());
		commentComposer.appendChild(sendButton);
		this._commentSendButton = sendButton;

		commentComposer.addEventListener('keydown', event => {
			if (event.key !== 'Tab') {
				return;
			}
			if (event.shiftKey && event.target === commentInput) {
				event.preventDefault();
				sendButton.focus();
			} else if (!event.shiftKey && event.target === sendButton) {
				event.preventDefault();
				commentInput.focus();
			}
		});

		window.addEventListener('scroll', () => this._onScrollOrResize(), { passive: true, capture: true });
		window.addEventListener('resize', () => this._onScrollOrResize());
	}

	start(options: IBrowserElementSelectionOptions): boolean {
		if (this._selectionActive) {
			this._updateSelectionOptions(options);
			return true;
		}
		this._commentMode = options.mode === commentElementSelectionMode;
		this._editMode = options.mode === editElementSelectionMode;
		this._continuous = options.continuous ?? false;
		this._ensureMounted();
		this._selectionActive = true;
		this._overlay.style.display = 'block';

		// Inject a stylesheet into the page to override all cursors while element selection is active,
		// so the cursor always appears as a normal pointer even when over e.g. links.
		// Updated to crosshair in _onPointerDown, reset in _onPointerUp.
		const cursorStyle = document.createElement('style');
		cursorStyle.textContent = ElementPicker._CURSOR_DEFAULT;
		document.head.appendChild(cursorStyle);
		this._cursorStylesheet = cursorStyle;

		// Register high-frequency listeners only while selection is active.
		window.addEventListener('pointermove', this._onPointerMove, true);
		document.addEventListener('pointerleave', this._onPointerLeave, true);
		window.addEventListener('pointerdown', this._onPointerDown, true);
		window.addEventListener('pointerup', this._onPointerUp, true);
		window.addEventListener('pointercancel', this._onPointerCancel, true);
		window.addEventListener('click', this._onClick, true);
		window.addEventListener('contextmenu', this._onClick, true);
		window.addEventListener('focusin', this._onFocusIn, true);
		window.addEventListener('blur', this._onWindowBlur);
		window.addEventListener('keydown', this._onKeyDown, true);

		if (!this._externalHighlightTarget) {
			const focusedElement = this._getFocusedElement();
			this._focusedTarget = options.highlightFocusedElement ? focusedElement : undefined;
			this._updateHighlight(this._focusedTarget);
		}

		this._syncLayoutPointerListeners();
		return true;
	}

	private _updateSelectionOptions(options: IBrowserElementSelectionOptions): void {
		const wasCommentMode = this._commentMode;
		this._commentMode = options.mode === commentElementSelectionMode;
		this._editMode = options.mode === editElementSelectionMode;
		this._continuous = options.continuous ?? false;
		if (wasCommentMode && !this._commentMode && this._commentTarget) {
			this._closeCommentComposer();
		}
		if (options.highlightFocusedElement && !this._commentTarget && !this._commentPreviewElementId && !this._externalHighlightTarget) {
			this._focusedTarget = this._getFocusedElement();
			this._updateHighlight(this._focusedTarget);
		}
	}

	stop(): void {
		if (!this._selectionActive) {
			return;
		}
		this._htmlEdit?.finishActiveTextEdit(true);
		this._hideActiveCommentPreview();
		this._selectionActive = false;
		this._closeCommentComposer();
		this._overlay.style.display = 'none';

		this._cursorStylesheet?.remove();
		this._cursorStylesheet = undefined;

		// Remove high-frequency listeners.
		window.removeEventListener('pointermove', this._onPointerMove, true);
		document.removeEventListener('pointerleave', this._onPointerLeave, true);
		window.removeEventListener('pointerdown', this._onPointerDown, true);
		window.removeEventListener('pointerup', this._onPointerUp, true);
		window.removeEventListener('pointercancel', this._onPointerCancel, true);
		window.removeEventListener('click', this._onClick, true);
		window.removeEventListener('contextmenu', this._onClick, true);
		window.removeEventListener('focusin', this._onFocusIn, true);
		window.removeEventListener('blur', this._onWindowBlur);
		window.removeEventListener('keydown', this._onKeyDown, true);

		this._highlight.style.display = 'none';
		this._label.style.display = 'none';
		this._dragbox.style.display = 'none';
		this._dragStart = undefined;
		this._dragStartTarget = undefined;
		this._dismissedCommentOnPointerDown = false;
		this._highlightTarget = undefined;
		this._focusedTarget = undefined;
		if (this._externalHighlightTarget) {
			this._updateHighlight(this._externalHighlightTarget);
		}

		this._onStopped();
		this._unmountWhenIdle();
		this._syncLayoutPointerListeners();
	}

	private _syncLayoutPointerListeners(): void {
		const shouldAttach = this._layoutEditMode && !this._selectionActive;
		if (shouldAttach === this._layoutPointerListenersAttached) {
			return;
		}
		if (shouldAttach) {
			window.addEventListener('pointermove', this._onLayoutPointerMove, true);
			window.addEventListener('pointerdown', this._onLayoutPointerDown, true);
			window.addEventListener('pointerup', this._onLayoutPointerUp, true);
			window.addEventListener('pointercancel', this._onLayoutPointerCancel, true);
			this._layoutPointerListenersAttached = true;
		} else {
			window.removeEventListener('pointermove', this._onLayoutPointerMove, true);
			window.removeEventListener('pointerdown', this._onLayoutPointerDown, true);
			window.removeEventListener('pointerup', this._onLayoutPointerUp, true);
			window.removeEventListener('pointercancel', this._onLayoutPointerCancel, true);
			this._layoutPointerListenersAttached = false;
		}
	}

	private _onLayoutPointerMove = (e: PointerEvent): void => {
		if (this._layoutEditMode) {
			this._htmlLayoutEdit?.handlePointerMove(e);
		}
	};

	private _onLayoutPointerDown = (e: PointerEvent): void => {
		if (this._layoutEditMode) {
			this._htmlLayoutEdit?.handlePointerDown(e);
		}
	};

	private _onLayoutPointerUp = (e: PointerEvent): void => {
		if (this._layoutEditMode) {
			this._htmlLayoutEdit?.handlePointerUp(e);
		}
	};

	private _onLayoutPointerCancel = (e: PointerEvent): void => {
		if (this._layoutEditMode) {
			this._htmlLayoutEdit?.handlePointerCancel(e);
		}
	};

	/**
	 * Update the theme colors applied to the overlay.
	 * Can be called at any time; takes effect immediately.
	 */
	setTheme(theme: IBrowserViewTheme): void {
		ElementPicker._applyTheme(this._shadowHost, theme);
		this._reducedMotion = theme.reducedMotion ?? false;
		this._shadowHost.classList.toggle('reduce-motion', this._reducedMotion);
	}

	updateLocalizedStrings(): void {
		this._applyLocalizedStrings();
	}

	resolveContextMenuTarget(event: MouseEvent): Element | undefined {
		if (this._commentPreviewElementId && event.composedPath().includes(this._shadowHost)) {
			this._hideActiveCommentPreview();
			return this._pickElementAt(event.clientX, event.clientY);
		}
		return event.target instanceof Element ? event.target : undefined;
	}

	/**
	 * Highlight a specific element without starting a pick session.
	 * Mounts the shadow host if not already in the document.
	 */
	highlight(element: Element): void {
		this._ensureMounted();
		this._externalHighlightTarget = element;
		this._hideActiveCommentPreview();
		this._updateHighlight(element);
	}

	setElementHighlight(target: Element | undefined): void {
		this._updateHighlight(target);
	}

	setHtmlLayoutMode(active: boolean): void {
		this._layoutEditMode = active;
		this._htmlLayoutEdit?.setActive(active);
		this._syncLayoutPointerListeners();
	}

	/**
	 * Hide any current highlight. If no pick session is active, also
	 * removes the shadow host from the document.
	 */
	hideHighlight(): void {
		this._externalHighlightTarget = undefined;
		if (this._commentTarget) {
			return;
		}
		this._updateHighlight(undefined);
		this._unmountWhenIdle();
	}

	comment(element: Element, anchor: { x: number; y: number }): void {
		this._externalHighlightTarget = undefined;
		if (this._selectionActive) {
			this.stop();
		}
		this.start({ mode: commentElementSelectionMode });
		this._showCommentComposer(element, anchor, true);
	}

	updateComments(update: IBrowserElementCommentsUpdate): void {
		if (update.comments) {
			const incoming = new Map(update.comments.map((comment, index) => [comment.elementId, { body: comment.body, ordinal: index + 1 }]));
			for (const [elementId, comment] of this._comments) {
				const incomingComment = incoming.get(elementId);
				if (!incomingComment) {
					if (this._commentPreviewElementId === elementId) {
						this._hideActiveCommentPreview();
					}
					comment.pin.remove();
					this._comments.delete(elementId);
				} else {
					comment.ordinal = incomingComment.ordinal;
					if (incomingComment.body === comment.body) {
						continue;
					}
					comment.body = incomingComment.body;
					if (this._commentPreviewElementId === elementId) {
						this._setCommentPreviewBody(incomingComment.body);
						this._renderHighlight(comment.target);
					}
				}
			}
			for (const [elementId, comment] of incoming) {
				if (this._comments.has(elementId)) {
					continue;
				}
				const pending = this._pendingComments.get(elementId);
				if (pending) {
					this._scheduleCommentPin(elementId, comment.body, comment.ordinal);
				}
			}
			for (const elementId of this._scheduledCommentPins.keys()) {
				if (!incoming.has(elementId)) {
					this._discardPendingComment(elementId);
				}
			}
		}
		for (const elementId of update.pendingCommentIdsToDiscard ?? []) {
			this._discardPendingComment(elementId);
		}
		this._updateCommentPinNumbers();
		this._unmountWhenIdle();
	}

	// --- Event handlers ---

	private _onPointerMove = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._layoutEditMode && this._htmlLayoutEdit?.handlePointerMove(e)) {
			return;
		}
		const isOverPicker = e.composedPath().includes(this._shadowHost);
		if (this._commentTarget) {
			if (!isOverPicker) {
				this._commentPointerInteraction = true;
			}
			return;
		}
		const pendingComment = this._pendingCommentInteractionId ? this._pendingComments.get(this._pendingCommentInteractionId) : undefined;
		if (pendingComment) {
			if (!isOverPicker) {
				pendingComment.pointerInteraction = true;
			}
			return;
		}
		if (this._commentPreviewElementId || this._externalHighlightTarget || isOverPicker) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if (!this._dragStart) {
			this._updateHighlight(this._pickElementAt(e.clientX, e.clientY));
			return;
		}
		const dx = Math.abs(e.clientX - this._dragStart.x);
		const dy = Math.abs(e.clientY - this._dragStart.y);
		if (dx < ElementPicker._DRAG_THRESHOLD_PX && dy < ElementPicker._DRAG_THRESHOLD_PX) {
			return;
		}
		const left = Math.min(this._dragStart.x, e.clientX);
		const top = Math.min(this._dragStart.y, e.clientY);
		this._dragbox.style.display = 'block';
		this._dragbox.style.left = `${left}px`;
		this._dragbox.style.top = `${top}px`;
		this._dragbox.style.width = `${dx}px`;
		this._dragbox.style.height = `${dy}px`;
		// Live preview of the deepest common ancestor that the region
		// currently resolves to, so the user sees exactly what will be
		// selected if they release the drag now.
		this._updateHighlight(this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy }));
	};

	private _onPointerLeave = (): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._commentTarget) {
			this._commentPointerInteraction = true;
			return;
		}
		const pendingComment = this._pendingCommentInteractionId ? this._pendingComments.get(this._pendingCommentInteractionId) : undefined;
		if (pendingComment) {
			pendingComment.pointerInteraction = true;
			return;
		}
		if (this._commentPreviewElementId || this._externalHighlightTarget) {
			return;
		}
		if (!this._dragStart) {
			this._updateHighlight(this._focusedTarget);
		}
	};

	private _onPointerDown = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		this._dismissedCommentOnPointerDown = false;
		if (e.composedPath().includes(this._shadowHost)) {
			return;
		}
		if (this._layoutEditMode && this._htmlLayoutEdit?.handlePointerDown(e)) {
			return;
		}
		if (this._editMode && this._htmlEdit?.isEditInteractionTarget(this._pickElementAt(e.clientX, e.clientY))) {
			return;
		}
		if (this._pendingCommentInteractionId) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (this._commentTarget) {
			this._dismissedCommentOnPointerDown = true;
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		this._dragStart = { x: e.clientX, y: e.clientY };
		this._dragStartTarget = this._pickElementAt(e.clientX, e.clientY);
		if (this._cursorStylesheet) {
			this._cursorStylesheet.textContent = ElementPicker._CURSOR_CROSSHAIR;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onPointerCancel = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._layoutEditMode && this._htmlLayoutEdit?.handlePointerCancel(e)) {
			return;
		}
	};

	private _onPointerUp = (e: PointerEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._layoutEditMode && this._htmlLayoutEdit?.handlePointerUp(e)) {
			return;
		}
		if (this._dismissedCommentOnPointerDown) {
			e.preventDefault();
			e.stopPropagation();
			const commentTarget = this._commentTarget;
			if (commentTarget) {
				window.setTimeout(() => {
					if (this._commentTarget === commentTarget) {
						this._finishCommentInteraction();
					}
				});
			}
			return;
		}
		if (e.composedPath().includes(this._shadowHost)) {
			return;
		}
		if (!this._dragStart) {
			return;
		}
		const dx = Math.abs(e.clientX - this._dragStart.x);
		const dy = Math.abs(e.clientY - this._dragStart.y);
		const start = this._dragStart;
		this._dragStart = undefined;
		if (this._cursorStylesheet) {
			this._cursorStylesheet.textContent = ElementPicker._CURSOR_DEFAULT;
		}

		if (dx < ElementPicker._DRAG_THRESHOLD_PX && dy < ElementPicker._DRAG_THRESHOLD_PX) {
			// Click → pick the element under the pointer.
			const target = this._dragStartTarget ?? this._pickElementAt(e.clientX, e.clientY);
			this._dragStartTarget = undefined;
			if (target) {
				if (this._editMode && this._htmlEdit?.isEditingElement(target)) {
					this._htmlEdit.makeEditable(target, e);
					e.preventDefault();
					e.stopPropagation();
					return;
				}
				this._lastCommitPointerEvent = e;
				this._commit(target, { x: e.clientX, y: e.clientY });
			}
		} else {
			// Drag → pick the deepest common ancestor of the region.
			this._dragStartTarget = undefined;
			this._dragbox.style.display = 'none';
			this._updateHighlight(undefined);
			const left = Math.min(start.x, e.clientX);
			const top = Math.min(start.y, e.clientY);
			const ancestor = this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy });
			if (ancestor) {
				this._commit(ancestor, { x: e.clientX, y: e.clientY });
			}
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onClick = (e: Event): void => {
		if (!this._selectionActive) {
			return;
		}
		if (this._dismissedCommentOnPointerDown) {
			this._dismissedCommentOnPointerDown = false;
			e.preventDefault();
			e.stopPropagation();
			this._finishCommentInteraction();
			return;
		}
		if (e.composedPath().includes(this._shadowHost)) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onFocusIn = (event: FocusEvent): void => {
		if (!this._selectionActive || this._commentTarget || this._pendingCommentInteractionId || this._externalHighlightTarget) {
			return;
		}
		if (event.composedPath().includes(this._shadowHost)) {
			return;
		}
		const focusedElement = this._getFocusedElement();
		this._focusedTarget = focusedElement?.matches(':focus-visible') ? focusedElement : undefined;
		this._updateHighlight(this._focusedTarget);
	};

	private _onWindowBlur = (): void => {
		if (!this._selectionActive || this._commentTarget || this._externalHighlightTarget) {
			return;
		}
		this._focusedTarget = undefined;
		this._updateHighlight(undefined);
	};

	private _onKeyDown = (e: KeyboardEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (e.key === 'Escape') {
			if (this._editMode && this._htmlEdit?.finishActiveTextEdit(false)) {
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			if (this._commentTarget) {
				const target = this._commentTarget;
				this._focusCommentTarget(target);
				this._finishCommentInteraction();
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			this.stop();
			e.preventDefault();
			e.stopPropagation();
		} else if (e.key === 'Enter' && !e.isComposing) {
			if (this._pendingCommentInteractionId) {
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			const focusedElement = this._getFocusedElement();
			if (focusedElement) {
				e.preventDefault();
				e.stopPropagation();
				this._commit(focusedElement);
			}
		}
	};

	private _onScrollOrResize(): void {
		if (this._commentPreviewCollapsing) {
			this._hideActiveCommentPreview();
		}
		this._cancelCommentAnimations();
		if (this._highlightTarget) {
			this._renderHighlight(this._highlightTarget);
		}
		if (this._commentBackdropTarget) {
			this._layoutCommentBackdrop(this._commentBackdropTarget);
		}
		for (const comment of this._comments.values()) {
			this._layoutCommentPin(comment);
		}
	}

	// --- Picking helpers ---

	private _getFocusedElement(): Element | undefined {
		if (!document.hasFocus()) {
			return undefined;
		}
		let activeElement = document.activeElement;
		while (activeElement?.shadowRoot?.activeElement) {
			activeElement = activeElement.shadowRoot.activeElement;
		}
		if (!activeElement || activeElement === document.body || activeElement === document.documentElement || activeElement === this._shadowHost || activeElement instanceof HTMLIFrameElement) {
			return undefined;
		}
		return activeElement;
	}

	/** Return the page element under a viewport point, skipping our own overlay host. */
	private _pickElementAt(x: number, y: number): Element | undefined {
		const candidates = document.elementsFromPoint(x, y);
		for (const el of candidates) {
			if (el === this._shadowHost || this._shadowHost.contains(el)) {
				continue;
			}
			return el;
		}
		return undefined;
	}

	/**
	 * Resolve the element that "covers" a drag rectangle.
	 *
	 * Samples `elementFromPoint` at the 4 corners, 4 edge midpoints, and
	 * center, then returns their deepest common ancestor.
	 */
	private _pickRegionAncestor(rect: IBrowserViewRect): Element | undefined {
		const { x, y, width, height } = rect;
		const x2 = x + width;
		const y2 = y + height;
		const cx = x + width / 2;
		const cy = y + height / 2;
		const samples: Element[] = [];
		for (const [sx, sy] of [
			[x, y], [x2, y], [x, y2], [x2, y2],       // corners
			[cx, y], [cx, y2], [x, cy], [x2, cy],      // edge midpoints
			[cx, cy]                                     // center
		]) {
			const el = this._pickElementAt(sx, sy);
			if (el) {
				samples.push(el);
			}
		}
		return findCommonVisibleAncestor(samples);
	}

	// --- Highlight ---

	private _renderHighlight(target: Element): void {
		const highlight = this._highlight;
		const label = this._label;

		const rect = target.getBoundingClientRect();
		const scrollX = window.scrollX || 0;
		const scrollY = window.scrollY || 0;
		const viewportHeight = window.innerHeight;
		const viewportWidth = document.documentElement.clientWidth;
		const visibleRect = this._getVisibleTargetBounds(rect);
		const labelHeight = 22; // label height (20) + 2px gap above the box.

		// Highlight box is in *page* coordinates so it scrolls with the document.
		highlight.style.display = 'block';
		highlight.style.left = `${rect.left + scrollX}px`;
		highlight.style.top = `${rect.top + scrollY}px`;
		highlight.style.width = `${rect.width}px`;
		highlight.style.height = `${rect.height}px`;
		this._highlightShape.style.display = 'block';
		this._highlightShape.setAttribute('x', `${visibleRect.x}`);
		this._highlightShape.setAttribute('y', `${visibleRect.y}`);
		this._highlightShape.setAttribute('width', `${visibleRect.width}`);
		this._highlightShape.setAttribute('height', `${visibleRect.height}`);
		this._highlightShape.setAttribute('rx', '2');
		// Label is in *viewport* coordinates and sticky-clamped to the viewport.
		const tagName = String(target.tagName || '').toLowerCase();
		const idPart = target.id ? `#${target.id}` : '';
		const classPart = target.classList.length
			? '.' + [...target.classList].join('.')
			: '';
		this._labelSelector.textContent = tagName + idPart;
		this._labelClasses.textContent = classPart;
		this._labelDims.textContent = `${Math.round(rect.width)} \u00d7 ${Math.round(rect.height)}`;
		label.style.display = 'inline-flex';
		const idealTop = rect.top - labelHeight;
		const labelTop = Math.max(0, Math.min(viewportHeight - labelHeight, idealTop));
		// Use clientWidth (excludes scrollbar) rather than innerWidth so the
		// label doesn't extend behind the scrollbar on Windows/Linux.
		// Position label at the element's left edge, but push it left if it
		// would overflow the viewport. Clamp to 0 so it never goes off-screen.
		label.style.left = '0';
		const naturalWidth = label.offsetWidth;
		const idealLeft = rect.left;
		const labelLeft = Math.max(0, Math.min(idealLeft, viewportWidth - naturalWidth));
		label.style.left = `${labelLeft}px`;
		label.style.top = `${labelTop}px`;

		if (this._commentPreview.style.display !== 'none') {
			const previewPlacement = this._layoutCommentSurface(this._commentPreview, visibleRect, viewportWidth, viewportHeight);
			if (this._commentPreviewElementId && previewPlacement === 'above' && this._elementsOverlap(label, this._commentPreview)) {
				label.style.top = `${Math.max(0, Math.min(viewportHeight - labelHeight, visibleRect.bottom + 2))}px`;
			}
		}
		if (this._commentComposer.style.display !== 'none') {
			this._layoutCommentSurface(this._commentComposer, visibleRect, viewportWidth, viewportHeight);
		}
	}

	private _elementsOverlap(first: HTMLElement, second: HTMLElement): boolean {
		const firstBounds = first.getBoundingClientRect();
		const secondBounds = second.getBoundingClientRect();
		return firstBounds.left < secondBounds.right
			&& firstBounds.right > secondBounds.left
			&& firstBounds.top < secondBounds.bottom
			&& firstBounds.bottom > secondBounds.top;
	}

	private _getVisibleTargetBounds(rect: DOMRect): DOMRect {
		const left = Math.max(0, Math.min(rect.left, window.innerWidth));
		const right = Math.max(left, Math.min(rect.right, window.innerWidth));
		const top = Math.max(0, Math.min(rect.top, window.innerHeight));
		const bottom = Math.max(top, Math.min(rect.bottom, window.innerHeight));
		return new DOMRect(left, top, right - left, bottom - top);
	}

	private _layoutCommentSurface(surface: HTMLElement, targetBounds: DOMRect, viewportWidth: number, viewportHeight: number): 'above' | 'below' {
		if (surface === this._commentPreview) {
			surface.style.width = 'max-content';
			surface.style.minWidth = '0';
			surface.style.maxWidth = `${Math.min(320, viewportWidth - 16)}px`;
			const comment = this._commentPreviewElementId ? this._comments.get(this._commentPreviewElementId) : undefined;
			if (comment) {
				const pinBounds = comment.pin.getBoundingClientRect();
				return this._layoutCommentSurfaceAtAnchor(
					surface,
					{ x: pinBounds.left + pinBounds.width / 2, y: pinBounds.top + pinBounds.height / 2 },
					viewportWidth,
					viewportHeight
				);
			}
		} else if (surface === this._commentComposer && this._commentAnchor) {
			surface.style.maxWidth = `${Math.min(320, viewportWidth - 16)}px`;
			return this._layoutCommentSurfaceAtAnchor(
				surface,
				{ x: this._commentAnchor.x - window.scrollX, y: this._commentAnchor.y - window.scrollY },
				viewportWidth,
				viewportHeight
			);
		}
		const surfaceHeight = surface.offsetHeight;
		const belowTop = targetBounds.bottom;
		const placement = belowTop + surfaceHeight <= viewportHeight - 8 ? 'below' : 'above';
		const surfaceTop = belowTop + surfaceHeight <= viewportHeight - 8
			? belowTop
			: Math.max(0, targetBounds.top - surfaceHeight);
		const surfaceWidth = surface.offsetWidth;
		const alignLeft = targetBounds.left + surfaceWidth <= viewportWidth;
		const alignment = alignLeft ? 'left' : 'right';
		const surfaceLeft = alignLeft
			? Math.max(0, targetBounds.left)
			: Math.max(0, targetBounds.right - surfaceWidth);
		surface.dataset.attachmentCorner = `${placement === 'below' ? 'top' : 'bottom'}-${alignment}`;
		this._setCommentSurfacePosition(surface, surfaceLeft, surfaceTop);
		return placement;
	}

	private _layoutCommentSurfaceAtAnchor(surface: HTMLElement, anchor: { x: number; y: number }, viewportWidth: number, viewportHeight: number): 'above' | 'below' {
		const viewportInset = 8;
		let surfaceWidth = surface.offsetWidth;
		const availableRight = Math.max(0, viewportWidth - viewportInset - anchor.x);
		const availableLeft = Math.max(0, anchor.x - viewportInset);
		const opensRight = surfaceWidth <= availableRight || (surfaceWidth > availableLeft && availableRight >= availableLeft);
		const availableWidth = opensRight ? availableRight : availableLeft;
		if (surfaceWidth > availableWidth) {
			surface.style.maxWidth = `${availableWidth}px`;
			surfaceWidth = surface.offsetWidth;
		}

		const surfaceHeight = surface.offsetHeight;
		const availableBelow = Math.max(0, viewportHeight - viewportInset - anchor.y);
		const availableAbove = Math.max(0, anchor.y - viewportInset);
		const opensAbove = surfaceHeight <= availableAbove || (surfaceHeight > availableBelow && availableAbove >= availableBelow);
		const opensBelow = !opensAbove;
		const placement = opensBelow ? 'below' : 'above';
		const alignment = opensRight ? 'left' : 'right';
		surface.dataset.attachmentCorner = `${opensBelow ? 'top' : 'bottom'}-${alignment}`;
		const surfaceLeft = opensRight ? anchor.x : anchor.x - surfaceWidth;
		const surfaceTop = opensBelow ? anchor.y : Math.max(viewportInset, anchor.y - surfaceHeight);
		this._setCommentSurfacePosition(surface, surfaceLeft, surfaceTop);
		return placement;
	}

	private _setCommentSurfacePosition(surface: HTMLElement, left: number, top: number): void {
		if (surface !== this._commentPreview) {
			surface.style.left = `${left}px`;
			surface.style.top = `${top}px`;
			return;
		}

		const padding = ElementPicker._COMMENT_PREVIEW_HIT_PADDING;
		this._commentPreviewHitArea.style.left = `${left - padding}px`;
		this._commentPreviewHitArea.style.top = `${top - padding}px`;
		this._commentPreviewHitArea.style.width = `${surface.offsetWidth + padding * 2}px`;
		this._commentPreviewHitArea.style.height = `${surface.offsetHeight + padding * 2}px`;
		surface.style.left = `${padding}px`;
		surface.style.top = `${padding}px`;
	}

	private _updateHighlight(target: Element | undefined): void {
		this._highlightTarget = target;
		if (!target) {
			this._highlight.style.display = 'none';
			this._highlightShape.style.display = 'none';
			this._label.style.display = 'none';
			return;
		}
		this._renderHighlight(target);
	}

	// --- Commit ---

	private _commit(target: Element, anchor?: { x: number; y: number }): void {
		if (!this._selectionActive) {
			return;
		}
		if (this._commentMode) {
			this._showCommentComposer(target, anchor ?? this._getDefaultCommentAnchor(target), anchor !== undefined);
			return;
		}
		if (this._editMode) {
			this._htmlEdit?.finishActiveTextEdit(true);
			const pointerEvent = this._lastCommitPointerEvent;
			requestAnimationFrame(() => {
				this._onPicked(target);
				if (this._htmlEdit?.shouldStartInlineEdit(target)) {
					this._htmlEdit.makeEditable(target, pointerEvent);
				}
				this._updateHighlight(target);
			});
			return;
		}
		// Wait a frame so any pending event handlers can be completed in the selecting active state.
		requestAnimationFrame(() => {
			if (!this._continuous) {
				// Tear down the overlay before notifying the host so any
				// screenshot capture doesn't include our chrome.
				this.stop();
			} else {
				this._updateHighlight(undefined);
			}
			this._onPicked(target);
		});
	}

	private _getDefaultCommentAnchor(target: Element): { x: number; y: number } {
		const bounds = target.getBoundingClientRect();
		return { x: bounds.left, y: bounds.bottom };
	}

	private _showCommentComposer(target: Element, anchor: { x: number; y: number }, pointerInteraction = false): void {
		this._externalHighlightTarget = undefined;
		this._hideActiveCommentPreview();
		this._commentTarget = target;
		this._commentPointerInteraction = pointerInteraction;
		this._commentAnchor = {
			x: anchor.x + window.scrollX,
			y: anchor.y + window.scrollY
		};
		this._showCommentBackdrop(target);
		this._commentLayer.classList.add('composing');
		this._commentInput.value = '';
		this._commentComposer.style.display = 'flex';
		this._resizeCommentInput();
		this._updateHighlight(target);
		this._animateCommentComposer();
		this._commentInput.focus({ preventScroll: true });
		requestAnimationFrame(() => {
			if (this._commentTarget === target) {
				this._commentInput.focus({ preventScroll: true });
			}
		});
	}

	private _animateCommentComposer(): void {
		if (this._reducedMotion) {
			return;
		}
		this._cancelCommentAnimations();
		this._commentAnimation = {
			surface: this._animateCommentSurface(this._commentComposer),
			supporting: []
		};
	}

	private _setCommentSurfaceTransformOrigin(surface: HTMLElement): void {
		const [verticalOrigin, horizontalOrigin] = (surface.dataset.attachmentCorner ?? 'top-left').split('-');
		surface.style.transformOrigin = `${horizontalOrigin} ${verticalOrigin}`;
	}

	private _closeCommentComposer(): void {
		this._commentTarget = undefined;
		this._commentAnchor = undefined;
		this._hideCommentBackdrop();
		this._commentLayer.classList.remove('composing');
		this._commentComposer.style.display = 'none';
		this._commentInput.value = '';
		this._cancelCommentAnimations();
		this._updateHighlight(undefined);
	}

	private _finishCommentInteraction(): void {
		if (this._continuous) {
			this._closeCommentComposer();
		} else {
			this.stop();
		}
	}

	private _submitComment(): void {
		const target = this._commentTarget;
		const anchor = this._commentAnchor;
		if (!target || !anchor) {
			return;
		}
		const body = this._commentInput.value.replace(/\r?\n/g, ' ');
		const pendingComment = {
			target,
			anchor,
			body,
			pointerInteraction: this._commentPointerInteraction
		};
		this._commentLayer.classList.add('comment-capture-pending');
		this._finishCommentInteraction();
		const elementId = this._onPicked(target, body);
		this._pendingComments.set(elementId, pendingComment);
		this._pendingCommentInteractionId = elementId;
	}

	private _restoreInteractionAfterComment(elementId: string, pending: PendingElementComment): void {
		if (this._pendingCommentInteractionId === elementId) {
			this._pendingCommentInteractionId = undefined;
			this._commentLayer.classList.remove('comment-capture-pending');
		}
		if (this._commentTarget) {
			return;
		}
		if (!pending.pointerInteraction) {
			this._focusCommentTarget(pending.target);
		}
	}

	private _focusCommentTarget(target: Element): void {
		if (!target.isConnected || !(target instanceof HTMLElement || target instanceof SVGElement)) {
			return;
		}

		const hadTabIndex = target.hasAttribute('tabindex');
		if (!hadTabIndex) {
			target.tabIndex = -1;
		}
		target.focus({ preventScroll: true });
		if (!hadTabIndex) {
			target.removeAttribute('tabindex');
		}
	}

	private _discardPendingComment(elementId: string): void {
		const pending = this._pendingComments.get(elementId);
		this._pendingComments.delete(elementId);
		this._cancelScheduledCommentPin(elementId);
		if (pending) {
			this._restoreInteractionAfterComment(elementId, pending);
		}
	}

	private _cancelScheduledCommentPin(elementId: string): void {
		const scheduled = this._scheduledCommentPins.get(elementId);
		if (!scheduled) {
			return;
		}
		window.clearTimeout(scheduled.timeout);
		cancelAnimationFrame(scheduled.animationFrame);
		this._scheduledCommentPins.delete(elementId);
	}

	private _scheduleCommentPin(elementId: string, body: string, ordinal: number): void {
		const existing = this._scheduledCommentPins.get(elementId);
		if (existing) {
			existing.body = body;
			existing.ordinal = ordinal;
			return;
		}

		const scheduled: ScheduledCommentPin = { body, ordinal, animationFrame: 0, timeout: 0 };
		this._scheduledCommentPins.set(elementId, scheduled);
		let frameCount = 0;
		const finish = () => {
			if (this._scheduledCommentPins.get(elementId) !== scheduled) {
				return;
			}
			this._cancelScheduledCommentPin(elementId);
			const pending = this._pendingComments.get(elementId);
			if (pending) {
				this._createCommentPin(elementId, pending.target, pending.anchor, scheduled.body, scheduled.ordinal);
			}
		};
		const waitForFrame = () => {
			if (this._scheduledCommentPins.get(elementId) !== scheduled) {
				return;
			}
			frameCount++;
			if (frameCount >= ElementPicker._COMMENT_PIN_RESTORE_FRAMES) {
				finish();
			} else {
				scheduled.animationFrame = requestAnimationFrame(waitForFrame);
			}
		};
		scheduled.timeout = window.setTimeout(finish, ElementPicker._COMMENT_PIN_RESTORE_TIMEOUT);
		scheduled.animationFrame = requestAnimationFrame(waitForFrame);
	}

	private _createCommentPin(elementId: string, target: Element, anchor: { x: number; y: number }, body: string, ordinal: number): void {
		this._ensureMounted();
		const existing = this._comments.get(elementId);
		if (existing && this._commentPreviewElementId === elementId) {
			this._hideActiveCommentPreview();
		}
		existing?.pin.remove();
		const pending = this._pendingComments.get(elementId);
		this._pendingComments.delete(elementId);
		const rect = target.getBoundingClientRect();
		const offset = {
			x: anchor.x - (rect.left + window.scrollX),
			y: anchor.y - (rect.top + window.scrollY)
		};

		const pin = document.createElement('div');
		pin.className = 'comment-pin';
		pin.tabIndex = 0;
		pin.setAttribute('role', 'note');
		const bubble = document.createElement('span');
		bubble.className = 'comment-pin-bubble';
		const numberElement = document.createElement('span');
		numberElement.className = 'comment-pin-number';
		bubble.appendChild(numberElement);
		pin.appendChild(bubble);

		const show = () => {
			if (this._commentTarget || this._pendingCommentInteractionId || this._externalHighlightTarget) {
				return;
			}
			this._showCommentPreview(elementId, target, body);
		};
		pin.addEventListener('pointermove', show);
		pin.addEventListener('focusin', show);
		pin.addEventListener('focusout', () => this._scheduleCommentPreviewHide());
		this._commentLayer.appendChild(pin);
		const comment = { target, pin, numberElement, body, ordinal, offset };
		this._comments.set(elementId, comment);
		this._updateCommentPinNumbers();
		this._layoutCommentPin(comment);
		if (pending) {
			this._restoreInteractionAfterComment(elementId, pending);
		}
	}

	private _updateCommentPinNumbers(): void {
		for (const comment of this._comments.values()) {
			const numberLabel = String(comment.ordinal);
			comment.numberElement.textContent = numberLabel;
			comment.pin.title = comment.body || this._formatLocalizedString(localizedStrings.elementComment, numberLabel);
			comment.pin.setAttribute(
				'aria-label',
				comment.body
					? this._formatLocalizedString(localizedStrings.elementCommentWithBody, numberLabel, comment.body)
					: this._formatLocalizedString(localizedStrings.emptyElementComment, numberLabel)
			);
		}
	}

	private _applyLocalizedStrings(): void {
		this._commentPreviewRemoveButton.title = localizedStrings.removeComment;
		this._commentPreviewRemoveButton.setAttribute('aria-label', localizedStrings.removeElementComment);
		this._commentComposer.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		this._commentInput.placeholder = localizedStrings.addCommentPlaceholder;
		this._commentInput.setAttribute('aria-label', localizedStrings.commentOnSelectedElement);
		this._commentSendButton.title = localizedStrings.addComment;
		this._commentSendButton.setAttribute('aria-label', localizedStrings.addComment);
		this._updateCommentPinNumbers();
	}

	private _formatLocalizedString(template: string, ...values: readonly string[]): string {
		return template.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? '');
	}

	private _layoutCommentPin(comment: { target: Element; pin: HTMLDivElement; offset: { x: number; y: number } }): void {
		const rect = comment.target.getBoundingClientRect();
		const x = rect.left + window.scrollX + comment.offset.x;
		const y = rect.top + window.scrollY + comment.offset.y;
		const scrollingElement = document.scrollingElement ?? document.documentElement;
		const halfWidth = comment.pin.offsetWidth / 2;
		const halfHeight = comment.pin.offsetHeight / 2;
		const clampedX = Math.max(halfWidth, Math.min(x, scrollingElement.scrollWidth - halfWidth));
		const clampedY = Math.max(halfHeight, Math.min(y, scrollingElement.scrollHeight - halfHeight));
		comment.pin.style.left = `${clampedX}px`;
		comment.pin.style.top = `${clampedY}px`;
	}

	private _showCommentPreview(elementId: string, target: Element, fallbackBody: string): void {
		if (this._pendingCommentInteractionId || this._commentPreviewCollapsing) {
			return;
		}
		if (this._commentPreviewElementId === elementId) {
			this._cancelCommentPreviewHide();
			return;
		}
		this._hideActiveCommentPreview();
		this._commentPreviewElementId = elementId;
		const comment = this._comments.get(elementId);
		if (comment) {
			comment.pin.classList.add('previewing');
			comment.pin.after(this._commentPreviewHitArea);
		}
		const body = comment?.body ?? fallbackBody;
		this._setCommentPreviewBody(body);
		this._shadowHost.classList.add('comment-preview-active');
		this._updateHighlight(target);
		this._showCommentBackdrop(target);
		if (comment) {
			this._animateCommentPreview();
		}
	}

	private _setCommentPreviewBody(body: string): void {
		this._commentPreviewBody.textContent = body;
		this._commentPreview.title = body;
		this._commentPreview.classList.toggle('empty', !body);
		this._commentPreviewHitArea.style.display = 'block';
		this._commentPreview.style.display = 'flex';
	}

	private _animateCommentPreview(collapsing = false): Animation | undefined {
		if (this._reducedMotion) {
			return undefined;
		}
		const previewAnimation = this._animateCommentSurface(this._commentPreview, collapsing);
		const supportingKeyframes: Keyframe[] = collapsing ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }];
		const supportingAnimations: Animation[] = [];
		for (const element of [this._highlightShape, this._label]) {
			if (element.style.display === 'none') {
				continue;
			}
			const animation = element.animate(supportingKeyframes, { duration: ElementPicker._COMMENT_SUPPORTING_FADE_DURATION, easing: 'linear', fill: 'both' });
			supportingAnimations.push(animation);
		}
		this._commentAnimation = { surface: previewAnimation, supporting: supportingAnimations };
		return previewAnimation;
	}

	private _animateCommentSurface(surface: HTMLElement, collapsing = false): Animation {
		this._setCommentSurfaceTransformOrigin(surface);
		return surface.animate(
			collapsing ? [{ transform: 'scale(1)' }, { transform: 'scale(0)' }] : [{ transform: 'scale(0)' }, { transform: 'scale(1)' }],
			{ duration: ElementPicker._COMMENT_SURFACE_ANIMATION_DURATION, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }
		);
	}

	private _scheduleCommentPreviewHide(): void {
		if (this._commentPreviewCollapsing) {
			return;
		}
		this._cancelCommentPreviewHide();
		this._commentPreviewHideTimeout = window.setTimeout(() => {
			this._commentPreviewHideTimeout = undefined;
			const comment = this._commentPreviewElementId ? this._comments.get(this._commentPreviewElementId) : undefined;
			const pinFocused = comment?.pin.matches(':focus-within') ?? false;
			const hitAreaActive = this._commentPreviewHitArea.matches(':hover, :focus-within');
			if (pinFocused || hitAreaActive) {
				return;
			}
			this._collapseActiveCommentPreview();
		}, ElementPicker._COMMENT_PREVIEW_HIDE_DELAY);
	}

	private _cancelCommentPreviewHide(): void {
		if (this._commentPreviewHideTimeout !== undefined) {
			window.clearTimeout(this._commentPreviewHideTimeout);
			this._commentPreviewHideTimeout = undefined;
		}
	}

	private _collapseActiveCommentPreview(): void {
		if (this._commentPreviewCollapsing) {
			return;
		}
		const elementId = this._commentPreviewElementId;
		const comment = elementId ? this._comments.get(elementId) : undefined;
		if (!elementId || !comment || this._reducedMotion) {
			this._hideActiveCommentPreview();
			return;
		}

		this._commentPreviewCollapsing = true;
		this._shadowHost.classList.add('comment-preview-collapsing');
		this._hideCommentBackdrop();
		const commentAnimation = this._commentAnimation;
		let surfaceAnimation: Animation | undefined;
		if (commentAnimation) {
			surfaceAnimation = commentAnimation.surface;
			surfaceAnimation.reverse();
			for (const animation of commentAnimation.supporting) {
				animation.reverse();
			}
		} else {
			surfaceAnimation = this._animateCommentPreview(true);
		}
		if (!surfaceAnimation) {
			this._hideActiveCommentPreview();
			return;
		}
		surfaceAnimation.onfinish = () => {
			if (this._commentPreviewCollapsing && this._commentPreviewElementId === elementId) {
				this._commentPreviewCollapsing = false;
				this._hideActiveCommentPreview();
			}
		};
	}

	private _cancelCommentAnimations(): void {
		if (!this._commentAnimation) {
			return;
		}
		this._commentAnimation.surface.cancel();
		for (const animation of this._commentAnimation.supporting) {
			animation.cancel();
		}
		this._commentAnimation = undefined;
	}

	private _hideActiveCommentPreview(): void {
		this._cancelCommentPreviewHide();
		this._commentPreviewCollapsing = false;
		this._shadowHost.classList.remove('comment-preview-collapsing');
		if (this._commentPreviewElementId) {
			this._comments.get(this._commentPreviewElementId)?.pin.classList.remove('previewing');
		}
		this._commentPreviewElementId = undefined;
		this._shadowHost.classList.remove('comment-preview-active');
		this._commentPreviewHitArea.style.display = 'none';
		this._commentPreview.style.display = 'none';
		this._hideCommentBackdrop();
		if (!this._commentTarget) {
			this._updateHighlight(this._externalHighlightTarget);
		}
		this._cancelCommentAnimations();
	}

	private _removeComment(elementId: string): void {
		const comment = this._comments.get(elementId);
		if (!comment) {
			return;
		}
		this._hideActiveCommentPreview();
		comment.pin.remove();
		this._comments.delete(elementId);
		this._updateCommentPinNumbers();
		this._unmountWhenIdle();
		this._onCommentRemoved(elementId);
	}

	private _layoutCommentInput(): void {
		this._resizeCommentInput();
		this._layoutCommentComposer();
	}

	private _resizeCommentInput(): void {
		this._commentInput.style.height = 'auto';
		this._commentInput.style.height = `${Math.min(this._commentInput.scrollHeight, 96)}px`;
	}

	private _layoutCommentBackdrop(target: Element): void {
		const rect = this._getVisibleTargetBounds(target.getBoundingClientRect());
		this._commentBackdropCutout.setAttribute('x', `${rect.x}`);
		this._commentBackdropCutout.setAttribute('y', `${rect.y}`);
		this._commentBackdropCutout.setAttribute('width', `${rect.width}`);
		this._commentBackdropCutout.setAttribute('height', `${rect.height}`);
		this._commentBackdropCutout.setAttribute('rx', '2');
	}

	private _showCommentBackdrop(target: Element): void {
		const request = ++this._commentBackdropRequest;
		this._commentBackdropTarget = target;
		this._layoutCommentBackdrop(target);
		this._commentBackdrop.classList.remove('visible');
		requestAnimationFrame(() => {
			if (this._commentBackdropRequest === request) {
				this._commentBackdrop.classList.add('visible');
			}
		});
	}

	private _hideCommentBackdrop(): void {
		this._commentBackdropRequest++;
		this._commentBackdropTarget = undefined;
		this._commentBackdrop.classList.remove('visible');
	}

	private _layoutCommentComposer(): void {
		if (!this._commentTarget) {
			return;
		}
		this._renderHighlight(this._commentTarget);
	}

	private _ensureMounted(): void {
		if (!this._shadowHost.parentNode) {
			document.documentElement.appendChild(this._shadowHost);
		}
	}

	private _unmountWhenIdle(): void {
		if (!this._selectionActive && !this._highlightTarget && this._comments.size === 0) {
			this._shadowHost.remove();
		}
	}

	// --- Static helpers ---

	/**
	 * Inject the shadow-root stylesheet. Custom properties on the host
	 * element drive the colors so the workbench can theme them.
	 *
	 * We deliberately do **not** use a `*` selector with `all: initial` —
	 * that would also reset `<style>`'s default `display: none`, causing
	 * the literal CSS source to render as page text.
	 */
	private static _buildStyle(): HTMLStyleElement {
		const style = document.createElement('style');
		style.textContent = `
			:host {
				all: initial;
				font-family: var(--pick-font, system-ui, -apple-system, sans-serif);
				pointer-events: none !important;
			}
			.highlight {
				position: absolute; box-sizing: border-box;
				z-index: 2;
			}
			.comment-backdrop {
				position: fixed;
				inset: 0;
				width: 100%;
				height: 100%;
				pointer-events: none;
				z-index: 2;
			}
			.comment-backdrop-fill {
				fill: var(--vscode-widget-shadow, transparent);
				opacity: 0;
				transition: opacity 120ms linear;
			}
			.comment-backdrop.visible .comment-backdrop-fill {
				opacity: 1;
			}
			.highlight-shape {
				fill: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				stroke: var(--vscode-focusBorder, #0078d4);
				stroke-width: 2px;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent; box-sizing: border-box;
				z-index: 2;
			}
			.comment-layer {
				position: absolute; inset: 0; pointer-events: none;
			}
			.comment-surface {
				position: fixed;
				box-sizing: border-box;
				width: min(320px, calc(100vw - 16px));
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-large, 8px);
				background: var(--vscode-editorWidget-background, #252526);
				color: var(--vscode-editorWidget-foreground, #cccccc);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
				font-size: 13px;
				font-weight: 400;
				z-index: 4;
			}
			.comment-surface[data-attachment-corner='top-left'] {
				border-top-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='top-right'] {
				border-top-right-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-left'] {
				border-bottom-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-right'] {
				border-bottom-right-radius: 0;
			}
			.comment-preview-hit-area {
				position: fixed;
				pointer-events: none;
				z-index: 4;
			}
			.comment-preview {
				position: absolute;
				align-items: flex-start;
				gap: 8px;
				max-height: 96px;
				padding: 6px 8px;
				overflow: hidden;
				line-height: 20px;
				pointer-events: none;
			}
			.comment-preview.empty {
				gap: 0;
				padding: 4px;
			}
			.comment-preview.empty .comment-preview-body {
				display: none;
			}
			.comment-preview.empty .comment-preview-remove {
				margin-block: 0;
			}
			.comment-preview-body {
				flex: 1;
				min-width: 0;
				max-height: 82px;
				overflow-x: hidden;
				overflow-y: auto;
				overflow-wrap: anywhere;
				scrollbar-width: thin;
				white-space: pre-wrap;
			}
			:host(.comment-preview-active) .comment-preview-hit-area,
			:host(.comment-preview-active) .comment-preview {
				pointer-events: auto;
			}
			:host(.comment-preview-collapsing) .comment-preview-hit-area,
			:host(.comment-preview-collapsing) .comment-preview {
				pointer-events: none;
			}
			.comment-preview-remove {
				flex: none;
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 24px;
				height: 24px;
				margin-block: -2px;
				padding: 0;
				border: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, inherit);
				cursor: pointer;
				font-family: inherit;
			}
			.comment-preview-remove svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-preview-remove:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-composer {
				align-items: flex-end; gap: 6px; padding: 6px;
				pointer-events: auto;
			}
			.comment-input {
				flex: 1; min-width: 0; resize: none; overflow: auto;
				scrollbar-width: none;
				box-sizing: border-box; margin: 0; padding: 2px 6px;
				background: transparent; color: inherit;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-small, 4px);
				outline: 0;
				font: inherit;
				line-height: 20px;
				caret-color: var(--vscode-focusBorder, currentColor);
			}
			.comment-input::-webkit-scrollbar {
				display: none;
			}
			.comment-input::placeholder {
				color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground, #ccccccb3));
				opacity: 1;
			}
			.comment-send {
				box-sizing: border-box; border: 0; cursor: pointer; font-family: inherit;
			}
			.comment-send {
				flex: none; width: 24px; height: 24px; padding: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, #cccccc);
				display: grid;
				place-items: center;
			}
			.comment-send svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-send:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-pin {
				position: absolute;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				transform: translate(-11px, -11px);
				pointer-events: auto;
				z-index: 0;
				transition: opacity 120ms linear;
			}
			.comment-layer.composing .comment-pin {
				opacity: 0;
				pointer-events: none;
				z-index: auto;
			}
			.comment-layer.comment-capture-pending .comment-pin {
				visibility: hidden;
			}
			.comment-pin:hover, .comment-pin:focus-within {
				z-index: 1;
			}
			.comment-pin.previewing {
				z-index: 0;
			}
			:host(.comment-preview-active) .comment-pin:not(.previewing) {
				opacity: 0.35;
			}
			.comment-pin.previewing .comment-pin-bubble {
				width: 6px;
				height: 6px;
				border-width: 0;
			}
			.comment-pin.previewing .comment-pin-number {
				opacity: 0;
			}
			.comment-pin-bubble {
				box-sizing: border-box;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				padding: 0;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-background, #252526);
				border-radius: var(--vscode-cornerRadius-circle, 9999px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
				transition: width 140ms cubic-bezier(0.2, 0, 0, 1), height 140ms cubic-bezier(0.2, 0, 0, 1), border-width 140ms cubic-bezier(0.2, 0, 0, 1);
			}
			.comment-pin-number {
				display: block;
				width: 100%;
				font-size: 11px;
				font-weight: 600;
				line-height: 12px;
				text-align: center;
				transition: opacity 80ms linear;
			}
			.comment-send:focus-visible, .comment-preview-remove:focus-visible, .comment-pin:focus-visible, .comment-input:focus-visible {
				outline: 2px solid var(--vscode-focusBorder, #0078d4);
				outline-offset: 2px;
			}
			:host(.reduce-motion) .comment-backdrop-fill,
			:host(.reduce-motion) .comment-pin,
			:host(.reduce-motion) .comment-pin-bubble,
			:host(.reduce-motion) .comment-pin-number {
				transition: none;
			}
			.label {
				position: fixed; box-sizing: border-box;
				display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 6px;
				max-width: min(100%, 320px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				font-family: inherit;
				font-size: 11px; line-height: 20px;
				white-space: nowrap;
				border-radius: 2px;
				box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
				z-index: 3;
			}
			.label-info {
				display: inline-block; overflow: hidden; text-overflow: ellipsis; min-width: 0;
			}
			.label-selector {
				font-weight: 600;
			}
			.label-dims {
				flex-shrink: 0; opacity: 0.8;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dotted var(--vscode-focusBorder, #a0aabe);
				background: transparent;
				z-index: 2;
			}
		`;
		return style;
	}

	private static _applyTheme(host: HTMLElement, theme: IBrowserViewTheme | undefined): void {
		host.style.setProperty('--vscode-focusBorder', theme?.focusBorder ?? null);
		host.style.setProperty('--vscode-button-background', theme?.buttonBackground ?? null);
		host.style.setProperty('--vscode-button-foreground', theme?.buttonForeground ?? null);
		host.style.setProperty('--vscode-editorWidget-background', theme?.widgetBackground ?? null);
		host.style.setProperty('--vscode-editorWidget-foreground', theme?.widgetForeground ?? null);
		host.style.setProperty('--vscode-editorWidget-border', theme?.widgetBorder ?? null);
		host.style.setProperty('--vscode-widget-shadow', theme?.widgetShadow ?? null);
		host.style.setProperty('--vscode-contrastBorder', theme?.contrastBorder ?? null);
		host.style.setProperty('--vscode-descriptionForeground', theme?.descriptionForeground ?? null);
		host.style.setProperty('--vscode-input-placeholderForeground', theme?.inputPlaceholderForeground ?? null);
		host.style.setProperty('--vscode-toolbar-hoverBackground', theme?.toolbarHoverBackground ?? null);
		host.style.setProperty('--pick-font', theme?.font ?? null);
	}
}

/**
 * Drag-to-select rectangle picker used by the "Add Area Screenshot to Chat"
 * flow. Mounts a transparent shadow overlay that captures pointer
 * events, draws a dotted rubber-band rectangle while dragging, and on pointer
 * up reports the selected region in **viewport coordinates**. ESC or a
 * zero-area drag cancels the pick.
 */
class AreaPicker {
	private static readonly _MIN_AREA_PX = 4;
	private static readonly _CURSOR_CROSSHAIR = '/* VS Code injected style */ * { cursor: crosshair !important; }';

	private _selectionActive = false;

	private readonly _shadowHost: HTMLDivElement;
	private readonly _dragbox: HTMLDivElement;

	private _dragStart: { x: number; y: number } | undefined;
	private _cursorStylesheet: HTMLStyleElement | undefined;

	constructor(
		private readonly _onPicked: (rect: IBrowserViewRect) => void,
		private readonly _onStopped: () => void
	) {
		const shadowHost = document.createElement('div');
		shadowHost.setAttribute('data-vscode-area-pick-host', '');
		shadowHost.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
		const root = shadowHost.attachShadow({ mode: 'closed' });
		root.appendChild(AreaPicker._buildStyle());
		this._shadowHost = shadowHost;

		// A fixed full-viewport layer below the dragbox so the page underneath
		// doesn't receive hover/click events while we're picking. The layer is
		// transparent — the actual page is still visible.
		const overlay = document.createElement('div');
		overlay.className = 'overlay';
		root.appendChild(overlay);

		const dragbox = document.createElement('div');
		dragbox.className = 'dragbox';
		dragbox.style.display = 'none';
		root.appendChild(dragbox);
		this._dragbox = dragbox;
	}

	start(): void {
		if (this._selectionActive) {
			return;
		}
		this._dragStart = undefined;

		document.documentElement.appendChild(this._shadowHost);
		this._selectionActive = true;

		// Force a crosshair cursor across the whole page while picking.
		const cursorStyle = document.createElement('style');
		cursorStyle.setAttribute('data-vscode-area-pick-cursor', '');
		cursorStyle.textContent = AreaPicker._CURSOR_CROSSHAIR;
		document.head.appendChild(cursorStyle);
		this._cursorStylesheet = cursorStyle;

		window.addEventListener('pointermove', this._onPointerMove, true);
		window.addEventListener('pointerdown', this._onPointerDown, true);
		window.addEventListener('pointerup', this._onPointerUp, true);
		window.addEventListener('click', this._onClick, true);
		window.addEventListener('contextmenu', this._onClick, true);
		window.addEventListener('keydown', this._onKeyDown, true);
	}

	stop(): void {
		if (!this._selectionActive) {
			return;
		}
		this._teardown();
		this._onStopped();
	}

	/**
	 * Synchronous teardown of the overlay, cursor style, and event listeners.
	 * Used by both {@link stop} (which then fires `_onStopped`) and `_onPointerUp`
	 * (which fires `_onPicked` or `_onStopped` after teardown completes, so the
	 * IPC consumer can capture the page without our overlay in the frame).
	 */
	private _teardown(): void {
		this._selectionActive = false;
		this._shadowHost.remove();

		this._cursorStylesheet?.remove();
		this._cursorStylesheet = undefined;

		window.removeEventListener('pointermove', this._onPointerMove, true);
		window.removeEventListener('pointerdown', this._onPointerDown, true);
		window.removeEventListener('pointerup', this._onPointerUp, true);
		window.removeEventListener('click', this._onClick, true);
		window.removeEventListener('contextmenu', this._onClick, true);
		window.removeEventListener('keydown', this._onKeyDown, true);

		this._dragbox.style.display = 'none';
		this._dragbox.style.left = '0px';
		this._dragbox.style.top = '0px';
		this._dragbox.style.width = '0px';
		this._dragbox.style.height = '0px';
		this._dragStart = undefined;
	}

	setTheme(theme: IBrowserViewTheme): void {
		this._shadowHost.style.setProperty('--vscode-focusBorder', theme?.focusBorder ?? null);
	}

	private _onPointerDown = (e: PointerEvent): void => {
		if (!this._selectionActive || e.button !== 0) {
			return;
		}
		this._dragStart = { x: e.clientX, y: e.clientY };
		this._dragbox.style.display = 'block';
		this._dragbox.style.left = `${e.clientX}px`;
		this._dragbox.style.top = `${e.clientY}px`;
		this._dragbox.style.width = '0px';
		this._dragbox.style.height = '0px';
		e.preventDefault();
		e.stopPropagation();
	};

	private _onPointerMove = (e: PointerEvent): void => {
		if (!this._selectionActive || !this._dragStart) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		const left = Math.min(this._dragStart.x, e.clientX);
		const top = Math.min(this._dragStart.y, e.clientY);
		const width = Math.abs(e.clientX - this._dragStart.x);
		const height = Math.abs(e.clientY - this._dragStart.y);
		this._dragbox.style.left = `${left}px`;
		this._dragbox.style.top = `${top}px`;
		this._dragbox.style.width = `${width}px`;
		this._dragbox.style.height = `${height}px`;
	};

	private _onPointerUp = (e: PointerEvent): void => {
		if (!this._selectionActive || !this._dragStart) {
			return;
		}
		const start = this._dragStart;

		const left = Math.min(start.x, e.clientX);
		const top = Math.min(start.y, e.clientY);
		const width = Math.abs(e.clientX - start.x);
		const height = Math.abs(e.clientY - start.y);

		// Tear down the overlay before committing so the IPC consumer can
		// immediately start a screenshot without our dragbox being in the way.
		this._teardown();

		e.preventDefault();
		e.stopPropagation();

		if (width < AreaPicker._MIN_AREA_PX || height < AreaPicker._MIN_AREA_PX) {
			this._onStopped();
			return;
		}

		// Keep rectangle in viewport (client) coordinates to match other screenshot
		// capture call sites that pass viewport-space bounds as pageRect. The
		// main-process clip math (`pageRect * visualViewportScale * zoomFactor`)
		// measures from the visual viewport origin, so subtract the visual
		// viewport's offset (non-zero only when pinch-panned) to convert layout-
		// viewport client coords into the same coord space that Add Element to
		// Chat's CDP box-model bounds use.
		const vv = window.visualViewport;
		const offsetLeft = vv?.offsetLeft ?? 0;
		const offsetTop = vv?.offsetTop ?? 0;
		const rect = { x: left - offsetLeft, y: top - offsetTop, width, height };

		// The synchronous DOM teardown above is the prerequisite — the next compositor
		// frame won't contain the overlay. Waiting for that frame to actually land
		// before reading the GPU surface is the consumer's responsibility (see
		// `awaitNextPaint` in `BrowserView.captureScreenshot`).
		this._onPicked(rect);
	};

	private _onClick = (e: Event): void => {
		if (!this._selectionActive) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	};

	private _onKeyDown = (e: KeyboardEvent): void => {
		if (!this._selectionActive) {
			return;
		}
		if (e.key === 'Escape') {
			this.stop();
			e.preventDefault();
			e.stopPropagation();
		}
	};

	private static _buildStyle(): HTMLStyleElement {
		const style = document.createElement('style');
		style.textContent = `
			:host {
				all: initial;
				pointer-events: none !important;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent;
				z-index: 1;
				/* Capture hit-testing so pointer events don't reach the underlying
				 * page during a pick — otherwise hover/:hover styles would
				 * fire on elements beneath the cursor while we're dragging. */
				pointer-events: auto;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dashed var(--vscode-focusBorder, #0078d4);
				background: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				z-index: 2;
				pointer-events: auto;
			}
		`;
		return style;
	}
}

init();
