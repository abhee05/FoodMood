import { describe, expect, it } from 'vitest';

import type { FoodMoodState } from '@/lib/foodmood-api';
import { buildJoinUrl, readJoinCodeFromSearch } from '@/lib/share';
import {
  DECIDED_BY_FALLBACK, formatDecidedBy, groupMatchesByTier, isValidJoinCode,
  MATCH_TIER_ORDER, resolveFlowOutcome, resolveInitialScreen, resolveLobbyView,
  resolveProposalView, type ProposalView,
} from '@/lib/session-flow';

const SESSION_ID = '1c1bb1a6-2362-44a8-9e6e-b37d3df89739';
const ME = 'bd6a2de5-d19d-4af5-be53-43753a6976e8';
const PARTNER = '9b46cebc-b4a3-49d4-a023-9c0b074ae6b2';
const ROUND_1 = '2554e344-1963-4f35-a7b1-d817ee26e30e';
const ROUND_2 = '6e82b4f0-ce0c-4a72-ba6a-497d40911075';

function state(overrides: Partial<FoodMoodState> = {}): FoodMoodState {
  return {
    sessionId: SESSION_ID,
    joinCode: 'MOOD-7K2P',
    participantId: ME,
    participantName: 'Abhishek',
    partnerName: 'Sam',
    participantSeat: 1,
    partnerJoined: true,
    bothFinished: true,
    roundId: ROUND_1,
    roundNumber: 1,
    finalFoodOptionId: null,
    proposedFoodOptionId: null,
    proposedByParticipantId: null,
    ...overrides,
  };
}

describe('resolveFlowOutcome — round and result transitions', () => {
  it('enters the reveal once both participants finish', () => {
    expect(resolveFlowOutcome(1, state(), 'wait')).toBe('reveal');
  });

  it('does not re-enter the reveal for someone already reviewing matches', () => {
    expect(resolveFlowOutcome(1, state(), 'reveal')).toBe('idle');
  });

  it('moves to the final screen once a FoodMood is finalized', () => {
    expect(
      resolveFlowOutcome(1, state({ finalFoodOptionId: 'pizza' }), 'reveal')
    ).toBe('final');
  });

  it('moves to a new round when the round number increases', () => {
    const nextRound = state({ roundId: ROUND_2, roundNumber: 2 });
    expect(resolveFlowOutcome(1, nextRound, 'reveal')).toBe('newRound');
  });

  it('prefers the final result over the reveal', () => {
    expect(
      resolveFlowOutcome(1, state({ finalFoodOptionId: 'pizza' }), 'wait')
    ).toBe('final');
  });

  it('prefers a new round over everything else, so polls never go backwards', () => {
    const acceptedThenNewRound = state({
      roundId: ROUND_2,
      roundNumber: 2,
      finalFoodOptionId: 'pizza',
    });
    expect(resolveFlowOutcome(1, acceptedThenNewRound, 'chosen')).toBe('newRound');
  });

  it('ignores a stale response from the previous round', () => {
    // Round 1 response arriving after we already advanced to round 2.
    expect(resolveFlowOutcome(2, state({ roundNumber: 1 }), 'rating')).toBe('idle');
  });

  it('treats a first-ever fetch with no previous round as idle', () => {
    expect(resolveFlowOutcome(null, state(), 'waiting')).toBe('idle');
  });

  it('still reveals on the first fetch when both already finished', () => {
    expect(resolveFlowOutcome(null, state(), 'wait')).toBe('reveal');
  });

  it('keeps the partner waiting while they are not finished', () => {
    expect(
      resolveFlowOutcome(1, state({ bothFinished: false }), 'wait')
    ).toBe('idle');
  });
});

describe('resolveProposalView — who sees what', () => {
  it('shows the match list when nothing is proposed', () => {
    expect(resolveProposalView(state())).toEqual({ mode: 'none' });
  });

  it('shows the partner\'s proposal as theirs, with the proposed food', () => {
    expect(
      resolveProposalView(
        state({
          proposedFoodOptionId: 'pizza',
          proposedByParticipantId: PARTNER,
        })
      )
    ).toEqual({ mode: 'theirs', foodOptionId: 'pizza' });
  });

  it('shows my own proposal back to me as mine', () => {
    expect(
      resolveProposalView(
        state({
          proposedFoodOptionId: 'sushi',
          proposedByParticipantId: ME,
        })
      )
    ).toEqual({ mode: 'mine', foodOptionId: 'sushi' });
  });

  it('never lets the proposer accept their own proposal', () => {
    const view: ProposalView = resolveProposalView(
      state({ proposedFoodOptionId: 'pizza', proposedByParticipantId: ME })
    );
    // Only 'theirs' renders the Accept / Reject buttons.
    expect(view.mode).not.toBe('theirs');
  });

  it('clears the proposal once the FoodMood is final', () => {
    expect(
      resolveProposalView(
        state({
          finalFoodOptionId: 'pizza',
          proposedFoodOptionId: 'pizza',
          proposedByParticipantId: PARTNER,
        })
      )
    ).toEqual({ mode: 'none' });
  });

  it('clears the proposal when the round moves on', () => {
    expect(
      resolveProposalView(
        state({
          roundId: ROUND_2,
          roundNumber: 2,
          proposedFoodOptionId: null,
          proposedByParticipantId: null,
        })
      )
    ).toEqual({ mode: 'none' });
  });

  it('handles a missing session', () => {
    expect(resolveProposalView(null)).toEqual({ mode: 'none' });
  });
});
describe('formatDecidedBy — real names on the result screen', () => {
  it('shows both actual names joined with a plus', () => {
    expect(formatDecidedBy('Ash', 'Abhishek')).toBe('Ash + Abhishek');
  });

  it('keeps long names intact rather than truncating', () => {
    expect(formatDecidedBy('Ashwin Krishnamurthy', 'Abhishek Tripathi')).toBe(
      'Ashwin Krishnamurthy + Abhishek Tripathi'
    );
  });

  it('trims stray whitespace from stored names', () => {
    expect(formatDecidedBy('  Ash  ', '  Abhishek  ')).toBe('Ash + Abhishek');
  });

  it('falls back to generic wording when the partner name is missing (old session)', () => {
    expect(formatDecidedBy('Ash', null)).toBe(DECIDED_BY_FALLBACK);
  });

  it('falls back when my own name is missing', () => {
    expect(formatDecidedBy('', 'Abhishek')).toBe(DECIDED_BY_FALLBACK);
  });

  it('falls back when a name is only whitespace', () => {
    expect(formatDecidedBy('   ', 'Abhishek')).toBe(DECIDED_BY_FALLBACK);
  });

  it('falls back for a session with no names at all', () => {
    expect(formatDecidedBy(null, undefined)).toBe(DECIDED_BY_FALLBACK);
  });
});

describe('groupMatchesByTier — reveal priority and grouping', () => {
  const perfect = { id: 'pizza', tier: 'Perfect match' as const };
  const possible = { id: 'sushi', tier: 'Possible match' as const };
  const backup = { id: 'thai', tier: 'Backup match' as const };

  it('orders Perfect → Possible → Backup', () => {
    const groups = groupMatchesByTier([perfect, possible, backup]);

    expect(groups.map((group) => group.tier)).toEqual([
      'Perfect match',
      'Possible match',
      'Backup match',
    ]);
  });

  it('reorders a shuffled server response into tier priority', () => {
    // The server returns a flat list; grouping is what guarantees the order.
    const groups = groupMatchesByTier([backup, possible, perfect]);

    expect(groups.map((group) => group.tier)).toEqual([
      'Perfect match',
      'Possible match',
      'Backup match',
    ]);
  });

  it('gives each tier its own group so headings are visually separate', () => {
    const groups = groupMatchesByTier([perfect, possible, backup]);

    expect(groups).toHaveLength(3);
    expect(groups[0].matches).toEqual([perfect]);
    expect(groups[1].matches).toEqual([possible]);
    expect(groups[2].matches).toEqual([backup]);
  });

  it('keeps multiple matches together inside their own tier', () => {
    const secondPerfect = { id: 'burger', tier: 'Perfect match' as const };
    const groups = groupMatchesByTier([secondPerfect, backup, perfect]);

    expect(groups).toHaveLength(2);
    expect(groups[0].tier).toBe('Perfect match');
    expect(groups[0].matches.map((match) => match.id)).toEqual(['burger', 'pizza']);
  });

  it('drops empty tiers instead of rendering an empty heading', () => {
    const groups = groupMatchesByTier([possible]);

    expect(groups.map((group) => group.tier)).toEqual(['Possible match']);
  });

  it('handles a single perfect match', () => {
    expect(groupMatchesByTier([perfect])).toEqual([
      { tier: 'Perfect match', matches: [perfect] },
    ]);
  });

  it('returns no groups when there are no matches', () => {
    expect(groupMatchesByTier([])).toEqual([]);
  });

  it('pins the reveal order used by the UI', () => {
    expect(MATCH_TIER_ORDER).toEqual([
      'Perfect match',
      'Possible match',
      'Backup match',
    ]);
  });
});

describe('isValidJoinCode', () => {
  it('accepts a real server code', () => {
    expect(isValidJoinCode('MOOD-YD3G')).toBe(true);
  });

  it('accepts a lowercase code', () => {
    expect(isValidJoinCode('mood-yd3g')).toBe(true);
  });

  it('accepts surrounding whitespace', () => {
    expect(isValidJoinCode('  MOOD-YD3G  ')).toBe(true);
  });

  it('accepts a one and a seven character suffix', () => {
    expect(isValidJoinCode('MOOD-A')).toBe(true);
    expect(isValidJoinCode('MOOD-ABCDEFG')).toBe(true);
  });

  it('rejects a suffix longer than the join input can hold', () => {
    expect(isValidJoinCode('MOOD-ABCDEFGH')).toBe(false);
  });

  it('rejects a missing prefix or suffix', () => {
    expect(isValidJoinCode('MOOD-')).toBe(false);
    expect(isValidJoinCode('YD3G')).toBe(false);
  });

  it('rejects the wrong separator or non-alphanumerics', () => {
    expect(isValidJoinCode('MOOD_YD3G')).toBe(false);
    expect(isValidJoinCode('MOOD-YD-3G')).toBe(false);
    expect(isValidJoinCode('MOOD-YD 3G')).toBe(false);
  });

  it('rejects empty and missing codes', () => {
    expect(isValidJoinCode('')).toBe(false);
    expect(isValidJoinCode(null)).toBe(false);
    expect(isValidJoinCode(undefined)).toBe(false);
  });
});

describe('resolveInitialScreen — an invite link opens Join, not Home', () => {
  it('routes a valid invite straight to Join', () => {
    expect(resolveInitialScreen('?join=MOOD-YD3G')).toBe('join');
  });

  it('routes to Join even before the code is uppercased', () => {
    expect(resolveInitialScreen('?join=mood-yd3g')).toBe('join');
  });

  it('routes to Join with other query parameters present', () => {
    expect(resolveInitialScreen('?utm_source=wa&join=MOOD-YD3G')).toBe('join');
  });

  it('shows Home when there is no join parameter', () => {
    expect(resolveInitialScreen('')).toBe('home');
    expect(resolveInitialScreen('?utm_source=wa')).toBe('home');
  });

  it('shows Home for an invalid code rather than a join form that cannot work', () => {
    expect(resolveInitialScreen('?join=')).toBe('home');
    expect(resolveInitialScreen('?join=nonsense')).toBe('home');
    expect(resolveInitialScreen('?join=MOOD-ABCDEFGH')).toBe('home');
  });

  it('only matches the exact join parameter name', () => {
    expect(resolveInitialScreen('?joney=MOOD-YD3G')).toBe('home');
  });

  it('routes the URL produced by buildJoinUrl to Join', () => {
    const url = buildJoinUrl('MOOD-YD3G', 'https://foodmood.app', '/');
    expect(resolveInitialScreen(url.slice(url.indexOf('?')))).toBe('join');
  });

  it('routes a nested-pathname invite to Join too', () => {
    const url = buildJoinUrl('MOOD-YD3G', 'https://x.vercel.app', '/app/');
    expect(url).toBe('https://x.vercel.app/app/?join=MOOD-YD3G');
    expect(resolveInitialScreen('?join=MOOD-YD3G')).toBe('join');
  });

  it('keeps the code so the invited user only types a name', () => {
    const search = '?join=MOOD-YD3G';
    expect(readJoinCodeFromSearch(search)).toBe('MOOD-YD3G');
    expect(resolveInitialScreen(search)).toBe('join');
  });
});

describe('resolveLobbyView — invitation section only while a seat is open', () => {
  it('shows the invite card while waiting for the second participant', () => {
    expect(resolveLobbyView(false)).toEqual({
      invite: true,
      duoStatus: true,
      canStartRating: false,
    });
  });

  it('removes the invite card once participant 2 joins', () => {
    expect(resolveLobbyView(true)).toEqual({
      invite: false,
      duoStatus: true,
      canStartRating: true,
    });
  });

  it('keeps the two-person status in both states', () => {
    expect(resolveLobbyView(false).duoStatus).toBe(true);
    expect(resolveLobbyView(true).duoStatus).toBe(true);
  });

  it('never offers sharing controls at two participants', () => {
    // invite=false is what drops the code, copy icon, invite URL and instructions.
    expect(resolveLobbyView(true).invite).toBe(false);
  });

  it('enables Start rating exactly when the second participant is present', () => {
    expect(resolveLobbyView(true).canStartRating).toBe(true);
    expect(resolveLobbyView(false).canStartRating).toBe(false);
  });
});
