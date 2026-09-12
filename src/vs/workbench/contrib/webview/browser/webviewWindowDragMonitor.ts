/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWebview } from './webview.js';

export function shouldAllowWebviewFileDrop(event: Pick<DragEvent, 'shiftKey'>, webview: IWebview | undefined): boolean {
	return event.shiftKey || !!webview?.options.acceptsFileDrops;
}

/**
 * Allows webviews to monitor when an element in the VS Code editor is being dragged/dropped.
 *
 * This is required since webview end up eating the drag event. VS Code needs to see this
 * event so it can handle editor element drag drop.
 */
export class WebviewWindowDragMonitor extends Disposable {
	constructor(targetWindow: CodeWindow, getWebview: () => IWebview | undefined) {
		super();

		const onDragStart = () => {
			getWebview()?.windowDidDragStart();
		};

		const onDragEnd = () => {
			getWebview()?.windowDidDragEnd();
		};

		const updateDragState = (event: DragEvent) => {
			if (shouldAllowWebviewFileDrop(event, getWebview())) {
				onDragEnd();
			} else {
				onDragStart();
			}
		};

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG_START, () => {
			onDragStart();
		}));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG_END, onDragEnd));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.MOUSE_MOVE, currentEvent => {
			if (currentEvent.buttons === 0) {
				onDragEnd();
			}
		}));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG, updateDragState));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG_OVER, updateDragState));

	}
}
