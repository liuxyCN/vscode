/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isBrowserViewAssociatedResourceNavigation } from '../../../../platform/browserView/common/browserView.js';
import { IBrowserViewWorkbenchService } from './browserView.js';
import { browserViewLabel } from './browserViewI18n.js';
import { browserNavigationUrlsMatch, normalizeBrowserNavigationUrl, waitForBrowserNavigation } from './browserNavigationUtils.js';

export async function navigateBrowserTab(
	browserViewService: IBrowserViewWorkbenchService,
	tabId: string,
	url: string,
): Promise<void> {
	if (typeof tabId !== 'string' || !tabId) {
		throw new Error(browserViewLabel('browserTabInvalidId', 'Browser tab ID must be a non-empty string'));
	}

	const destination = typeof url === 'string' ? url.trim() : '';
	if (!destination) {
		throw new Error(browserViewLabel('browserTabInvalidUrl', 'Browser navigation URL must be a non-empty string'));
	}

	const input = browserViewService.getKnownBrowserViews().get(tabId);
	if (!input) {
		throw new Error(browserViewLabel('browserPageNotFound', 'No browser page found with ID {0}', tabId));
	}

	if (input.associatedResource && !isBrowserViewAssociatedResourceNavigation(input.associatedResource, destination)) {
		throw new Error(browserViewLabel(
			'browserTabResourceNavigationError',
			'This browser page is associated with a resource and cannot be navigated to a different resource. Only query and fragment changes are allowed. Use a different page or open a new one with openBrowserTab.',
		));
	}

	const model = await input.resolve();
	const targetUrl = normalizeBrowserNavigationUrl(destination);
	const beforeUrl = model.url;
	const sameUrl = browserNavigationUrlsMatch(beforeUrl, targetUrl);

	const navigationWait = waitForBrowserNavigation(model, undefined, targetUrl);

	try {
		if (sameUrl) {
			await model.reload();
		} else {
			await model.loadURL(targetUrl);
		}
		await navigationWait.promise;
	} finally {
		navigationWait.cancel.dispose();
	}

	if (model.error) {
		throw new Error(browserViewLabel(
			'browserTabNavigationFailed',
			'Navigation failed: {0}',
			model.error.errorDescription,
		));
	}
}
