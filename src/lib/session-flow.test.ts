import { describe, expect, it } from 'vitest';

import type { FoodMoodState } from '@/lib/foodmood-api';
import {
  DECIDED_BY_FALLBACK, formatDecidedBy, groupMatchesByTier, MATCH_TIER_ORDER,
  resolveFlowOutcome, resolveProposalView, type ProposalView,
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
