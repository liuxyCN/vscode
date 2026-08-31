/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { IQuickInputService, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguagePackItem, ILanguagePackService } from '../../../../platform/languagePacks/common/languagePacks.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

export class ConfigureDisplayLanguageAction extends Action2 {
	public static readonly ID = 'workbench.action.configureLocale';

	constructor() {
		super({
			id: ConfigureDisplayLanguageAction.ID,
			title: localize2('configureLocale', "Configure Display Language"),
			menu: {
				id: MenuId.CommandPalette
			},
			metadata: {
				description: localize2('configureLocaleDescription', "Changes the locale of VS Code based on installed language packs. Common languages include French, Chinese, Spanish, Japanese, German, Korean, and more."),
				args: [{
					name: localize('configureLocale.arg.name', "The locale identifier or language name to switch to, for example 'zh-cn' or 'Chinese'. When omitted, a language picker is shown."),
					schema: {
						type: 'string'
					}
				}]
			}
		});
	}

	public async run(accessor: ServicesAccessor, locale?: string): Promise<void> {
		const languagePackService = accessor.get(ILanguagePackService);
		const localeService = accessor.get(ILocaleService);
		const notificationService = accessor.get(INotificationService);

		if (locale) {
			const languagePackItem = await resolveLanguagePackItem(languagePackService, locale);
			if (!languagePackItem) {
				notificationService.notify({
					severity: Severity.Error,
					message: localize('configureLocale.notFound', "Display language '{0}' is not available.", locale),
				});
				return;
			}
			await localeService.setLocale(languagePackItem);
			return;
		}

		const quickInputService = accessor.get(IQuickInputService);
		const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);

		const installedLanguages = await languagePackService.getInstalledLanguages();

		const disposables = new DisposableStore();
		const qp = disposables.add(quickInputService.createQuickPick<ILanguagePackItem>({ useSeparators: true }));
		qp.matchOnDescription = true;
		qp.placeholder = localize('chooseLocale', "Select Display Language");

		if (installedLanguages?.length) {
			const items: Array<ILanguagePackItem | IQuickPickSeparator> = [{ type: 'separator', label: localize('installed', "Installed") }];
			qp.items = items.concat(this.withMoreInfoButton(installedLanguages));
		}

		disposables.add(qp.onDidHide(() => {
			disposables.dispose();
		}));

		const installedSet = new Set<string>(installedLanguages?.map(language => language.id!) ?? []);
		languagePackService.getAvailableLanguages().then(availableLanguages => {
			const newLanguages = availableLanguages.filter(l => l.id && !installedSet.has(l.id));
			if (newLanguages.length) {
				qp.items = [
					...qp.items,
					{ type: 'separator', label: localize('available', "Available") },
					...this.withMoreInfoButton(newLanguages)
				];
			}
			qp.busy = false;
		});

		disposables.add(qp.onDidAccept(async () => {
			const selectedLanguage = qp.activeItems[0] as ILanguagePackItem | undefined;
			if (selectedLanguage) {
				qp.hide();
				await localeService.setLocale(selectedLanguage);
			}
		}));

		disposables.add(qp.onDidTriggerItemButton(async e => {
			qp.hide();
			if (e.item.extensionId) {
				await extensionWorkbenchService.open(e.item.extensionId);
			}
		}));

		qp.show();
		qp.busy = true;
	}

	private withMoreInfoButton(items: ILanguagePackItem[]): ILanguagePackItem[] {
		for (const item of items) {
			if (item.extensionId) {
				item.buttons = [{
					tooltip: localize('moreInfo', "More Info"),
					iconClass: 'codicon-info'
				}];
			}
		}
		return items;
	}
}

export class ClearDisplayLanguageAction extends Action2 {
	public static readonly ID = 'workbench.action.clearLocalePreference';
	public static readonly LABEL = localize2('clearDisplayLanguage', "Clear Display Language Preference");

	constructor() {
		super({
			id: ClearDisplayLanguageAction.ID,
			title: ClearDisplayLanguageAction.LABEL,
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const localeService: ILocaleService = accessor.get(ILocaleService);
		await localeService.clearLocalePreference();
	}
}

async function resolveLanguagePackItem(languagePackService: ILanguagePackService, locale: string): Promise<ILanguagePackItem | undefined> {
	const normalizedLocale = locale.toLowerCase();

	const installedLanguages = await languagePackService.getInstalledLanguages();
	const installedMatch = findLanguagePackItem(installedLanguages, normalizedLocale);
	if (installedMatch) {
		return installedMatch;
	}

	const availableLanguages = await languagePackService.getAvailableLanguages();
	return findLanguagePackItem(availableLanguages, normalizedLocale);
}

function findLanguagePackItem(languages: ILanguagePackItem[], locale: string): ILanguagePackItem | undefined {
	const byId = languages.find(language => language.id?.toLowerCase() === locale);
	if (byId) {
		return byId;
	}

	return languages.find(language => language.label.toLowerCase().includes(locale));
}
