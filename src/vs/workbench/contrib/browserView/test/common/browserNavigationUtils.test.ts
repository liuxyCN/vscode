/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IBrowserViewLoadingEvent, IBrowserViewNavigationEvent } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { browserNavigationUrlsMatch, normalizeBrowserNavigationUrl, waitForBrowserNavigation } from '../../common/browserNavigationUtils.js';

suite('browserNavigationUtils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizeBrowserNavigationUrl adds http scheme for localhost', () => {
		assert.strictEqual(normalizeBrowserNavigationUrl('localhost:3000/page'), 'http://localhost:3000/page');
	});

	test('browserNavigationUrlsMatch compares normalized URLs', () => {
		assert.strictEqual(
			browserNavigationUrlsMatch('http://localhost:3000/', 'localhost:3000/'),
			true,
		);
		assert.strictEqual(
			browserNavigationUrlsMatch('https://example.com/a', 'https://example.com/b'),
			false,
		);
	});

	test('waitForBrowserNavigation resolves after loading settles', async () => {
		const onDidChangeLoadingState = new Emitter<IBrowserViewLoadingEvent>();
		const onDidNavigate = new Emitter<IBrowserViewNavigationEvent>();

		let loading = false;
		let error: IBrowserViewLoadingEvent['error'];

		const model = {
			get loading() { return loading; },
			get error() { return error; },
			get url() { return 'https://example.com/next'; },
			onDidChangeLoadingState: onDidChangeLoadingState.event,
			onDidNavigate: onDidNavigate.event,
		} as unknown as IBrowserViewModel;

		const wait = waitForBrowserNavigation(model, 1000);
		loading = true;
		onDidChangeLoadingState.fire({ loading: true });
		loading = false;
		onDidChangeLoadingState.fire({ loading: false });

		await wait.promise;
		wait.cancel.dispose();
	});

	test('waitForBrowserNavigation resolves on matching in-page navigation without loading', async () => {
		const onDidChangeLoadingState = new Emitter<IBrowserViewLoadingEvent>();
		const onDidNavigate = new Emitter<IBrowserViewNavigationEvent>();

		const model = {
			get loading() { return false; },
			get error() { return undefined; },
			get url() { return 'file:///page.html#1'; },
			onDidChangeLoadingState: onDidChangeLoadingState.event,
			onDidNavigate: onDidNavigate.event,
		} as unknown as IBrowserViewModel;

		const wait = waitForBrowserNavigation(model, 1000, 'file:///page.html#2');
		onDidNavigate.fire({
			url: 'file:///page.html#2',
			title: '',
			canGoBack: false,
			canGoForward: false,
			certificateError: undefined,
		});

		await wait.promise;
		wait.cancel.dispose();
	});

	test('waitForBrowserNavigation ignores unrelated navigation events', async () => {
		const onDidChangeLoadingState = new Emitter<IBrowserViewLoadingEvent>();
		const onDidNavigate = new Emitter<IBrowserViewNavigationEvent>();

		const model = {
			get loading() { return false; },
			get error() { return undefined; },
			get url() { return 'file:///page.html#1'; },
			onDidChangeLoadingState: onDidChangeLoadingState.event,
			onDidNavigate: onDidNavigate.event,
		} as unknown as IBrowserViewModel;

		const wait = waitForBrowserNavigation(model, 50, 'file:///page.html#2');
		onDidNavigate.fire({
			url: 'file:///page.html#3',
			title: '',
			canGoBack: false,
			canGoForward: false,
			certificateError: undefined,
		});

		await assert.rejects(wait.promise, /timed out/i);
		wait.cancel.dispose();
	});

	test('waitForBrowserNavigation ignores stale load failure when tab is already loading', async () => {
		const onDidChangeLoadingState = new Emitter<IBrowserViewLoadingEvent>();
		const onDidNavigate = new Emitter<IBrowserViewNavigationEvent>();

		let loading = true;
		let error: IBrowserViewLoadingEvent['error'];

		const model = {
			get loading() { return loading; },
			get error() { return error; },
			get url() { return 'https://example.com/'; },
			onDidChangeLoadingState: onDidChangeLoadingState.event,
			onDidNavigate: onDidNavigate.event,
		} as unknown as IBrowserViewModel;

		const wait = waitForBrowserNavigation(model, 1000, 'https://example.com/next');
		loading = false;
		error = { url: 'https://example.com/old', errorCode: -1, errorDescription: 'Stale failure' };
		onDidChangeLoadingState.fire({ loading: false, error });

		loading = true;
		onDidChangeLoadingState.fire({ loading: true });
		loading = false;
		error = undefined;
		onDidChangeLoadingState.fire({ loading: false });
		onDidNavigate.fire({
			url: 'https://example.com/next',
			title: '',
			canGoBack: false,
			canGoForward: false,
			certificateError: undefined,
		});

		await wait.promise;
		wait.cancel.dispose();
	});

	test('waitForBrowserNavigation rejects when navigation fails', async () => {
		const onDidChangeLoadingState = new Emitter<IBrowserViewLoadingEvent>();
		const onDidNavigate = new Emitter<IBrowserViewNavigationEvent>();

		const state = { loading: false, error: undefined as IBrowserViewLoadingEvent['error'] | undefined };

		const model = {
			get loading() { return state.loading; },
			get error() { return state.error; },
			get url() { return 'https://example.com/'; },
			onDidChangeLoadingState: onDidChangeLoadingState.event,
			onDidNavigate: onDidNavigate.event,
		} as unknown as IBrowserViewModel;

		const wait = waitForBrowserNavigation(model, 1000);
		state.loading = true;
		onDidChangeLoadingState.fire({ loading: true });
		state.loading = false;
		state.error = { url: 'https://example.com/next', errorCode: -1, errorDescription: 'Failed' };
		onDidChangeLoadingState.fire({ loading: false, error: state.error });

		await assert.rejects(wait.promise, /Failed/);
		wait.cancel.dispose();
	});
});
