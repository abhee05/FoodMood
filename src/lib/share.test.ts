import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildJoinUrl, copyJoinCode, copyTextToClipboard } from '@/lib/share';

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

