/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { extractLocalHostUriMetaDataForPortMapping } from '../../../../platform/tunnel/common/tunnel.js';
import { IRemoteExplorerService } from '../../../services/remote/common/remoteExplorerService.js';
import { mapHasAddressLocalhostOrAllInterfaces } from '../../../services/remote/common/tunnelModel.js';
import { IBrowserViewWorkbenchService } from './browserView.js';

/**
 * In a remote workspace where remote proxying is not enabled, the integrated
 * browser runs on the local machine and cannot reach the remote's localhost
 * directly. This rewrites a remote localhost URL to the local address of an
 * already-forwarded port so the browser can reach it.
 *
 * Returns the original URL and `rewritten: false` when not applicable (remote
 * proxying is enabled, the URL is not a localhost URL, or the remote port has
 * not been forwarded).
 */
export function rewriteRemoteLocalhostUrl(
	url: string,
	browserViewService: IBrowserViewWorkbenchService,
	remoteExplorerService: IRemoteExplorerService,
): { url: string; rewritten: boolean } {
	// When proxying is enabled (or we are not in a remote workspace) the browser
	// can reach the remote host directly, so no rewriting is needed.
	if (browserViewService.willUseRemoteProxy()) {
		return { url, rewritten: false };
	}

	let uri = URI.parse(url);

	// Hostnames are case-insensitive, but the localhost port-mapping matcher is
	// case-sensitive. Normalize the authority so e.g. `http://LOCALHOST:3000` matches.
	if (uri.authority) {
		uri = uri.with({ authority: uri.authority.toLowerCase() });
	}

	const portMapping = extractLocalHostUriMetaDataForPortMapping(uri);
	if (!portMapping) {
		return { url, rewritten: false }; // Not a localhost http(s) URL
	}

	const tunnelModel = remoteExplorerService.tunnelModel;
	const forwarded = mapHasAddressLocalhostOrAllInterfaces(tunnelModel.forwarded, portMapping.address, portMapping.port)
		?? mapHasAddressLocalhostOrAllInterfaces(tunnelModel.detected, portMapping.address, portMapping.port);
	if (!forwarded?.localUri) {
		return { url, rewritten: false }; // The remote port has not been forwarded; leave the URL as-is
	}

	// The forwarded tunnel's `localUri` carries the configured scheme (e.g. https)
	// and local authority; keep the original request's path, query and fragment.
	const rewritten = forwarded.localUri.with({ path: uri.path, query: uri.query, fragment: uri.fragment });
	return { url: rewritten.toString(), rewritten: true };
}

/**
 * Builds a text tool-result item informing the agent that a remote localhost
 * URL was rewritten to its forwarded local address.
 */
export function remoteUrlRewriteNotice(originalUrl: string, rewrittenUrl: string): { kind: 'text'; value: string } {
	return {
		kind: 'text',
		value: `Note: \`${originalUrl}\` was rewritten to \`${rewrittenUrl}\` because this is a remote workspace and the remote port is forwarded to a local address.`,
	};
}
