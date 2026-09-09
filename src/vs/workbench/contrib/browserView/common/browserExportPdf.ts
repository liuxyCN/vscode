/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { IBrowserViewModel } from './browserView.js';
import { BrowserEditorInput } from './browserEditorInput.js';

function pdfBaseNameFromFileResource(resource: URI): string {
	const base = resource.path.split('/').pop() ?? '';
	const dcMatch = base.match(/^(.+)\.dc\.html$/i);
	if (dcMatch) {
		return dcMatch[1];
	}
	try {
		const decoded = decodeURIComponent(base);
		const decodedMatch = decoded.match(/^(.+)\.dc\.html$/i);
		if (decodedMatch) {
			return decodedMatch[1];
		}
	} catch {
		// ignore
	}
	return basename(resource).replace(/\.html?$/i, '');
}

export function resolveFileSourceUri(model: IBrowserViewModel, input: BrowserEditorInput | undefined): URI | undefined {
	const associated = input?.associatedResource ?? model.associatedResource;
	if (associated?.scheme === Schemas.file) {
		return associated;
	}
	if (!model.url.startsWith('file://')) {
		return undefined;
	}
	try {
		const parsed = URI.parse(model.url);
		if (parsed.scheme === Schemas.file) {
			return parsed;
		}
	} catch {
		// ignore
	}
	return undefined;
}

export function resolveDefaultPdfUri(sourceFile: URI): URI {
	const dir = dirname(sourceFile);
	const baseName = pdfBaseNameFromFileResource(sourceFile);
	return joinPath(dir, `${baseName}.pdf`);
}

const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;

export function suggestPdfFileName(title: string, url: string): string {
	const fromTitle = title.trim().replace(INVALID_FILE_NAME_CHARS, '_').slice(0, 80);
	if (fromTitle && fromTitle !== BrowserEditorInput.DEFAULT_LABEL) {
		return `${fromTitle}.pdf`;
	}
	try {
		const parsed = new URL(url);
		const segment = parsed.pathname.split('/').pop()?.replace(/\.html?$/i, '') || parsed.hostname;
		const safe = segment.replace(INVALID_FILE_NAME_CHARS, '_') || 'page';
		return `${safe}.pdf`;
	} catch {
		return 'page.pdf';
	}
}
