/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { reloadBrowserTab } from '../../common/browserReloadTab.js';
import { browserViewLabel } from '../../common/browserViewI18n.js';

CommandsRegistry.registerCommand({
	id: BrowserViewCommandId.ReloadTab,
	handler: async (accessor, tabId: string): Promise<void> => {
		await reloadBrowserTab(accessor.get(IBrowserViewWorkbenchService), tabId);
	},
	metadata: {
		description: browserViewLabel('reloadTabCommandDescription', 'Reload an Integrated Browser tab by its page ID.'),
		args: [{
			name: 'tabId',
			schema: {
				type: 'string',
				description: browserViewLabel('reloadTabArgTabIdDescription', 'Integrated Browser tab ID from vscode.browser.getOpenTabs() or BrowserTab.id.'),
			},
		}],
	},
});
