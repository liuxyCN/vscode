/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../editor/contrib/colorPicker/browser/colorPicker.css';
import { $, getWindow } from '../../../../base/browser/dom.js';
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import { AnchorAlignment, AnchorPosition } from '../../../../base/common/layout.js';
import { Color } from '../../../../base/common/color.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ColorPickerModel } from '../../../../editor/contrib/colorPicker/browser/colorPickerModel.js';
import { ColorPickerWidgetType } from '../../../../editor/contrib/colorPicker/browser/colorPickerParticipantUtils.js';
import { ColorPickerWidget } from '../../../../editor/contrib/colorPicker/browser/colorPickerWidget.js';
import { IColorPresentation } from '../../../../editor/common/languages.js';
import { IContextViewService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { browserViewLabel } from '../common/browserViewI18n.js';

export interface IBrowserHtmlEditColorPickerOptions {
	readonly anchor: HTMLElement;
	readonly value: string;
	readonly onPreview?: (value: string) => void;
	readonly onConfirm: (value: string) => void;
	readonly onCancel?: () => void;
}

function parseCssColor(value: string): Color | undefined {
	const trimmed = value.trim();
	if (!trimmed || trimmed.toLowerCase() === 'transparent') {
		return undefined;
	}
	return Color.Format.CSS.parse(trimmed) ?? undefined;
}

function buildColorPresentations(color: Color): IColorPresentation[] {
	return [
		{ label: Color.Format.CSS.formatRGB(color) },
		{ label: Color.Format.CSS.formatHSL(color) },
		{ label: Color.Format.CSS.formatHexA(color, true) },
	];
}

function guessPresentationIndex(presentations: IColorPresentation[], originalText: string): number {
	const normalized = originalText.trim().toLowerCase();
	if (!normalized) {
		return 0;
	}
	for (let index = 0; index < presentations.length; index++) {
		if (presentations[index]!.label.toLowerCase() === normalized) {
			return index;
		}
	}
	const prefix = normalized.split('(')[0] ?? normalized;
	for (let index = 0; index < presentations.length; index++) {
		if (presentations[index]!.label.toLowerCase().startsWith(prefix)) {
			return index;
		}
	}
	if (normalized.startsWith('#')) {
		return 2;
	}
	if (normalized.startsWith('hsl')) {
		return 1;
	}
	return 0;
}

export class BrowserHtmlEditColorPickerController extends Disposable {

	private _openContextView: IOpenContextView | undefined;

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
	}

	show(options: IBrowserHtmlEditColorPickerOptions): void {
		this.hide();

		const originalText = options.value.trim();
		const parsed = parseCssColor(originalText) ?? Color.fromHex('#808080');
		const presentations = buildColorPresentations(parsed);
		const model = new ColorPickerModel(parsed, presentations, guessPresentationIndex(presentations, originalText));
		model.guessColorPresentation(parsed, originalText);

		let confirmed = false;

		const currentPresentation = (): string => model.presentation?.label ?? originalText;

		const previewPresentation = (): void => {
			options.onPreview?.(currentPresentation());
		};

		const refreshPresentations = (color: Color): void => {
			const nextPresentations = buildColorPresentations(color);
			const previousLabel = model.presentation?.label ?? originalText;
			model.colorPresentations = nextPresentations;
			model.guessColorPresentation(color, previousLabel);
		};

		const confirm = (): void => {
			if (confirmed) {
				return;
			}
			confirmed = true;
			options.onConfirm(currentPresentation());
			this.hide();
		};

		const cancel = (): void => {
			if (confirmed) {
				return;
			}
			confirmed = true;
			options.onCancel?.();
			this.hide();
		};

		this._openContextView = this._contextViewService.showContextView({
			getAnchor: () => options.anchor,
			anchorPosition: AnchorPosition.BELOW,
			anchorAlignment: AnchorAlignment.LEFT,
			canRelayout: true,
			layer: 1,
			render: container => {
				const disposables = new DisposableStore();
				const panel = container.appendChild($('.browser-html-edit-color-picker-panel'));
				const pixelRatio = PixelRatio.getInstance(getWindow(options.anchor)).value;
				const widget = disposables.add(new ColorPickerWidget(
					panel,
					model,
					pixelRatio,
					this._themeService,
					ColorPickerWidgetType.Standalone,
				));
				widget.layout();
				disposables.add(model);
				disposables.add(model.onDidChangeColor(color => {
					refreshPresentations(color);
					previewPresentation();
				}));
				disposables.add(model.onDidChangePresentation(() => previewPresentation()));

				const closeButton = widget.header.closeButton;
				if (closeButton) {
					disposables.add(closeButton.onClicked(() => cancel()));
				}

				const enterButton = widget.body.enterButton;
				if (enterButton) {
					enterButton.button.textContent = browserViewLabel('htmlEditColorPickerConfirm', 'OK');
					disposables.add(enterButton.onClicked(() => confirm()));
				}

				return disposables;
			},
			onHide: () => {
				if (!confirmed) {
					confirmed = true;
					options.onCancel?.();
				}
				this._openContextView = undefined;
			},
		});
	}

	hide(): void {
		if (this._openContextView) {
			this._openContextView.close();
			this._openContextView = undefined;
		} else {
			this._contextViewService.hideContextView();
		}
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}
