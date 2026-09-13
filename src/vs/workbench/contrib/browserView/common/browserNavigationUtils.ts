/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IBrowserViewModel } from './browserView.js';
import { browserViewLabel } from './browserViewI18n.js';

const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * Applies the same URL normalization used by {@link IBrowserViewModel.loadURL}.
 */
export function normalizeBrowserNavigationUrl(url: string): string {
	if (/^localhost(:|\/|$)/i.test(url)) {
		return 'http://' + url;
	}
	if (!URL.parse(url)?.protocol) {
		return 'http://' + url;
	}
	return url;
}

export function browserNavigationUrlsMatch(actual: string, expected: string): boolean {
	if (!actual || !expected) {
		return false;
	}
	return normalizeBrowserNavigationUrl(actual) === normalizeBrowserNavigationUrl(expected);
}

export interface IBrowserNavigationWait {
	readonly promise: Promise<void>;
	readonly cancel: IDisposable;
}

/**
 * Waits for an in-flight navigation or reload on `model` to settle.
 * Attach listeners before calling {@link IBrowserViewModel.loadURL} or {@link IBrowserViewModel.reload}.
 *
 * @param expectedUrl When set, only {@link IBrowserViewModel.onDidNavigate} events for this URL
 * can complete the wait without a loading cycle (hash-only / in-page navigations).
 */
export function waitForBrowserNavigation(
	model: IBrowserViewModel,
	timeoutMs = NAVIGATION_TIMEOUT_MS,
	expectedUrl?: string,
): IBrowserNavigationWait {
	const store = new DisposableStore();
	let settled = false;
	let sawLoadingAfterWait = false;

	let resolvePromise!: () => void;
	let rejectPromise!: (error: Error) => void;
	const promise = new Promise<void>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});

	const complete = (error?: string) => {
		if (settled) {
			return;
		}
		settled = true;
		store.dispose();
		if (error) {
			rejectPromise(new Error(error));
		} else {
			resolvePromise();
		}
	};

	store.add(disposableTimeout(() => {
		complete(browserViewLabel('browserTabNavigationTimedOut', 'Navigation timed out after {0} ms', timeoutMs));
	}, timeoutMs));

	store.add(model.onDidChangeLoadingState(state => {
		if (state.loading) {
			sawLoadingAfterWait = true;
			return;
		}
		if (state.error) {
			if (sawLoadingAfterWait) {
				complete(state.error.errorDescription || browserViewLabel('browserTabNavigationFailed', 'Navigation failed'));
			}
			return;
		}
		if (sawLoadingAfterWait) {
			complete();
		}
	}));

	store.add(model.onDidNavigate(event => {
		if (expectedUrl && !browserNavigationUrlsMatch(event.url, expectedUrl)) {
			return;
		}
		if (model.loading) {
			return;
		}
		if (model.error) {
			complete(model.error.errorDescription || browserViewLabel('browserTabNavigationFailed', 'Navigation failed'));
			return;
		}
		if (!sawLoadingAfterWait) {
			complete();
		}
	}));

	return { promise, cancel: store };
}
