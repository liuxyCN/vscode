/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareFileNames } from '../../../base/common/comparers.js';
import { dirname, join, normalize, sep } from '../../../base/common/path.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { FileOperationResult, IFileService, IFileStat, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { areSameExtensions, getGalleryExtensionId } from './extensionManagementUtil.js';
import { ExtensionType, IExtensionManifest } from '../../extensions/common/extensions.js';
import { IExtensionManagementService, InstallOptions, ILocalExtension } from './extensionManagement.js';

export function getBundledVsixDirectoryFromAppExecPath(appExecPath: string): { vsixDir: string; installRoot: string } {
	const exeDir = dirname(appExecPath);
	if (isMacintosh) {
		const contentsDir = join(exeDir, '..');
		return {
			vsixDir: join(contentsDir, 'vsix'),
			installRoot: join(contentsDir, '..'),
		};
	}
	return {
		vsixDir: join(exeDir, 'vsix'),
		installRoot: exeDir,
	};
}

export function getBundledVsixDirectoryFromAppRoot(appRoot: string): { vsixDir: string; installRoot: string } {
	if (isMacintosh) {
		const contentsDir = join(appRoot, '..', '..');
		return {
			vsixDir: join(contentsDir, 'vsix'),
			installRoot: join(contentsDir, '..'),
		};
	}
	const installRoot = join(appRoot, '..', '..');
	return {
		vsixDir: join(installRoot, 'vsix'),
		installRoot,
	};
}

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
	const candidate = normalize(candidatePath);
	const root = normalize(rootPath);
	if (candidate === root) {
		return true;
	}
	return candidate.startsWith(root + sep);
}

export interface IBundledVsixInstallProgress {
	report(step: { message?: string; increment?: number }): void;
}

export interface IBundledVsixInstallServices {
	extensionManagementService: Pick<IExtensionManagementService, 'getInstalled' | 'getManifest' | 'install'>;
	fileService: IFileService;
	logService: ILogService;
}

export async function installBundledVsixExtensions(
	vsixDir: string,
	installRoot: string,
	services: IBundledVsixInstallServices,
	progress?: IBundledVsixInstallProgress
): Promise<void> {
	const { extensionManagementService, fileService, logService } = services;
	const extensionsLocation = URI.file(vsixDir);

	if (!isPathInsideRoot(vsixDir, installRoot)) {
		logService.warn('Bundled VSIX directory is outside the application install root; skipping', vsixDir, installRoot);
		return;
	}

	let stat: IFileStat;
	try {
		stat = await fileService.resolve(extensionsLocation);
		if (!stat.children) {
			logService.debug('No bundled VSIX extensions to install', extensionsLocation.toString());
			return;
		}
	} catch (error) {
		if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			logService.debug('No bundled VSIX extensions to install', extensionsLocation.toString());
			return;
		}
		logService.error('Error resolving bundled VSIX directory', getErrorMessage(error));
		return;
	}

	const vsixs = stat.children
		.filter(child => child.name.toLowerCase().endsWith('.vsix'))
		.sort((a, b) => compareFileNames(a.name, b.name));
	if (vsixs.length === 0) {
		logService.debug('No bundled VSIX extensions to install', extensionsLocation.toString());
		return;
	}

	logService.info('Installing bundled VSIX extensions from', extensionsLocation.toString());

	const installed = await extensionManagementService.getInstalled(ExtensionType.User);
	const increment = 100 / vsixs.length;
	const installOptions: InstallOptions = { donotIncludePackAndDependencies: true, installGivenVersion: true };

	for (const vsix of vsixs) {
		progress?.report({ message: vsix.name, increment });

		if (!isPathInsideRoot(vsix.resource.fsPath, installRoot)) {
			logService.warn('Skipping VSIX outside application install root', vsix.resource.toString());
			continue;
		}

		try {
			const manifest = await extensionManagementService.getManifest(vsix.resource);
			const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);

			if (isExtensionInstalled(installed, extensionId, manifest)) {
				logService.info('Bundled extension already installed, removing VSIX', extensionId, manifest.version, vsix.resource.toString());
				await deleteVsix(fileService, logService, vsix.resource);
				continue;
			}

			logService.info('Installing bundled extension', extensionId, manifest.version, vsix.resource.toString());
			const local = await extensionManagementService.install(vsix.resource, installOptions);
			updateInstalledList(installed, local);
			logService.info('Bundled extension installed', extensionId, vsix.resource.toString());
			await deleteVsix(fileService, logService, vsix.resource);
		} catch (error) {
			logService.error('Error installing bundled extension', vsix.resource.toString(), getErrorMessage(error));
		}
	}

	logService.info('Finished installing bundled VSIX extensions', extensionsLocation.toString());
}

function isExtensionInstalled(installed: ILocalExtension[], extensionId: string, manifest: IExtensionManifest): boolean {
	return installed.some(e =>
		areSameExtensions(e.identifier, { id: extensionId }) && e.manifest.version === manifest.version
	);
}

function updateInstalledList(installed: ILocalExtension[], local: ILocalExtension): void {
	const index = installed.findIndex(e => areSameExtensions(e.identifier, local.identifier));
	if (index === -1) {
		installed.push(local);
	} else {
		installed[index] = local;
	}
}

async function deleteVsix(fileService: IFileService, logService: ILogService, vsix: URI): Promise<void> {
	try {
		await fileService.del(vsix, { useTrash: false });
	} catch (error) {
		logService.warn('Failed to delete bundled VSIX after processing', vsix.toString(), getErrorMessage(error));
	}
}
