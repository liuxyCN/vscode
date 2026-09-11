/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserViewPreloadLocalizedStrings } from './browserView.js';
import { miniLabel, MiniI18nTable } from '../../../nls.js';

const browserViewPreloadLabels = {
	addComment: { en: 'Add Comment', 'zh-cn': '\u6DFB\u52A0\u8BC4\u8BBA', 'zh-Hans': '\u6DFB\u52A0\u8BC4\u8BBA' },
	addCommentPlaceholder: { en: 'Add a comment', 'zh-cn': '\u6DFB\u52A0\u8BC4\u8BBA', 'zh-Hans': '\u6DFB\u52A0\u8BC4\u8BBA' },
	commentOnSelectedElement: { en: 'Comment on selected element', 'zh-cn': '\u5BF9\u6240\u9009\u5143\u7D20\u8BC4\u8BBA', 'zh-Hans': '\u5BF9\u6240\u9009\u5143\u7D20\u8BC4\u8BBA' },
	elementComment: { en: 'Element comment {0}', 'zh-cn': '\u5143\u7D20\u8BC4\u8BBA {0}', 'zh-Hans': '\u5143\u7D20\u8BC4\u8BBA {0}' },
	elementCommentWithBody: { en: 'Element comment {0}: {1}', 'zh-cn': '\u5143\u7D20\u8BC4\u8BBA {0}\uFF1A{1}', 'zh-Hans': '\u5143\u7D20\u8BC4\u8BBA {0}\uFF1A{1}' },
	emptyElementComment: { en: 'Empty element comment {0}', 'zh-cn': '\u7A7A\u5143\u7D20\u8BC4\u8BBA {0}', 'zh-Hans': '\u7A7A\u5143\u7D20\u8BC4\u8BBA {0}' },
	removeComment: { en: 'Remove Comment', 'zh-cn': '\u79FB\u9664\u8BC4\u8BBA', 'zh-Hans': '\u79FB\u9664\u8BC4\u8BBA' },
	removeElementComment: { en: 'Remove element comment', 'zh-cn': '\u79FB\u9664\u5143\u7D20\u8BC4\u8BBA', 'zh-Hans': '\u79FB\u9664\u5143\u7D20\u8BC4\u8BBA' },
} satisfies MiniI18nTable<keyof IBrowserViewPreloadLocalizedStrings>;

type BrowserViewPreloadLabelKey = keyof typeof browserViewPreloadLabels;

function browserViewPreloadLabel(key: BrowserViewPreloadLabelKey, fallback: string, ...args: (string | number | boolean | undefined | null)[]): string {
	return miniLabel(browserViewPreloadLabels, key, fallback, ...args);
}

export function createBrowserViewPreloadLocalizedStrings(): IBrowserViewPreloadLocalizedStrings {
	return {
		addComment: browserViewPreloadLabel('addComment', 'Add Comment'),
		addCommentPlaceholder: browserViewPreloadLabel('addCommentPlaceholder', 'Add a comment'),
		commentOnSelectedElement: browserViewPreloadLabel('commentOnSelectedElement', 'Comment on selected element'),
		elementComment: browserViewPreloadLabel('elementComment', 'Element comment {0}'),
		elementCommentWithBody: browserViewPreloadLabel('elementCommentWithBody', 'Element comment {0}: {1}'),
		emptyElementComment: browserViewPreloadLabel('emptyElementComment', 'Empty element comment {0}'),
		removeComment: browserViewPreloadLabel('removeComment', 'Remove Comment'),
		removeElementComment: browserViewPreloadLabel('removeElementComment', 'Remove element comment'),
	};
}
