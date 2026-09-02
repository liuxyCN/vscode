/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, isHTMLInputElement } from '../../../../../base/browser/dom.js';
import { getFonts } from '../../../../../base/browser/fonts.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { ISashEvent, Orientation, Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { IElementData } from '../../../../../platform/browserView/common/browserView.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { SaveReason, SaveSourceRegistry } from '../../../../common/editor.js';
import { ITextFileService, ITextFileEditorModel, TextFileResolveReason } from '../../../../services/textfile/common/textfiles.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { applyBrowserHtmlPatch, IBrowserHtmlPatch } from '../browserHtmlSourcePatches.js';
import { BrowserHtmlEditColorPickerController } from '../browserHtmlEditColorPicker.js';
import {
	BODY_DOM_PATH,
	BROWSER_HTML_EDIT_STYLE_PROPS,
	BrowserHtmlEditStyleKey,
	buildBrowserHtmlEditSavePatch,
	cloneBrowserHtmlEditDraft,
	composeTextDecorationFlags,
	diffBrowserHtmlEditStyles,
	emptyBrowserHtmlEditDraft,
	IBrowserHtmlEditDraft,
	inferBrowserHtmlEditKind,
	parseTextDecorationFlags,
	readBrowserHtmlEditStyles,
} from '../browserHtmlEditTypes.js';
import { browserViewLabel } from '../../common/browserViewI18n.js';
import {
	CONTEXT_BROWSER_HTML_EDIT_AVAILABLE,
	isAssociatedHtmlResource,
} from './browserEditorEditFeature.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	IContainerLayoutOverride,
} from '../browserEditor.js';
import { IBrowserAutoReloadService } from './browserAutoReloadFeatures.js';

const HTML_EDIT_PANEL_DEFAULT_WIDTH = 360;
const HTML_EDIT_PANEL_MIN_WIDTH = 280;
const HTML_EDIT_PANEL_MAX_WIDTH = 640;
const HTML_EDIT_PANEL_WIDTH_KEY = 'browser.htmlEditPanelWidth';
const MAX_HISTORY = 50;

const FONT_FAMILY_GENERIC = ['inherit', 'system-ui', 'sans-serif', 'serif', 'monospace'] as const;

const FONT_WEIGHT_VALUES = ['normal', '100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold'] as const;

const TEXT_ALIGN_OPTIONS = [
	{ value: 'left', labelKey: 'htmlEditTextAlignLeft' as const, fallback: 'Left' },
	{ value: 'center', labelKey: 'htmlEditTextAlignCenter' as const, fallback: 'Center' },
	{ value: 'right', labelKey: 'htmlEditTextAlignRight' as const, fallback: 'Right' },
	{ value: 'justify', labelKey: 'htmlEditTextAlignJustify' as const, fallback: 'Justify' },
] as const;

const TEXT_STYLE_OPTIONS = [
	{ key: 'fontStyle' as const, value: 'italic', labelKey: 'htmlEditItalic' as const, fallback: 'Italic', iconClass: 'italic' },
	{ key: 'textDecoration' as const, decoration: 'underline' as const, labelKey: 'htmlEditUnderline' as const, fallback: 'Underline', iconClass: 'underline' },
	{ key: 'textDecoration' as const, decoration: 'line-through' as const, labelKey: 'htmlEditStrikethrough' as const, fallback: 'Strikethrough', iconClass: 'strikethrough' },
] as const;

const BORDER_STYLE_OPTIONS = [
	{ value: '', labelKey: 'htmlEditBorderStyleNone' as const, fallback: 'None' },
	{ value: 'solid', labelKey: 'htmlEditBorderStyleSolid' as const, fallback: 'Solid' },
	{ value: 'dashed', labelKey: 'htmlEditBorderStyleDashed' as const, fallback: 'Dashed' },
	{ value: 'dotted', labelKey: 'htmlEditBorderStyleDotted' as const, fallback: 'Dotted' },
] as const;

function fontFamilyGenericLabel(family: typeof FONT_FAMILY_GENERIC[number]): string {
	switch (family) {
		case 'inherit': return browserViewLabel('htmlEditFontFamilyInherit', 'Inherit');
		case 'system-ui': return browserViewLabel('htmlEditFontFamilySystemUi', 'System UI');
		case 'sans-serif': return browserViewLabel('htmlEditFontFamilySansSerif', 'Sans-serif');
		case 'serif': return browserViewLabel('htmlEditFontFamilySerif', 'Serif');
		case 'monospace': return browserViewLabel('htmlEditFontFamilyMonospace', 'Monospace');
	}
}

function fontWeightLabel(weight: typeof FONT_WEIGHT_VALUES[number]): string {
	switch (weight) {
		case 'normal': return browserViewLabel('htmlEditFontWeightNormal', 'Normal');
		case 'bold': return browserViewLabel('htmlEditFontWeightBold', 'Bold');
		default: return weight;
	}
}

class BrowserEditorHtmlEditContribution extends BrowserEditorContribution {

	private static readonly SAVE_SOURCE = SaveSourceRegistry.registerSource(
		'browserHtmlEdit.source',
		localize('browserHtmlEdit.saveSource', "Browser HTML Edit"),
	);
	private readonly _panel: HTMLElement;
	private readonly _scroll: HTMLElement;
	private readonly _contentSection: HTMLElement;
	private readonly _textField: HTMLElement;
	private readonly _textInput: HTMLTextAreaElement;
	private readonly _hrefField: HTMLElement;
	private readonly _hrefInput: HTMLInputElement;
	private readonly _srcField: HTMLElement;
	private readonly _srcInput: HTMLInputElement;
	private readonly _altField: HTMLElement;
	private readonly _altInput: HTMLInputElement;
	private readonly _contentOuterHtmlField: HTMLElement;
	private readonly _contentOuterHtmlInput: HTMLTextAreaElement;
	private readonly _styleInputs = new Map<BrowserHtmlEditStyleKey, HTMLInputElement | HTMLSelectElement>();
	private readonly _textAlignButtons = new Map<string, Button>();
	private readonly _textStyleButtons = new Map<string, Button>();
	private readonly _colorSwatches = new Map<BrowserHtmlEditStyleKey, HTMLElement>();
	private readonly _colorClearButtons = new Map<BrowserHtmlEditStyleKey, HTMLButtonElement>();
	private readonly _colorPicker: BrowserHtmlEditColorPickerController;
	private _fontFamilySelect: HTMLSelectElement | undefined;
	private _systemFontsLoaded = false;
	private readonly _selector: HTMLElement;
	private readonly _saveButton: Button;
	private readonly _undoButton: Button;
	private readonly _redoButton: Button;
	private readonly _deleteButton: Button;
	private readonly _saveStatus: HTMLElement;
	private readonly _htmlEditAvailableContext: IContextKey<boolean>;

	private _panelWidth = HTML_EDIT_PANEL_DEFAULT_WIDTH;
	private _resizeSash: Sash | undefined;
	private _resizeStartWidth = HTML_EDIT_PANEL_DEFAULT_WIDTH;

	private _editModeActive = false;
	private _selected: IElementData | undefined;
	private _associatedResource: URI | undefined;
	private _wrapper: HTMLElement | undefined;
	private _saveStatusHideHandle: IDisposable | undefined;
	private _pendingEditModeRestore = false;
	private _pendingEditModeRestoreClear: IDisposable | undefined;
	private _preserveHistoryOnEditModeEnter = false;
	private _draft = emptyBrowserHtmlEditDraft();
	private _baselineDraft = emptyBrowserHtmlEditDraft();
	private _lastPreviewStyles: Partial<Record<BrowserHtmlEditStyleKey, string>> = {};
	private _history: string[] = [];
	private _historyIndex = -1;
	private _suppressPreview = false;
	private readonly _previewScheduler: RunOnceScheduler;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IBrowserAutoReloadService private readonly browserAutoReloadService: IBrowserAutoReloadService,
	) {
		super(editor);
		this._colorPicker = this._register(instantiationService.createInstance(BrowserHtmlEditColorPickerController));
		this._htmlEditAvailableContext = CONTEXT_BROWSER_HTML_EDIT_AVAILABLE.bindTo(contextKeyService);
		this._previewScheduler = this._register(new RunOnceScheduler(() => void this._flushPreview(), 50));
		this._panelWidth = this._readStoredPanelWidth();

		this._panel = $('.browser-html-edit-panel');
		this._panel.style.display = 'none';

		this._selector = $('.browser-html-edit-selector');
		this._selector.textContent = browserViewLabel('htmlEditNoSelection', 'No element selected');
		this._panel.appendChild(this._selector);

		this._scroll = $('.browser-html-edit-scroll');
		this._contentSection = this._scroll.appendChild($('.browser-html-edit-tab-panel'));
		this._applyPanelWidth();

		this._appendBlockTitle(this._contentSection, browserViewLabel('htmlEditTabContent', 'Content'));
		this._textInput = document.createElement('textarea');
		this._textInput.setAttribute('aria-label', browserViewLabel('htmlEditText', 'Text'));
		this._textField = this._appendField(this._contentSection, '', this._textInput);
		this._textInput.rows = 3;
		this._hrefField = this._appendField(this._contentSection, browserViewLabel('htmlEditHref', 'Link URL'), this._hrefInput = document.createElement('input'));
		this._srcField = this._appendField(this._contentSection, browserViewLabel('htmlEditSrc', 'Image URL'), this._srcInput = document.createElement('input'));
		this._altField = this._appendField(this._contentSection, browserViewLabel('htmlEditAlt', 'Alt text'), this._altInput = document.createElement('input'));
		this._contentOuterHtmlField = this._appendCollapsibleField(
			this._contentSection,
			browserViewLabel('htmlEditSelectedHtml', 'Selected HTML'),
			this._contentOuterHtmlInput = document.createElement('textarea'),
			true,
		);
		this._contentOuterHtmlInput.classList.add('browser-html-edit-code');
		this._contentOuterHtmlInput.rows = 6;
		this._contentOuterHtmlInput.readOnly = true;

		this._appendSectionLabel(this._contentSection, browserViewLabel('htmlEditSectionTypography', 'Typography'));
		this._appendPairRow(
			this._contentSection,
			{
				label: browserViewLabel('htmlEditFontFamily', 'Font'),
				key: 'fontFamily',
				type: 'select',
				compact: true,
				options: FONT_FAMILY_GENERIC.map(family => ({
					value: family,
					label: fontFamilyGenericLabel(family),
				})),
			},
			{ label: browserViewLabel('htmlEditColor', 'Color'), key: 'color', type: 'color', compact: true },
		);
		this._fontFamilySelect = this._styleInputs.get('fontFamily') as HTMLSelectElement | undefined;
		void this._loadSystemFonts();
		this._appendPairRow(
			this._contentSection,
			{ label: browserViewLabel('htmlEditFontSize', 'Size'), key: 'fontSize', step: 1, suffix: 'px', compact: true },
			{
				label: browserViewLabel('htmlEditFontWeight', 'Weight'),
				key: 'fontWeight',
				type: 'select',
				options: FONT_WEIGHT_VALUES.map(weight => ({ value: weight, label: fontWeightLabel(weight) })),
				compact: true,
			},
		);
		this._appendTextFormatRow(this._contentSection);
		this._appendPairRow(
			this._contentSection,
			{ label: browserViewLabel('htmlEditBackground', 'Background'), key: 'backgroundColor', type: 'color', compact: true },
			{ label: browserViewLabel('htmlEditOpacity', 'Opacity'), key: 'opacity', step: 0.05, min: 0, max: 1, compact: true },
		);
		this._appendPairRow(
			this._contentSection,
			{ label: browserViewLabel('htmlEditLineHeight', 'Line height'), key: 'lineHeight', step: 0.1, compact: true },
			{ label: browserViewLabel('htmlEditLetterSpacing', 'Tracking'), key: 'letterSpacing', step: 0.5, suffix: 'px', compact: true },
		);

		this._appendSectionLabel(this._contentSection, browserViewLabel('htmlEditSectionBorder', 'Border'));
		this._appendPairRow(
			this._contentSection,
			{
				label: browserViewLabel('htmlEditBorderStyle', 'Style'),
				key: 'borderStyle',
				type: 'select',
				compact: true,
				options: BORDER_STYLE_OPTIONS.map(option => ({
					value: option.value,
					label: browserViewLabel(option.labelKey, option.fallback),
				})),
			},
			{ label: browserViewLabel('htmlEditBorderColor', 'Color'), key: 'borderColor', type: 'color', compact: true },
		);
		this._appendPairRow(
			this._contentSection,
			{ label: browserViewLabel('htmlEditBorderWidth', 'Width'), key: 'borderTopWidth', step: 1, suffix: 'px', compact: true },
			{ label: browserViewLabel('htmlEditBorderRadius', 'Radius'), key: 'borderRadius', step: 1, suffix: 'px', compact: true },
		);

		this._appendSectionLabel(this._contentSection, browserViewLabel('htmlEditSectionContainer', 'Container'));
		this._appendPairRow(
			this._contentSection,
			{ label: browserViewLabel('htmlEditWidth', 'Width'), key: 'width', step: 1, suffix: 'px', compact: true },
			{ label: browserViewLabel('htmlEditHeight', 'Height'), key: 'height', step: 1, suffix: 'px', compact: true },
		);
		this._appendSelectRow(this._contentSection, browserViewLabel('htmlEditOverflow', 'Overflow'), 'overflow', [
			{ value: '', label: browserViewLabel('htmlEditSelectUnset', '\u2014') },
			{ value: 'visible', label: browserViewLabel('htmlEditOverflowVisible', 'Visible') },
			{ value: 'hidden', label: browserViewLabel('htmlEditOverflowHidden', 'Hidden') },
			{ value: 'scroll', label: browserViewLabel('htmlEditOverflowScroll', 'Scroll') },
			{ value: 'auto', label: browserViewLabel('htmlEditOverflowAuto', 'Auto') },
			{ value: 'clip', label: browserViewLabel('htmlEditOverflowClip', 'Clip') },
		]);
		this._appendPairRow(
			this._contentSection,
			{
				label: browserViewLabel('htmlEditLayoutDirection', 'Layout'),
				key: 'flexDirection',
				type: 'select',
				compact: true,
				options: [
					{ value: '', label: browserViewLabel('htmlEditSelectUnset', '\u2014') },
					{ value: 'row', label: browserViewLabel('htmlEditLayoutRow', 'Horizontal') },
					{ value: 'column', label: browserViewLabel('htmlEditLayoutColumn', 'Vertical') },
				],
			},
			{
				label: browserViewLabel('htmlEditDistribution', 'Distribution'),
				key: 'justifyContent',
				type: 'select',
				compact: true,
				options: [
					{ value: '', label: browserViewLabel('htmlEditSelectUnset', '\u2014') },
					{ value: 'normal', label: browserViewLabel('htmlEditDistributionNormal', 'Normal') },
					{ value: 'flex-start', label: browserViewLabel('htmlEditAlignStart', 'Start') },
					{ value: 'center', label: browserViewLabel('htmlEditAlignCenter', 'Center') },
					{ value: 'flex-end', label: browserViewLabel('htmlEditAlignEnd', 'End') },
					{ value: 'space-between', label: browserViewLabel('htmlEditDistributionSpaceBetween', 'Space between') },
					{ value: 'space-around', label: browserViewLabel('htmlEditDistributionSpaceAround', 'Space around') },
				],
			},
		);
		this._appendPairRow(
			this._contentSection,
			{ label: browserViewLabel('htmlEditGap', 'Gap'), key: 'gap', step: 1, suffix: 'px', compact: true },
			{
				label: browserViewLabel('htmlEditAlign', 'Align'),
				key: 'alignItems',
				type: 'select',
				compact: true,
				options: [
					{ value: '', label: browserViewLabel('htmlEditSelectUnset', '\u2014') },
					{ value: 'flex-start', label: browserViewLabel('htmlEditAlignStart', 'Start') },
					{ value: 'center', label: browserViewLabel('htmlEditAlignCenter', 'Center') },
					{ value: 'flex-end', label: browserViewLabel('htmlEditAlignEnd', 'End') },
					{ value: 'stretch', label: browserViewLabel('htmlEditAlignStretch', 'Stretch') },
				],
			},
		);
		this._appendQuadRow(this._contentSection, browserViewLabel('htmlEditPadding', 'Padding'), [
			{ key: 'paddingTop', label: browserViewLabel('htmlEditPaddingTop', 'Top') },
			{ key: 'paddingRight', label: browserViewLabel('htmlEditPaddingRight', 'Right') },
			{ key: 'paddingBottom', label: browserViewLabel('htmlEditPaddingBottom', 'Bottom') },
			{ key: 'paddingLeft', label: browserViewLabel('htmlEditPaddingLeft', 'Left') },
		]);
		this._appendQuadRow(this._contentSection, browserViewLabel('htmlEditMargin', 'Margin'), [
			{ key: 'marginTop', label: browserViewLabel('htmlEditMarginTop', 'Top') },
			{ key: 'marginRight', label: browserViewLabel('htmlEditMarginRight', 'Right') },
			{ key: 'marginBottom', label: browserViewLabel('htmlEditMarginBottom', 'Bottom') },
			{ key: 'marginLeft', label: browserViewLabel('htmlEditMarginLeft', 'Left') },
		]);

		this._panel.appendChild(this._scroll);

		const actions = $('.browser-html-edit-actions');
		const history = actions.appendChild($('.browser-html-edit-history'));
		this._undoButton = this._register(new Button(history, { supportIcons: true }));
		this._undoButton.icon = Codicon.discard;
		this._undoButton.element.title = browserViewLabel('htmlEditUndo', 'Undo');
		this._register(this._undoButton.onDidClick(() => void this._undo()));
		history.appendChild(this._undoButton.element);
		this._redoButton = this._register(new Button(history, { supportIcons: true }));
		this._redoButton.icon = Codicon.redo;
		this._redoButton.element.title = browserViewLabel('htmlEditRedo', 'Redo');
		this._register(this._redoButton.onDidClick(() => void this._redo()));
		history.appendChild(this._redoButton.element);
		this._deleteButton = this._register(new Button(history, { supportIcons: true }));
		this._deleteButton.icon = Codicon.trash;
		this._deleteButton.element.title = browserViewLabel('htmlEditDelete', 'Delete element');
		this._register(this._deleteButton.onDidClick(() => void this._deleteElement()));
		history.appendChild(this._deleteButton.element);

		this._saveStatus = $('.browser-html-edit-save-status');
		actions.appendChild(this._saveStatus);
		this._saveButton = this._register(new Button(actions, { supportIcons: true }));
		this._saveButton.label = browserViewLabel('htmlEditSave', 'Save to File');
		this._register(this._saveButton.onDidClick(() => void this._saveDraft()));
		actions.appendChild(this._saveButton.element);
		this._panel.appendChild(actions);

		this._wirePreviewListeners();
	}

	private _readStoredPanelWidth(): number {
		try {
			const stored = globalThis.localStorage?.getItem(HTML_EDIT_PANEL_WIDTH_KEY);
			if (stored) {
				const parsed = parseInt(stored, 10);
				if (!Number.isNaN(parsed)) {
					return Math.max(HTML_EDIT_PANEL_MIN_WIDTH, Math.min(HTML_EDIT_PANEL_MAX_WIDTH, parsed));
				}
			}
		} catch {
			// ignore
		}
		return HTML_EDIT_PANEL_DEFAULT_WIDTH;
	}

	private _storePanelWidth(): void {
		try {
			globalThis.localStorage?.setItem(HTML_EDIT_PANEL_WIDTH_KEY, String(this._panelWidth));
		} catch {
			// ignore
		}
	}

	private _clampPanelWidth(width: number): number {
		return Math.max(HTML_EDIT_PANEL_MIN_WIDTH, Math.min(HTML_EDIT_PANEL_MAX_WIDTH, width));
	}

	private _applyPanelWidth(): void {
		this._panel.style.width = `${this._panelWidth}px`;
		this._resizeSash?.layout();
	}

	private _createResizeSash(): void {
		const sash = this._register(new Sash(this._panel, {
			getVerticalSashLeft: () => this._panelWidth,
			getVerticalSashTop: () => 0,
			getVerticalSashHeight: () => this._panel.clientHeight,
		}, { orientation: Orientation.VERTICAL }));
		this._resizeSash = sash;

		this._register(sash.onDidStart(() => {
			this._resizeStartWidth = this._panelWidth;
		}));
		this._register(sash.onDidChange((e: ISashEvent) => {
			this._panelWidth = this._clampPanelWidth(this._resizeStartWidth + (e.currentX - e.startX));
			this._applyPanelWidth();
			this.editor.layout();
		}));
		this._register(sash.onDidEnd(() => {
			this._storePanelWidth();
		}));
		this._register(sash.onDidReset(() => {
			this._panelWidth = HTML_EDIT_PANEL_DEFAULT_WIDTH;
			this._applyPanelWidth();
			this._storePanelWidth();
			this.editor.layout();
		}));
	}

	private _appendBlockTitle(parent: HTMLElement, title: string): void {
		const el = parent.appendChild($('.browser-html-edit-block-title'));
		el.textContent = title;
	}

	private _appendSectionLabel(parent: HTMLElement, title: string): void {
		const el = parent.appendChild($('.browser-html-edit-section-label'));
		el.textContent = title;
	}

	private _registerStyleInput(key: BrowserHtmlEditStyleKey, input: HTMLInputElement | HTMLSelectElement): HTMLInputElement | HTMLSelectElement {
		this._styleInputs.set(key, input);
		return input;
	}

	private _wireColorControls(
		key: BrowserHtmlEditStyleKey,
		swatch: HTMLElement,
		input: HTMLInputElement,
		options: { clearButton?: HTMLButtonElement; label?: HTMLElement } = {},
	): void {
		const syncClearButton = () => this._syncColorClearButton(key, input.value);
		const setColorValue = (value: string) => {
			if (input.value !== value) {
				input.value = value;
				input.dispatchEvent(new Event('input', { bubbles: true }));
			}
			this._updateColorSwatch(key, value);
			syncClearButton();
		};
		swatch.classList.add('browser-html-edit-color-swatch-button');
		swatch.setAttribute('role', 'button');
		swatch.tabIndex = 0;
		swatch.title = browserViewLabel('htmlEditPickColor', 'Pick color');
		this._register(addDisposableListener(input, 'input', () => {
			this._updateColorSwatch(key, input.value);
			syncClearButton();
		}));
		const openPicker = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			const initialValue = input.value;
			this._colorPicker.show({
				anchor: swatch,
				value: initialValue,
				onPreview: value => setColorValue(value),
				onConfirm: value => setColorValue(value),
				onCancel: () => setColorValue(initialValue),
			});
		};
		this._register(addDisposableListener(swatch, 'click', openPicker));
		this._register(addDisposableListener(swatch, 'keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') {
				openPicker(event);
			}
		}));
		const clearButton = options.clearButton;
		if (clearButton) {
			clearButton.title = browserViewLabel('htmlEditBackgroundTransparent', 'Transparent');
			clearButton.setAttribute('aria-label', browserViewLabel('htmlEditBackgroundTransparent', 'Transparent'));
			this._register(addDisposableListener(clearButton, 'click', event => {
				event.preventDefault();
				event.stopPropagation();
				setColorValue('');
			}));
			syncClearButton();
		}
		// Compact rows hide the text field — allow clicking the label to open the picker too.
		const label = options.label;
		if (label) {
			label.classList.add('browser-html-edit-color-label-button');
			label.title = browserViewLabel('htmlEditPickColor', 'Pick color');
			this._register(addDisposableListener(label, 'click', openPicker));
		}
	}

	private _updateColorSwatch(key: BrowserHtmlEditStyleKey, value: string): void {
		const swatch = this._colorSwatches.get(key);
		if (!swatch) {
			return;
		}
		const trimmed = value.trim();
		swatch.classList.toggle('browser-html-edit-color-swatch-filled', !!trimmed && trimmed !== 'transparent');
		if (!trimmed || trimmed === 'transparent') {
			swatch.style.backgroundColor = 'transparent';
			swatch.style.backgroundImage = 'linear-gradient(45deg, color-mix(in srgb, var(--vscode-foreground) 14%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--vscode-foreground) 14%, transparent) 75%, color-mix(in srgb, var(--vscode-foreground) 14%, transparent)), linear-gradient(45deg, color-mix(in srgb, var(--vscode-foreground) 14%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--vscode-foreground) 14%, transparent) 75%, color-mix(in srgb, var(--vscode-foreground) 14%, transparent))';
			swatch.style.backgroundSize = '6px 6px';
			swatch.style.backgroundPosition = '0 0, 3px 3px';
			return;
		}
		swatch.style.backgroundImage = '';
		swatch.style.backgroundColor = trimmed;
	}

	private _syncColorClearButton(key: BrowserHtmlEditStyleKey, value: string): void {
		const clearButton = this._colorClearButtons.get(key);
		if (!clearButton) {
			return;
		}
		const trimmed = value.trim();
		clearButton.classList.toggle('checked', !trimmed || trimmed === 'transparent');
	}

	private _appendStepperControl(
		parent: HTMLElement,
		label: string,
		key: BrowserHtmlEditStyleKey,
		options: { step?: number; min?: number; max?: number; suffix?: string; compact?: boolean } = {},
	): HTMLInputElement {
		const row = parent.appendChild($('.browser-html-edit-param-row.browser-html-edit-stepper-row'));
		if (options.compact ?? true) {
			row.classList.add('browser-html-edit-stepper-row-compact');
		}
		const labelEl = row.appendChild($('.browser-html-edit-param-label'));
		labelEl.textContent = label;
		const controls = row.appendChild($('.browser-html-edit-stepper'));
		const minus = controls.appendChild(document.createElement('button'));
		minus.type = 'button';
		minus.className = 'browser-html-edit-stepper-btn';
		minus.textContent = '-';
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'browser-html-edit-stepper-value';
		this._registerStyleInput(key, input);
		controls.appendChild(input);
		const plus = controls.appendChild(document.createElement('button'));
		plus.type = 'button';
		plus.className = 'browser-html-edit-stepper-btn';
		plus.textContent = '+';
		const step = options.step ?? 1;
		const adjust = (delta: number) => {
			const raw = input.value.trim();
			if (!raw || raw === 'normal' || raw === 'auto') {
				if (delta > 0) {
					input.value = options.suffix ? `0${options.suffix}` : '0';
				}
				return;
			}
			const match = raw.match(/^(-?\d*\.?\d+)(.*)$/);
			if (!match) {
				return;
			}
			let num = parseFloat(match[1]!);
			const unit = match[2] ?? options.suffix ?? '';
			num = Math.round((num + delta * step) * 1000) / 1000;
			if (options.min !== undefined) {
				num = Math.max(options.min, num);
			}
			if (options.max !== undefined) {
				num = Math.min(options.max, num);
			}
			input.value = `${num}${unit}`;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		};
		this._register(addDisposableListener(minus, 'click', () => adjust(-1)));
		this._register(addDisposableListener(plus, 'click', () => adjust(1)));
		return input;
	}

	private _appendSelectRow(
		parent: HTMLElement,
		label: string,
		key: BrowserHtmlEditStyleKey,
		options: string[] | Array<{ value: string; label: string }>,
		compact = true,
	): void {
		const row = parent.appendChild($('.browser-html-edit-param-row.browser-html-edit-select-row'));
		if (compact) {
			row.classList.add('browser-html-edit-select-row-compact');
		}
		const labelEl = row.appendChild($('.browser-html-edit-param-label'));
		labelEl.textContent = label;
		const select = document.createElement('select');
		select.className = 'browser-html-edit-param-select';
		this._registerStyleInput(key, select);
		for (const opt of options) {
			const option = document.createElement('option');
			if (typeof opt === 'string') {
				option.value = opt;
				option.textContent = opt;
			} else {
				option.value = opt.value;
				option.textContent = opt.label;
			}
			select.appendChild(option);
		}
		row.appendChild(select);
	}

	private _appendTextFormatRow(parent: HTMLElement): void {
		const row = parent.appendChild($('.browser-html-edit-param-pair.browser-html-edit-text-format-pair'));
		this._appendTextStyleButtonGroup(row.appendChild($('.browser-html-edit-param-cell')));
		this._appendTextAlignButtonGroup(row.appendChild($('.browser-html-edit-param-cell')));
	}

	private _appendTextStyleButtonGroup(parent: HTMLElement): void {
		const row = parent.appendChild($('.browser-html-edit-param-row.browser-html-edit-text-format-control'));
		const labelEl = row.appendChild($('.browser-html-edit-param-label'));
		labelEl.textContent = browserViewLabel('htmlEditTextStyle', 'Style');
		const group = row.appendChild($('.browser-html-edit-icon-button-group.browser-html-edit-text-align-button-group'));
		const fontStyleInput = document.createElement('input');
		fontStyleInput.type = 'hidden';
		this._registerStyleInput('fontStyle', fontStyleInput);
		const textDecorationInput = document.createElement('input');
		textDecorationInput.type = 'hidden';
		this._registerStyleInput('textDecoration', textDecorationInput);

		for (const option of TEXT_STYLE_OPTIONS) {
			const title = browserViewLabel(option.labelKey, option.fallback);
			const buttonId = option.key === 'fontStyle' ? 'fontStyle' : option.decoration;
			const button = this._register(new Button(group, { supportIcons: true, secondary: true, title }));
			button.element.classList.add('browser-html-edit-icon-button', 'browser-html-edit-text-align-button');
			button.element.setAttribute('aria-label', title);
			const iconLabel = option.iconClass === 'italic' ? 'I' : option.iconClass === 'underline' ? 'U' : 'S';
			button.element.appendChild($(`span.browser-html-edit-text-style-icon.browser-html-edit-text-style-icon-${option.iconClass}`, undefined, iconLabel));
			this._textStyleButtons.set(buttonId, button);
			this._register(button.onDidClick(() => {
				if (option.key === 'fontStyle') {
					fontStyleInput.value = fontStyleInput.value === option.value ? '' : option.value;
					fontStyleInput.dispatchEvent(new Event('input', { bubbles: true }));
				} else {
					const flags = parseTextDecorationFlags(textDecorationInput.value);
					const next = option.decoration === 'underline'
						? { underline: !flags.underline, lineThrough: flags.lineThrough }
						: { underline: flags.underline, lineThrough: !flags.lineThrough };
					textDecorationInput.value = composeTextDecorationFlags(next.underline, next.lineThrough);
					textDecorationInput.dispatchEvent(new Event('input', { bubbles: true }));
				}
				this._syncTextStyleButtons();
			}));
			group.appendChild(button.element);
		}
	}

	private _syncTextStyleButtons(): void {
		const fontStyleInput = this._styleInputs.get('fontStyle');
		const textDecorationInput = this._styleInputs.get('textDecoration');
		const fontStyle = isHTMLInputElement(fontStyleInput) ? fontStyleInput.value : '';
		const decorationFlags = parseTextDecorationFlags(isHTMLInputElement(textDecorationInput) ? textDecorationInput.value : '');
		this._textStyleButtons.get('fontStyle')!.checked = fontStyle === 'italic';
		this._textStyleButtons.get('underline')!.checked = decorationFlags.underline;
		this._textStyleButtons.get('line-through')!.checked = decorationFlags.lineThrough;
	}

	private _appendTextAlignButtonGroup(parent: HTMLElement): void {
		const row = parent.appendChild($('.browser-html-edit-param-row.browser-html-edit-text-format-control'));
		const labelEl = row.appendChild($('.browser-html-edit-param-label'));
		labelEl.textContent = browserViewLabel('htmlEditTextAlign', 'Align');
		const group = row.appendChild($('.browser-html-edit-icon-button-group.browser-html-edit-text-align-button-group'));
		const hiddenInput = document.createElement('input');
		hiddenInput.type = 'hidden';
		this._registerStyleInput('textAlign', hiddenInput);

		for (const option of TEXT_ALIGN_OPTIONS) {
			const title = browserViewLabel(option.labelKey, option.fallback);
			const button = this._register(new Button(group, { supportIcons: true, secondary: true, title }));
			button.element.classList.add('browser-html-edit-icon-button', 'browser-html-edit-text-align-button');
			button.element.setAttribute('aria-label', title);
			button.element.appendChild($(`span.browser-html-edit-text-align-icon.browser-html-edit-text-align-icon-${option.value}`));
			this._textAlignButtons.set(option.value, button);
			this._register(button.onDidClick(() => {
				const next = hiddenInput.value === option.value ? '' : option.value;
				if (hiddenInput.value !== next) {
					hiddenInput.value = next;
					this._syncTextAlignButtons();
					hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
				}
			}));
			group.appendChild(button.element);
		}
	}

	private _syncTextAlignButtons(): void {
		const input = this._styleInputs.get('textAlign');
		const value = isHTMLInputElement(input) ? input.value : '';
		for (const [align, button] of this._textAlignButtons) {
			button.checked = value === align;
		}
	}

	private async _loadSystemFonts(): Promise<void> {
		if (this._systemFontsLoaded) {
			return;
		}
		const fonts = await getFonts();
		this._systemFontsLoaded = true;
		const generic = new Set(FONT_FAMILY_GENERIC.map(f => f.toLowerCase()));
		const unique = [...new Set(
			fonts.map(font => font.trim()).filter(font => font.length > 0 && !generic.has(font.toLowerCase())),
		)].sort((a, b) => a.localeCompare(b));
		this._populateFontFamilyOptions(unique);
	}

	private _populateFontFamilyOptions(systemFonts: string[]): void {
		const select = this._fontFamilySelect;
		if (!select) {
			return;
		}
		const selected = select.value || this._draft.styles.fontFamily || '';
		select.textContent = '';
		for (const family of FONT_FAMILY_GENERIC) {
			const option = document.createElement('option');
			option.value = family;
			option.textContent = fontFamilyGenericLabel(family);
			select.appendChild(option);
		}
		for (const family of systemFonts) {
			const option = document.createElement('option');
			option.value = family;
			option.textContent = family;
			select.appendChild(option);
		}
		this._ensureFontFamilyOption(selected);
		select.value = selected;
	}

	private _ensureFontFamilyOption(value: string): void {
		const select = this._fontFamilySelect;
		if (!select || !value) {
			return;
		}
		for (const option of select.options) {
			if (option.value === value) {
				return;
			}
		}
		const option = document.createElement('option');
		option.value = value;
		option.textContent = value;
		select.appendChild(option);
	}

	private _appendPairRow(
		parent: HTMLElement,
		left: { label: string; key: BrowserHtmlEditStyleKey; step?: number; min?: number; max?: number; suffix?: string; type?: 'stepper' | 'select' | 'color'; options?: string[] | Array<{ value: string; label: string }>; compact?: boolean },
		right: { label: string; key: BrowserHtmlEditStyleKey; step?: number; min?: number; max?: number; suffix?: string; type?: 'stepper' | 'select' | 'color'; options?: string[] | Array<{ value: string; label: string }>; compact?: boolean },
	): void {
		const row = parent.appendChild($('.browser-html-edit-param-pair'));
		if (left.compact || right.compact) {
			row.classList.add('browser-html-edit-param-pair-compact');
		}
		this._appendPairCell(row, left);
		this._appendPairCell(row, right);
	}

	private _appendPairCell(
		parent: HTMLElement,
		spec: { label: string; key: BrowserHtmlEditStyleKey; step?: number; min?: number; max?: number; suffix?: string; type?: 'stepper' | 'select' | 'color'; options?: string[] | Array<{ value: string; label: string }>; compact?: boolean },
	): void {
		const cell = parent.appendChild($('.browser-html-edit-param-cell'));
		if (spec.compact) {
			cell.classList.add('browser-html-edit-param-cell-compact');
		}
		if (spec.type === 'color') {
			const inner = cell.appendChild($('.browser-html-edit-param-row.browser-html-edit-color-row'));
			if (spec.compact) {
				inner.classList.add('browser-html-edit-color-row-compact');
			}
			const labelEl = inner.appendChild($('.browser-html-edit-param-label'));
			labelEl.textContent = spec.label;
			const controls = inner.appendChild($('.browser-html-edit-color-controls'));
			const swatch = controls.appendChild($('.browser-html-edit-color-swatch'));
			this._colorSwatches.set(spec.key, swatch);
			const input = document.createElement('input');
			input.type = 'text';
			input.className = 'browser-html-edit-param-value';
			if (spec.key === 'backgroundColor') {
				input.placeholder = browserViewLabel('htmlEditBackgroundPlaceholder', 'transparent');
				inner.classList.add('browser-html-edit-color-row-clearable');
			} else if (spec.key === 'borderColor') {
				input.placeholder = browserViewLabel('htmlEditColorPlaceholder', '#000000');
			}
			this._registerStyleInput(spec.key, input);
			inner.appendChild(input);
			let clearButton: HTMLButtonElement | undefined;
			if (spec.key === 'backgroundColor') {
				clearButton = controls.appendChild(document.createElement('button'));
				clearButton.type = 'button';
				clearButton.className = 'browser-html-edit-color-clear-button';
				clearButton.appendChild($('span.browser-html-edit-color-clear-icon'));
				this._colorClearButtons.set(spec.key, clearButton);
			}
			this._wireColorControls(spec.key, swatch, input, { clearButton, label: labelEl });
			return;
		}
		if (spec.type === 'select' && spec.options) {
			const inner = cell.appendChild($('.browser-html-edit-param-row.browser-html-edit-select-row'));
			if (spec.compact) {
				inner.classList.add('browser-html-edit-select-row-compact');
			}
			const labelEl = inner.appendChild($('.browser-html-edit-param-label'));
			labelEl.textContent = spec.label;
			const select = document.createElement('select');
			select.className = 'browser-html-edit-param-select';
			this._registerStyleInput(spec.key, select);
			for (const opt of spec.options) {
				const option = document.createElement('option');
				if (typeof opt === 'string') {
					option.value = opt;
					option.textContent = opt;
				} else {
					option.value = opt.value;
					option.textContent = opt.label;
				}
				select.appendChild(option);
			}
			inner.appendChild(select);
			return;
		}
		this._appendStepperControl(cell, spec.label, spec.key, { step: spec.step, min: spec.min, max: spec.max, suffix: spec.suffix, compact: spec.compact });
	}

	private _appendQuadRow(
		parent: HTMLElement,
		title: string,
		cells: Array<{ key: BrowserHtmlEditStyleKey; label: string }>,
	): void {
		const group = parent.appendChild($('.browser-html-edit-quad-group.browser-html-edit-param-pair-compact'));
		const header = group.appendChild($('.browser-html-edit-quad-header'));
		header.textContent = title;
		const grid = group.appendChild($('.browser-html-edit-quad-grid'));
		for (const cell of cells) {
			const cellEl = grid.appendChild($('.browser-html-edit-param-cell.browser-html-edit-param-cell-compact'));
			this._appendStepperControl(cellEl, cell.label, cell.key, { step: 1, suffix: 'px', compact: true });
		}
	}

	private _wirePreviewListeners(): void {
		const schedulePreview = () => {
			if (!this._suppressPreview) {
				this._previewScheduler.schedule();
			}
		};
		for (const input of [this._textInput, this._hrefInput, this._srcInput, this._altInput]) {
			this._register(addDisposableListener(input, 'input', schedulePreview));
		}
		for (const input of this._styleInputs.values()) {
			this._register(addDisposableListener(input, 'input', schedulePreview));
			this._register(addDisposableListener(input, 'change', schedulePreview));
		}
	}

	private async _flushPreview(): Promise<void> {
		const model = this.editor.model;
		if (!model?.isEditModeActive) {
			return;
		}
		const domPath = this._selected?.domPath ?? BODY_DOM_PATH;
		const draft = this._readDraftFromInputs();
		const styles: Record<string, string> = {};
		const styleDiff = diffBrowserHtmlEditStyles(this._baselineDraft.styles, draft.styles);
		if (styleDiff) {
			for (const key of Object.keys(styleDiff) as BrowserHtmlEditStyleKey[]) {
				styles[key] = styleDiff[key] ?? '';
			}
		}
		for (const key of BROWSER_HTML_EDIT_STYLE_PROPS) {
			if (styles[key] !== undefined) {
				continue;
			}
			const lastPreview = this._lastPreviewStyles[key];
			if (!lastPreview) {
				continue;
			}
			const current = draft.styles[key] ?? '';
			if (lastPreview.trim() !== current.trim()) {
				styles[key] = current;
			}
		}
		const borderPreviewKeys: BrowserHtmlEditStyleKey[] = [
			'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
			'borderStyle', 'borderColor',
		];
		if (borderPreviewKeys.some(key => styles[key] !== undefined)) {
			const borderWidth = draft.styles.borderTopWidth ?? '';
			for (const key of ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'] as const) {
				styles[key] = borderWidth;
			}
			styles.borderStyle = draft.styles.borderStyle ?? '';
			styles.borderColor = draft.styles.borderColor ?? '';
		}
		for (const [key, value] of Object.entries(styles) as Array<[BrowserHtmlEditStyleKey, string]>) {
			if (value.trim()) {
				this._lastPreviewStyles[key] = value;
			} else {
				delete this._lastPreviewStyles[key];
			}
		}
		await model.applyHtmlEditPreview({
			domPath,
			styles,
			text: draft.text,
			href: draft.href,
			src: draft.src,
			alt: draft.alt,
		});
	}

	private _appendField(parent: HTMLElement, label: string, control: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
		const field = parent.appendChild($('.browser-html-edit-field'));
		if (label) {
			const labelEl = field.appendChild($('label'));
			labelEl.textContent = label;
		}
		control.classList.add('browser-html-edit-input');
		if (isHTMLInputElement(control)) {
			control.type = 'text';
		}
		field.appendChild(control);
		return field;
	}

	private _appendCollapsibleField(
		parent: HTMLElement,
		label: string,
		control: HTMLInputElement | HTMLTextAreaElement,
		collapsed: boolean,
	): HTMLElement {
		const field = parent.appendChild($('.browser-html-edit-field.browser-html-edit-collapsible-field'));
		if (collapsed) {
			field.classList.add('browser-html-edit-collapsible-collapsed');
		}
		const header = field.appendChild($('.browser-html-edit-collapsible-header'));
		header.setAttribute('role', 'button');
		header.tabIndex = 0;
		header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		const chevron = header.appendChild($(`span.codicon.codicon-chevron-down.browser-html-edit-collapsible-chevron`));
		chevron.setAttribute('aria-hidden', 'true');
		const labelEl = header.appendChild($('span.browser-html-edit-collapsible-label'));
		labelEl.textContent = label;
		const body = field.appendChild($('.browser-html-edit-collapsible-body'));
		control.classList.add('browser-html-edit-input');
		if (isHTMLInputElement(control)) {
			control.type = 'text';
		}
		body.appendChild(control);
		const toggle = () => {
			const nextCollapsed = !field.classList.contains('browser-html-edit-collapsible-collapsed');
			field.classList.toggle('browser-html-edit-collapsible-collapsed', nextCollapsed);
			header.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
		};
		this._register(addDisposableListener(header, 'click', toggle));
		this._register(addDisposableListener(header, 'keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				toggle();
			}
		}));
		return field;
	}

	override onContainerCreated(container: HTMLElement): void {
		const wrapper = container.parentElement;
		if (!wrapper) {
			return;
		}
		this._wrapper = wrapper;
		wrapper.insertBefore(this._panel, container);
		this._createResizeSash();
		this._applyPanelWidth();
	}

	override beforeContainerLayout(): IContainerLayoutOverride | undefined {
		if (!this._isHtmlEditPanelVisible()) {
			return undefined;
		}
		return { padding: { left: this._panelWidth } };
	}

	override afterContainerLayout(): void {
		if (!this._wrapper || !this._isHtmlEditPanelVisible()) {
			this._panel.style.display = 'none';
			return;
		}
		this._panel.style.display = 'flex';
		this._panel.style.height = `${this._wrapper.clientHeight}px`;
		this._resizeSash?.layout();
	}

	private _isHtmlEditPanelVisible(): boolean {
		return this._editModeActive || this._pendingEditModeRestore;
	}

	override prerenderInput(input: BrowserEditorInput): void {
		this._associatedResource = input.associatedResource;
		this._htmlEditAvailableContext.set(isAssociatedHtmlResource(input.associatedResource));
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._associatedResource = model.associatedResource;
		this._htmlEditAvailableContext.set(isAssociatedHtmlResource(model.associatedResource));
		this._editModeActive = model.isEditModeActive && isAssociatedHtmlResource(model.associatedResource);
		this._syncPanelVisibility();
		void this._loadSourceHistory();

		store.add(model.onDidChangeEditModeActive(active => {
			this._editModeActive = active && isAssociatedHtmlResource(model.associatedResource);
			if (!this._editModeActive) {
				if (!this._pendingEditModeRestore) {
					this._selected = undefined;
					this._resetDraft();
				}
			} else if (this._preserveHistoryOnEditModeEnter) {
				this._preserveHistoryOnEditModeEnter = false;
			} else {
				void this._loadSourceHistory();
			}
			if (this._editModeActive && this._pendingEditModeRestore) {
				this._clearPendingEditModeRestore();
			}
			this._syncPanelVisibility();
			this.editor.layout();
		}));

		store.add(model.onDidSelectElement(data => {
			if (!this._editModeActive) {
				return;
			}
			this._selected = data;
			this._populateDraft(data);
		}));

		store.add(model.onDidCommitHtmlEditText(({ domPath, value }) => {
			if (!this._editModeActive) {
				return;
			}
			this._applyInlineTextCommit(domPath, value);
		}));

		store.add(model.onDidChangeLoadingState(state => {
			if (state.loading || !this._pendingEditModeRestore) {
				return;
			}
			if (!model.isEditModeActive && isAssociatedHtmlResource(model.associatedResource)) {
				void model.toggleEditMode(true);
			}
		}));
	}

	override onModelDetached(): void {
		this._colorPicker.hide();
		this._clearPendingEditModeRestore();
		this._editModeActive = false;
		this._selected = undefined;
		this._associatedResource = undefined;
		this._history = [];
		this._historyIndex = -1;
		this._preserveHistoryOnEditModeEnter = false;
		this._htmlEditAvailableContext.reset();
		this._syncPanelVisibility();
	}

	private _syncPanelVisibility(): void {
		this._panel.style.display = this._isHtmlEditPanelVisible() ? 'flex' : 'none';
		if (!this._editModeActive && !this._pendingEditModeRestore) {
			this._selector.textContent = browserViewLabel('htmlEditNoSelection', 'No element selected');
			this._clearSaveStatus();
		}
		this._syncContentVisibility();
		this._syncHistoryButtons();
	}

	private _syncContentVisibility(): void {
		const kind = this._selected ? this._draft.kind : 'container';
		const pageMode = !this._selected;
		this._textField.style.display = !pageMode && (kind === 'text' || kind === 'link') ? '' : 'none';
		this._hrefField.style.display = !pageMode && kind === 'link' ? '' : 'none';
		this._srcField.style.display = !pageMode && kind === 'image' ? '' : 'none';
		this._altField.style.display = !pageMode && kind === 'image' ? '' : 'none';
		this._contentOuterHtmlField.style.display = pageMode ? 'none' : '';
		this._deleteButton.element.style.display = this._selected ? '' : 'none';
		if (pageMode) {
			this._selector.textContent = browserViewLabel('htmlEditPageMode', 'Page');
		}
	}

	private _syncHistoryButtons(): void {
		this._undoButton.enabled = this._historyIndex > 0;
		this._redoButton.enabled = this._historyIndex >= 0 && this._historyIndex < this._history.length - 1;
	}

	private _populateDraft(data: IElementData): void {
		this._colorPicker.hide();
		const kind = inferBrowserHtmlEditKind(data);
		const tagMatch = data.outerHTML.match(/^<([a-z0-9-]+)/i);
		const tag = tagMatch?.[1] ?? 'element';
		const id = data.attributes?.id ? `#${data.attributes.id}` : '';
		this._selector.textContent = `${tag}${id}`;

		this._draft = {
			...emptyBrowserHtmlEditDraft(),
			kind,
			text: this._readElementText(data),
			href: data.attributes?.href ?? '',
			src: data.attributes?.src ?? '',
			alt: data.attributes?.alt ?? '',
			outerHtml: data.outerHTML,
			styles: readBrowserHtmlEditStyles(data),
		};
		this._applyDraftToInputs();
		this._syncBaselineFromInputs();
		this._syncContentVisibility();
		this._previewScheduler.schedule();
	}

	private _syncBaselineFromInputs(): void {
		this._baselineDraft = cloneBrowserHtmlEditDraft(this._readDraftFromInputs());
		this._lastPreviewStyles = {};
	}

	private _applyDraftToInputs(): void {
		this._textInput.value = this._draft.text;
		this._hrefInput.value = this._draft.href;
		this._srcInput.value = this._draft.src;
		this._altInput.value = this._draft.alt;
		this._contentOuterHtmlInput.value = this._draft.outerHtml;
		for (const key of BROWSER_HTML_EDIT_STYLE_PROPS) {
			const input = this._styleInputs.get(key);
			if (input) {
				if (key === 'fontFamily') {
					this._ensureFontFamilyOption(this._draft.styles[key] ?? '');
				}
				input.value = this._draft.styles[key] ?? '';
			}
		}
		const borderTopInput = this._styleInputs.get('borderTopWidth');
		if (borderTopInput && !borderTopInput.value) {
			borderTopInput.value = this._draft.styles.borderTopWidth
				|| this._draft.styles.borderRightWidth
				|| this._draft.styles.borderBottomWidth
				|| this._draft.styles.borderLeftWidth
				|| '';
		}
		for (const key of ['color', 'backgroundColor', 'borderColor'] as BrowserHtmlEditStyleKey[]) {
			const input = this._styleInputs.get(key);
			if (input) {
				this._updateColorSwatch(key, input.value);
				this._syncColorClearButton(key, input.value);
			}
		}
		this._syncTextStyleButtons();
		this._syncTextAlignButtons();
	}

	private _readDraftFromInputs(): IBrowserHtmlEditDraft {
		const styles = { ...this._draft.styles };
		for (const key of BROWSER_HTML_EDIT_STYLE_PROPS) {
			const input = this._styleInputs.get(key);
			if (input) {
				styles[key] = input.value;
			}
		}
		const borderWidth = this._styleInputs.get('borderTopWidth')?.value;
		if (borderWidth !== undefined) {
			styles.borderTopWidth = borderWidth;
			styles.borderRightWidth = borderWidth;
			styles.borderBottomWidth = borderWidth;
			styles.borderLeftWidth = borderWidth;
		}
		return {
			kind: this._draft.kind,
			text: this._textInput.value,
			href: this._hrefInput.value,
			src: this._srcInput.value,
			alt: this._altInput.value,
			outerHtml: this._draft.outerHtml,
			styles,
		};
	}

	private _readElementText(data: IElementData): string {
		if (data.innerText?.trim()) {
			return data.innerText.trim();
		}
		const container = document.createElement('div');
		safeSetInnerHtml(container, data.outerHTML);
		return (container.textContent ?? '').trim();
	}

	private _resetDraft(): void {
		this._draft = emptyBrowserHtmlEditDraft();
		this._applyDraftToInputs();
		this._syncBaselineFromInputs();
		this._selector.textContent = browserViewLabel('htmlEditPageMode', 'Page');
		this._clearSaveStatus();
		this._syncContentVisibility();
	}

	private async _loadSourceHistory(): Promise<void> {
		const resource = this._associatedResource;
		if (!resource) {
			return;
		}
		try {
			const file = await this.fileService.readFile(resource);
			this._history = [file.value.toString()];
			this._historyIndex = 0;
			this._syncHistoryButtons();
		} catch {
			// ignore
		}
	}

	private _pushHistory(source: string): void {
		if (this._history[this._historyIndex] === source) {
			this._syncHistoryButtons();
			return;
		}
		this._history = this._history.slice(0, this._historyIndex + 1);
		this._history.push(source);
		if (this._history.length > MAX_HISTORY) {
			this._history.shift();
		}
		this._historyIndex = this._history.length - 1;
		this._syncHistoryButtons();
	}

	private async _undo(): Promise<void> {
		if (this._historyIndex <= 0) {
			return;
		}
		this._historyIndex--;
		this._syncHistoryButtons();
		await this._writeSource(this._history[this._historyIndex]!, { historyNavigation: true });
	}

	private async _redo(): Promise<void> {
		if (this._historyIndex >= this._history.length - 1) {
			return;
		}
		this._historyIndex++;
		this._syncHistoryButtons();
		await this._writeSource(this._history[this._historyIndex]!, { historyNavigation: true });
	}

	private async _deleteElement(): Promise<void> {
		if (!this._selected?.domPath) {
			return;
		}
		await this._savePatch({ domPath: this._selected.domPath, removeElement: true });
	}

	private _showSaveStatus(message: string, variant: 'success' | 'error' = 'success'): void {
		this._clearSaveStatus();
		this._saveStatus.textContent = message;
		this._saveStatus.classList.add('visible');
		this._saveStatus.classList.toggle('browser-html-edit-save-status-success', variant === 'success');
		this._saveStatus.classList.toggle('browser-html-edit-save-status-error', variant === 'error');
		const handle = setTimeout(() => this._clearSaveStatus(), 3000);
		this._saveStatusHideHandle = toDisposable(() => clearTimeout(handle));
	}

	private _clearSaveStatus(): void {
		this._saveStatusHideHandle?.dispose();
		this._saveStatusHideHandle = undefined;
		this._saveStatus.textContent = '';
		this._saveStatus.classList.remove('visible', 'browser-html-edit-save-status-success', 'browser-html-edit-save-status-error');
	}

	private _markPendingEditModeRestore(): void {
		this._pendingEditModeRestore = true;
		this._preserveHistoryOnEditModeEnter = true;
		this._pendingEditModeRestoreClear?.dispose();
		const handle = setTimeout(() => {
			if (this._pendingEditModeRestore && this.editor.model?.isEditModeActive) {
				this._clearPendingEditModeRestore();
			}
		}, 600);
		this._pendingEditModeRestoreClear = toDisposable(() => clearTimeout(handle));
		this._syncPanelVisibility();
		this.editor.layout();
	}

	private _clearPendingEditModeRestore(): void {
		if (!this._pendingEditModeRestore) {
			return;
		}
		this._pendingEditModeRestore = false;
		this._pendingEditModeRestoreClear?.dispose();
		this._pendingEditModeRestoreClear = undefined;
		this._syncPanelVisibility();
		this.editor.layout();
	}

	override dispose(): void {
		this._clearSaveStatus();
		this._clearPendingEditModeRestore();
		super.dispose();
	}

	private _applyInlineTextCommit(domPath: string, value: string): void {
		if (this._selected) {
			this._selected = { ...this._selected, domPath };
		}
		this._suppressPreview = true;
		this._draft = { ...this._draft, text: value };
		this._textInput.value = value;
		this._suppressPreview = false;
	}

	private async _saveDraft(): Promise<void> {
		const draft = this._readDraftFromInputs();
		const domPath = this._selected?.domPath ?? BODY_DOM_PATH;

		if (!this._selected?.domPath && domPath !== BODY_DOM_PATH) {
			this.notificationService.warn(browserViewLabel('htmlEditSaveNoSelection', 'Select an element before saving.'));
			return;
		}

		const patch = buildBrowserHtmlEditSavePatch(domPath, this._baselineDraft, draft);
		if (!patch) {
			this._showSaveStatus(browserViewLabel('htmlEditSaveNoChanges', 'No changes to save.'), 'error');
			return;
		}

		await this._savePatch(patch);
		this._baselineDraft = cloneBrowserHtmlEditDraft(draft);
		this._lastPreviewStyles = {};
	}

	private async _savePatch(patch: IBrowserHtmlPatch): Promise<void> {
		const resource = this._associatedResource;
		if (!resource) {
			return;
		}
		try {
			this._clearSaveStatus();
			const file = await this.fileService.readFile(resource);
			const source = file.value.toString();
			const result = applyBrowserHtmlPatch(source, patch, document);
			if (!result.ok) {
				this.notificationService.error(result.error ?? browserViewLabel('htmlEditSaveFailed', 'Could not apply the edit.'));
				return;
			}
			await this._writeSource(result.source, { reload: false });
			this._showSaveStatus(browserViewLabel('htmlEditSaveSuccess', 'Saved successfully'));
		} catch {
			this.notificationService.error(browserViewLabel('htmlEditSaveFailed', 'Could not apply the edit.'));
		}
	}

	private async _writeSource(source: string, options?: { reload?: boolean; historyNavigation?: boolean }): Promise<void> {
		const resource = this._associatedResource;
		if (!resource) {
			return;
		}
		this.browserAutoReloadService.suppressAutoReloadForResource(resource);

		const textFileModel = this.textFileService.files.get(resource)
			?? await this.textFileService.files.resolve(resource, { languageId: 'html', reason: TextFileResolveReason.OTHER });

		const currentContent = textFileModel.textEditorModel?.getValue();
		if (currentContent !== source) {
			this._applySourceToTextFileModel(textFileModel, source);
			const saved = await textFileModel.save({
				force: true,
				ignoreModifiedSince: true,
				source: BrowserEditorHtmlEditContribution.SAVE_SOURCE,
				reason: SaveReason.EXPLICIT,
			});
			if (!saved) {
				throw new Error('Failed to save HTML source');
			}
		}

		this._pushHistory(source);

		if (options?.reload === false) {
			return;
		}

		if (this._editModeActive || options?.historyNavigation) {
			this._markPendingEditModeRestore();
		}

		const browserModel = this.editor.model;
		if (browserModel) {
			await browserModel.reload();
		}
	}

	private _applySourceToTextFileModel(textFileModel: ITextFileEditorModel, source: string): void {
		if (!textFileModel.isResolved()) {
			return;
		}
		const textModel = textFileModel.textEditorModel;
		if (!textModel || textModel.getValue() === source) {
			return;
		}
		textModel.pushEditOperations(
			null,
			[EditOperation.replaceMove(textModel.getFullModelRange(), source)],
			() => null,
		);
	}
}

BrowserEditor.registerContribution(BrowserEditorHtmlEditContribution);
