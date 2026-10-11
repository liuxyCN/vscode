/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalizedString, miniActionTitle, miniLabel, MiniI18nTable } from '../../../../nls.js';

const themesLabels: MiniI18nTable<
	| 'cycleWelcomeColorTheme'
	| 'cycleWelcomeColorThemeChanged'
> = {
	cycleWelcomeColorTheme: {
		en: 'Switch Color Theme',
		'zh-cn': '\u5207\u6362\u989C\u8272\u4E3B\u9898',
		'zh-Hans': '\u5207\u6362\u989C\u8272\u4E3B\u9898',
	},
	cycleWelcomeColorThemeChanged: {
		en: 'Color theme changed to {0}',
		'zh-cn': '\u5DF2\u5207\u6362\u989C\u8272\u4E3B\u9898\u4E3A {0}',
		'zh-Hans': '\u5DF2\u5207\u6362\u989C\u8272\u4E3B\u9898\u4E3A {0}',
	},
};

type ThemesLabelKey = keyof typeof themesLabels;

export function themesLabel(key: ThemesLabelKey, fallback: string, ...args: (string | number | boolean | undefined | null)[]): string {
	return miniLabel(themesLabels, key, fallback, ...args);
}

export function themesActionTitle(key: ThemesLabelKey, fallback: string): ILocalizedString {
	return miniActionTitle(themesLabels, key, fallback);
}
