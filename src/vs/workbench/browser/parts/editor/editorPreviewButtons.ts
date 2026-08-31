/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { globMatchesResource } from '../../../services/editor/common/editorResolverService.js';
import { ExtensionsRegistry, IExtensionPointUser } from '../../../services/extensions/common/extensionsRegistry.js';

export const IEditorPreviewButtonsService = createDecorator<IEditorPreviewButtonsService>('editorPreviewButtonsService');

export interface IEditorPreviewButtonContribution {
	readonly filenamePattern: string;
	readonly previewEditor: string;
	/** Localized label for the Edit button. Falls back to the workbench default when omitted. */
	readonly editLabel?: string;
	/** Localized label for the Preview button. Falls back to the workbench default when omitted. */
	readonly previewLabel?: string;
}

export type IEditorPreviewButtonMatch = Pick<IEditorPreviewButtonContribution, 'previewEditor' | 'editLabel' | 'previewLabel'>;

export interface IEditorPreviewButtonsService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<void>;

	/**
	 * Returns all `editorPreviewButtons` contributions matching the resource, highest
	 * priority (most recently registered) first.
	 */
	getPreviewButtonMatches(resource: URI): readonly IEditorPreviewButtonMatch[];

	/**
	 * Registers a preview button mapping from workbench code (for built-in editors that are
	 * not contributed through an extension manifest).
	 */
	register(contribution: IEditorPreviewButtonContribution): IDisposable;
}

interface IRegisteredEditorPreviewButton extends IEditorPreviewButtonContribution {
	readonly order: number;
}

const editorPreviewButtonsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IEditorPreviewButtonContribution[]>({
	extensionPoint: 'editorPreviewButtons',
	jsonSchema: {
		description: localize('editorPreviewButtons.description', 'Contributes Edit/Preview button mappings for the breadcrumbs bar. When a resource matches `filenamePattern`, the breadcrumbs bar shows Edit and Preview buttons instead of the editor type dropdown. Edit opens the text editor; Preview opens `previewEditor`.'),
		type: 'array',
		defaultSnippets: [{
			body: [{
				filenamePattern: '$1',
				previewEditor: '$2'
			}]
		}],
		items: {
			type: 'object',
			required: ['filenamePattern', 'previewEditor'],
			additionalProperties: false,
			properties: {
				filenamePattern: {
					type: 'string',
					description: localize('editorPreviewButtons.filenamePattern', 'Glob pattern for files that show Edit/Preview buttons (for example \"*.csv\").'),
				},
				previewEditor: {
					type: 'string',
					description: localize('editorPreviewButtons.previewEditor', 'Editor view type opened by the Preview button. Must match a registered custom editor or workbench editor id.'),
				},
				editLabel: {
					type: 'string',
					description: localize('editorPreviewButtons.editLabel', 'Label for the Edit button. Use a localized string from the extension\'s language pack (for example \"%myExt.edit%\"). When omitted, the workbench default is used.'),
				},
				previewLabel: {
					type: 'string',
					description: localize('editorPreviewButtons.previewLabel', 'Label for the Preview button. Use a localized string from the extension\'s language pack (for example \"%myExt.preview%\"). When omitted, the workbench default is used.'),
				}
			}
		}
	}
});

class EditorPreviewButtonsService extends Disposable implements IEditorPreviewButtonsService {

	declare readonly _serviceBrand: undefined;

	private readonly _extensionContributions: IRegisteredEditorPreviewButton[] = [];
	private readonly _workbenchContributions: IRegisteredEditorPreviewButton[] = [];
	private _nextOrder = 0;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor() {
		super();

		this._register(editorPreviewButtonsExtensionPoint.setHandler(extensions => {
			this.updateExtensionContributions(extensions);
		}));
	}

	register(contribution: IEditorPreviewButtonContribution): IDisposable {
		const registered: IRegisteredEditorPreviewButton = {
			...contribution,
			order: this._nextOrder++,
		};
		this._workbenchContributions.push(registered);
		this._onDidChange.fire();
		return toDisposable(() => {
			const index = this._workbenchContributions.indexOf(registered);
			if (index >= 0) {
				this._workbenchContributions.splice(index, 1);
				this._onDidChange.fire();
			}
		});
	}

	getPreviewButtonMatches(resource: URI): readonly IEditorPreviewButtonMatch[] {
		return this.getMatchingContributions(resource).map(match => ({
			previewEditor: match.previewEditor,
			editLabel: match.editLabel,
			previewLabel: match.previewLabel,
		}));
	}

	private getMatchingContributions(resource: URI): IRegisteredEditorPreviewButton[] {
		return [...this._extensionContributions, ...this._workbenchContributions]
			.filter(contribution => globMatchesResource(contribution.filenamePattern, resource))
			.sort((a, b) => b.order - a.order);
	}

	private updateExtensionContributions(extensions: readonly IExtensionPointUser<IEditorPreviewButtonContribution[]>[]): void {
		this._extensionContributions.length = 0;

		for (const extension of extensions) {
			for (const contribution of extension.value) {
				if (!contribution.filenamePattern || !contribution.previewEditor) {
					continue;
				}
				this._extensionContributions.push({
					filenamePattern: contribution.filenamePattern,
					previewEditor: contribution.previewEditor,
					editLabel: contribution.editLabel,
					previewLabel: contribution.previewLabel,
					order: this._nextOrder++,
				});
			}
		}

		this._onDidChange.fire();
	}
}

registerSingleton(IEditorPreviewButtonsService, EditorPreviewButtonsService, InstantiationType.Delayed);
