/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalizedString, miniActionTitle, miniLabel, MiniI18nTable } from '../../../../nls.js';

const browserViewLabels: MiniI18nTable<'editPage' | 'stopEditMode' | 'newTab'> = {
	editPage: { en: 'Edit Page', 'zh-cn': '\u7F16\u8F91\u9875\u9762', 'zh-Hans': '\u7F16\u8F91\u9875\u9762' },
	stopEditMode: { en: 'Stop Edit Mode', 'zh-cn': '\u505C\u6B62\u7F16\u8F91\u6A21\u5F0F', 'zh-Hans': '\u505C\u6B62\u7F16\u8F91\u6A21\u5F0F' },
	newTab: { en: 'New Tab', 'zh-cn': '\u65B0\u5EFA\u6807\u7B7E\u9875', 'zh-Hans': '\u65B0\u5EFA\u6807\u7B7E\u9875' },
};

type BrowserViewLabelKey = keyof typeof browserViewLabels;

export function browserViewLabel(key: BrowserViewLabelKey, fallback: string): string {
	return miniLabel(browserViewLabels, key, fallback);
}

export function browserViewActionTitle(key: BrowserViewLabelKey, fallback: string): ILocalizedString {
	return miniActionTitle(browserViewLabels, key, fallback);
}
