import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildJoinUrl, copyJoinCode, copyTextToClipboard, shareInviteLink,
} from '@/lib/share';

/**
 * `Navigator.share` and `Navigator.clipboard` are not present in every runtime,
 * so the stubs are modelled as optional own properties rather than intersecting
 * the DOM types (which would make them non-optional and unstubbable).
 */
type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

const nav = globalThis.navigator as unknown as ShareNavigator;
const originalShare = nav.share;
const originalClipboard = nav.clipboard;

function stubNavigator(options: {
  share?: (data: ShareData) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}): void {
  if (options.share === undefined) delete nav.share;
  else nav.share = options.share;

  if (options.writeText === undefined) delete nav.clipboard;
  else nav.clipboard = { writeText: options.writeText };
}

beforeEach(() => {
  // node has no DOM, so the legacy textarea fallback must be inert.
  vi.stubGlobal('document', undefined);
});

afterEach(() => {
  nav.share = originalShare;
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

describe('shareInviteLink', () => {
  const url = 'https://foodmood.app/?join=MOOD-7K2P';

  it('uses the native share sheet when the browser supports it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, writeText });

    await expect(shareInviteLink(url, 'MOOD-7K2P')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url, title: 'Join my FoodMood' })
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('includes the join code in the shared text so it survives WhatsApp', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });

    await shareInviteLink(url, 'MOOD-7K2P');

    expect(share.mock.calls[0][0].text).toContain('MOOD-7K2P');
  });

  it('copies the invite link when native sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ writeText });

    await expect(shareInviteLink(url, 'MOOD-7K2P')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('copies the invite link when native sharing throws', async () => {
    stubNavigator({
      share: vi.fn().mockRejectedValue(new Error('not allowed')),
      writeText: vi.fn().mockResolvedValue(undefined),
    });

    await expect(shareInviteLink(url, 'MOOD-7K2P')).resolves.toBe('copied');
  });

  it('does not copy anything when the user cancels the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share: vi.fn().mockRejectedValue(abort), writeText });

    await expect(shareInviteLink(url, 'MOOD-7K2P')).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reports failure only when both share and copy fail', async () => {
    stubNavigator({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });

    await expect(shareInviteLink(url, 'MOOD-7K2P')).resolves.toBe('failed');
  });
});