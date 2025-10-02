import { getOrCreateDisplayName } from './socket';

/**
 * Ensure the backend has an active authenticated session for the current browser.
 * If the existing cookie session is missing or expired, this will automatically
 * mint a guest session tied to the user's current display name so API calls succeed.
 */
export async function ensureApiSession(preferredDisplayName?: string): Promise<boolean> {
  try {
    const me = await fetch('/auth/me', { credentials: 'include' });
    if (me.ok) {
      return true;
    }
  } catch (error) {
    console.warn('ensureApiSession: /auth/me failed', error);
  }

  const displayName = preferredDisplayName?.trim() || getOrCreateDisplayName();

  try {
    const response = await fetch('/api/auth/guest-session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName })
    });

    return response.ok;
  } catch (error) {
    console.error('ensureApiSession: failed to create guest session', error);
    return false;
  }
}
