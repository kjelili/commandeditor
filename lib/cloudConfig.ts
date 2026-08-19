/**
 * Cloud provider configuration.
 *
 * Cloud import/export talks directly between the user's browser and their
 * cloud provider (implicit OAuth flow — no server round-trip). Each provider
 * needs an OAuth client/app ID, supplied at build time via NEXT_PUBLIC_*
 * environment variables:
 *
 *   NEXT_PUBLIC_GOOGLE_CLIENT_ID    Google Cloud Console → OAuth 2.0 Client ID
 *   NEXT_PUBLIC_DROPBOX_CLIENT_ID   Dropbox App Console → App key
 *   NEXT_PUBLIC_ONEDRIVE_CLIENT_ID  Microsoft Entra → Application (client) ID
 *
 * When an ID is absent the provider is considered NOT configured and the UI
 * must degrade gracefully (never launch an OAuth flow with an empty
 * client_id — providers reject it with opaque error pages).
 *
 * NOTE: the env reads below use direct property access on purpose —
 * bundlers only inline `process.env.NEXT_PUBLIC_X` when it is written out
 * literally, never via computed keys like process.env[name].
 */

import type { CloudProvider } from '../types';

export function cloudClientId(provider: CloudProvider): string {
  switch (provider) {
    case 'google_drive':
      return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    case 'dropbox':
      return process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID || '';
    case 'onedrive':
      return process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID || '';
    default:
      return '';
  }
}

/** True when an OAuth client ID was baked in for this provider. */
export function isCloudProviderConfigured(provider: CloudProvider): boolean {
  return Boolean(cloudClientId(provider));
}

/** Filter a provider list down to the configured ones, preserving order. */
export function filterConfiguredProviders<T extends { id: CloudProvider }>(providers: T[]): T[] {
  return providers.filter((p) => isCloudProviderConfigured(p.id));
}

/** True when at least one provider is usable in this build. */
export function anyCloudProviderConfigured(): boolean {
  return isCloudProviderConfigured('google_drive')
      || isCloudProviderConfigured('dropbox')
      || isCloudProviderConfigured('onedrive');
}
