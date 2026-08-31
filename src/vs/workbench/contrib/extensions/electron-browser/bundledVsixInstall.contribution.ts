/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { installBundledVsixExtensions, getBundledVsixDirectoryFromAppRoot } from '../../../../platform/extensionManagement/common/bundledVsixInstall.js';
import { registerWorkbenchContribution2, WorkbenchPhase, IWorkbenchContribution } from '../../../common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';

class BundledVsixInstallContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.bundledVsixInstall';

	constructor(
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		if (!environmentService.isBuilt) {
			return;
		}

		const localServer = extensionManagementServerService.localExtensionManagementServer;
		if (!localServer) {
			return;
		}

		this.installBundledExtensions(localServer.extensionManagementService);
	}

	private async installBundledExtensions(extensionManagementService: IExtensionManagementService): Promise<void> {
		const { vsixDir, installRoot } = getBundledVsixDirectoryFromAppRoot(this.environmentService.appRoot);

		try {
			await this.progressService.withProgress(
				{
					location: ProgressLocation.Window,
					title: localize('installingBundledExtensions', "Installing extensions..."),
				},
				async progress => {
					await installBundledVsixExtensions(vsixDir, installRoot, {
						extensionManagementService,
						fileService: this.fileService,
						logService: this.logService,
					}, {
						report: step => progress.report(step),
					});
				}
			);
		} catch (error) {
			this.logService.error('Bundled VSIX installation failed', error);
		}
	}
}

registerWorkbenchContribution2(BundledVsixInstallContribution.ID, BundledVsixInstallContribution, WorkbenchPhase.BlockRestore);
