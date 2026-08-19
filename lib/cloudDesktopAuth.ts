/**
 * Desktop cloud OAuth (Tauri runtime only).
 *
 * Why this exists: Google refuses to whitelist Tauri's `tauri.localhost`
 * origin as a redirect URI AND blocks OAuth inside embedded webviews. So on
 * desktop the flow runs through the system browser instead (RFC 8252 style):
 *
 *   app opens system browser → provider consent → redirect to the already-
 *   registered production callback page (https://commandeditor.com/api/auth/
 *   ‹provider›/callback) → that static page relays the token from the URL
 *   fragment (which never reaches any server) to a loopback listener the
 *   Rust shell started on 127.0.0.1 → back into the app.
 *
 * Privacy: the token passes through our own static site (no server ever sees
 * the fragment) and plain loopback HTTP (never leaves the machine). This is
 * the same exposure class as the browser flow and industry-standard for
 * installed apps.
 *
 * Pure helpers are exported for tests; runDesktopOAuth touches window.__TAURI__.
 */

export interface DesktopOAuthResult {
  accessToken: string;
  expiresIn: number; // seconds
}

/** Where the registered OAuth callbacks live (the production deployment). */
export const DESKTOP_RELAY_ORIGIN = 'https://commandeditor.com';

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Encode the OAuth `state` param so the website callback page knows to relay
 * to the desktop app's loopback listener instead of postMessaging a popup.
 */
export function encodeDesktopState(provider: string, port: number, nonce: string): string {
  return btoa(JSON.stringify({ provider, desktop: true, port, nonce }));
}

/** Parse the path+query the loopback listener received into a token result. */
export function parseLoopbackCallback(path: string): DesktopOAuthResult {
  const query = path.split('?')[1] || '';
  const params = new URLSearchParams(query);
  const error = params.get('error');
  if (error) {
    throw new Error(`Sign-in was denied or failed (${error}).`);
  }
  const accessToken = params.get('access_token') || '';
  if (!accessToken) {
    throw new Error('The provider did not return an access token.');
  }
  const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
  return { accessToken, expiresIn };
}

/**
 * Full desktop flow: start the Rust loopback listener, open the system
 * browser, await the relayed callback. authorizeUrl must already contain
 * client_id, redirect_uri (the relay page), response_type and scope; this
 * appends the desktop state param.
 */
export async function runDesktopOAuth(
  provider: string,
  authorizeUrl: string,
): Promise<DesktopOAuthResult> {
  const t = (window as any).__TAURI__;
  const port: number = await t.invoke('start_oauth_listener');
  const sep = authorizeUrl.includes('?') ? '&' : '?';
  const nonce = Math.random().toString(36).slice(2);
  const state = encodeURIComponent(encodeDesktopState(provider, port, nonce));
  await t.shell.open(`${authorizeUrl}${sep}state=${state}`);
  const path: string = await t.invoke('await_oauth_callback', { port });
  return parseLoopbackCallback(path);
}

/**
 * Used by the /api/auth/‹provider›/callback pages: when the OAuth state
 * marks a desktop flow, relay the token from the URL fragment to the app's
 * loopback listener (top-level navigation) and return true. Returns false
 * for normal popup flows so the page falls through to postMessage.
 */
export function relayToDesktopIfNeeded(providerPath: string): boolean {
  const fragment = new URLSearchParams(window.location.hash.substring(1));
  const query = new URLSearchParams(window.location.search);
  const stateRaw = fragment.get('state') || query.get('state');
  if (!stateRaw) return false;
  try {
    const state = JSON.parse(atob(stateRaw));
    if (!state.desktop || !state.port) return false;
    const q = new URLSearchParams();
    const token = fragment.get('access_token');
    const expires = fragment.get('expires_in');
    const error = fragment.get('error') || query.get('error')
      || fragment.get('error_description') || query.get('error_description');
    if (token) q.set('access_token', token);
    if (expires) q.set('expires_in', expires);
    if (error) q.set('error', error);
    window.location.href =
      `http://127.0.0.1:${state.port}/api/auth/${providerPath}/callback?${q.toString()}`;
    return true;
  } catch {
    return false; // not a desktop state — fall through to the popup flow
  }
}
