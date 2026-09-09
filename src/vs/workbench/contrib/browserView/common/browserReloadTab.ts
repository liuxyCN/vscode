/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserViewWorkbenchService } from './browserView.js';
import { browserViewLabel } from './browserViewI18n.js';

export async function reloadBrowserTab(
	browserViewService: IBrowserViewWorkbenchService,
	tabId: string,
): Promise<void> {
	if (typeof tabId !== 'string' || !tabId) {
		throw new Error(browserViewLabel('browserTabInvalidId', 'Browser tab ID must be a non-empty string'));
	}

	const input = browserViewService.getKnownBrowserViews().get(tabId);
	if (!input) {
		throw new Error(browserViewLabel('browserPageNotFound', 'No browser page found with ID {0}', tabId));
	}

	const model = await input.resolve();
	await model.reload();
}
