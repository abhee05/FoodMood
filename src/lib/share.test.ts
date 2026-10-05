import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildJoinUrl, copyJoinCode, copyTextToClipboard, readJoinCodeFromSearch,
} from '@/lib/share';

/**
 * `Navigator.clipboard` is not present in every runtime, so the stub is modelled
 * as an optional own property rather than intersecting the DOM type (which
 * would make it non-optional and unstubbable).
 */
type ClipboardStub = { clipboard?: { writeText: (text: string) => Promise<void> } };

const nav = globalThis.navigator as unknown as ClipboardStub;
const originalClipboard = nav.clipboard;

function stubNavigator(options: {
  writeText?: (text: string) => Promise<void>;
}): void {
  if (options.writeText === undefined) delete nav.clipboard;
  else nav.clipboard = { writeText: options.writeText };
}

beforeEach(() => {
  // node has no DOM, so the legacy textarea fallback must be inert.
  vi.stubGlobal('document', undefined);
});

afterEach(() => {
  nav.clipboard = originalClipboard;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildJoinUrl', () => {
  it('builds the join URL from the current origin and pathname', () => {
    expect(buildJoinUrl('MOOD-7K2P', 'https://foodmood.app', '/')).toBe(
      'https://foodmood.app/?join=MOOD-7K2P'
    );
  });

  it('preserves a nested pathname such as a Vercel preview deploy', () => {
    expect(buildJoinUrl('MOOD-7K2P', 'https://x.vercel.app', '/app/')).toBe(
      'https://x.vercel.app/app/?join=MOOD-7K2P'
    );
  });

  it('does not hard-code a host or code', () => {
    const url = buildJoinUrl('MOOD-ABCD', 'https://example.test', '/');
    expect(url).toContain('example.test');
    expect(url).toContain('MOOD-ABCD');
  });

  it('trims stray whitespace and encodes the code', () => {
    expect(buildJoinUrl('  MOOD-7K2P  ', 'https://a.test', '/')).toBe(
      'https://a.test/?join=MOOD-7K2P'
    );
    expect(buildJoinUrl('MOOD A/B', 'https://a.test', '/')).toBe(
      'https://a.test/?join=MOOD%20A%2FB'
    );
  });
});

describe('copyJoinCode', () => {
  it('copies the bare code, not a URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ writeText });

    await expect(copyJoinCode(' MOOD-7K2P ')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('MOOD-7K2P');
  });

  it('reports failure when the clipboard rejects', async () => {
    stubNavigator({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });

    await expect(copyJoinCode('MOOD-7K2P')).resolves.toBe(false);
  });

  it('reports failure when there is nothing to copy', async () => {
    const writeText = vi.fn();
    stubNavigator({ writeText });

    await expect(copyJoinCode('')).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('copyTextToClipboard', () => {
  it('falls back to execCommand when the Clipboard API is missing', async () => {
    stubNavigator({});
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('document', {
      createElement: () => ({
        value: '',
        style: {},
        setAttribute: vi.fn(),
        select: vi.fn(),
      }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand,
    });

    await expect(copyTextToClipboard('MOOD-7K2P')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});


describe('readJoinCodeFromSearch — an invite link prefills the code', () => {
  it('reads the session code out of ?join=', () => {
    expect(readJoinCodeFromSearch('?join=MOOD-7K2P')).toBe('MOOD-7K2P');
  });

  it('uppercases a lowercased invite code', () => {
    expect(readJoinCodeFromSearch('?join=mood-7k2p')).toBe('MOOD-7K2P');
  });

  it('trims whitespace around the code', () => {
    expect(readJoinCodeFromSearch('?join=%20MOOD-7K2P%20')).toBe('MOOD-7K2P');
  });

  it('works alongside other query parameters', () => {
    expect(readJoinCodeFromSearch('?utm=x&join=MOOD-7K2P&ref=a')).toBe('MOOD-7K2P');
  });

  it('returns empty when there is no join parameter', () => {
    expect(readJoinCodeFromSearch('')).toBe('');
    expect(readJoinCodeFromSearch('?foo=1')).toBe('');
  });

  it('treats an empty join parameter as no code', () => {
    expect(readJoinCodeFromSearch('?join=')).toBe('');
  });

  // The full loop: what Copy invite link puts on the clipboard must come back
  // as a prefilled code, so an invited person only types their name.
  it('round-trips the URL produced by buildJoinUrl', () => {
    const url = buildJoinUrl('MOOD-7K2P', 'https://foodmood.app', '/');

    expect(url).toBe('https://foodmood.app/?join=MOOD-7K2P');
    expect(readJoinCodeFromSearch(url.slice(url.indexOf('?')))).toBe('MOOD-7K2P');
  });

  it('round-trips a code that needs URL encoding', () => {
    const url = buildJoinUrl('MOOD A/B', 'https://foodmood.app', '/');

    expect(url).toBe('https://foodmood.app/?join=MOOD%20A%2FB');
    expect(readJoinCodeFromSearch('?join=MOOD%20A%2FB')).toBe('MOOD A/B');
  });

  it('round-trips on a nested pathname deploy', () => {
    const url = buildJoinUrl('MOOD-7K2P', 'https://x.vercel.app', '/app/');
    expect(readJoinCodeFromSearch('?join=MOOD-7K2P')).toBe('MOOD-7K2P');
    expect(url).toBe('https://x.vercel.app/app/?join=MOOD-7K2P');
  });
});

describe('the invite link and the session code are copied separately', () => {
  it('copies the full URL for the invite link, and only the code for the code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ writeText });
    const lastCopied = () => writeText.mock.calls[writeText.mock.calls.length - 1][0] as string;

    const url = buildJoinUrl('MOOD-7K2P', 'https://foodmood.app', '/');

    // Copy invite link
    expect(await copyTextToClipboard(url)).toBe(true);
    expect(writeText).toHaveBeenLastCalledWith(url);
    expect(lastCopied()).toContain('?join=MOOD-7K2P');

    // Copy code (icon beside the big code, and the Join Code field)
    expect(await copyJoinCode('MOOD-7K2P')).toBe(true);
    expect(writeText).toHaveBeenLastCalledWith('MOOD-7K2P');
    expect(lastCopied()).not.toContain('?join=');
  });
});
