/**
 * Invite-link and clipboard helpers.
 *
 * Kept free of React so the lobby's URL building and Copy Code behaviour are
 * unit testable.
 */

/** Builds the join URL for the current session, preserving the app pathname. */
export function buildJoinUrl(code: string, origin?: string, pathname?: string): string {
  const base = origin
    ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const path = pathname
    ?? (typeof window !== 'undefined' ? window.location.pathname : '/');

  return `${base}${path}?join=${encodeURIComponent(code.trim())}`;
}

/**
 * Copies text, preferring the async Clipboard API and falling back to a
 * hidden textarea + execCommand for insecure contexts and older webviews
 * where `navigator.clipboard` is missing or rejects.
 *
 * Returns whether the text actually reached the clipboard.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context; try the legacy path below.
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

/** Copies the raw session join code, e.g. "MOOD-7K2P". */
export async function copyJoinCode(code: string): Promise<boolean> {
  return copyTextToClipboard(code.trim());
}
