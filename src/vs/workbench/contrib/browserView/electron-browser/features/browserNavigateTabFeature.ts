/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { navigateBrowserTab } from '../../common/browserNavigateTab.js';
import { browserViewLabel } from '../../common/browserViewI18n.js';

CommandsRegistry.registerCommand({
	id: BrowserViewCommandId.NavigateTab,
	handler: async (accessor, tabId: string, url: string): Promise<void> => {
		await navigateBrowserTab(accessor.get(IBrowserViewWorkbenchService), tabId, url);
	},
	metadata: {
		description: browserViewLabel('navigateTabCommandDescription', 'Navigate an Integrated Browser tab to a URL by its page ID.'),
		args: [
			{
				name: 'tabId',
				schema: {
					type: 'string',
					description: browserViewLabel('navigateTabArgTabIdDescription', 'Integrated Browser tab ID from vscode.browser.getOpenTabs() or BrowserTab.id.'),
				},
			},
			{
				name: 'url',
				schema: {
					type: 'string',
					description: browserViewLabel('navigateTabArgUrlDescription', 'The URL to navigate to.'),
				},
			},
		],
	},
});
