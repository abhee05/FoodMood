import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: vi.fn(), signInAnonymously: vi.fn() },
  },
}));

import {
  acceptFoodMoodProposal,
  createFoodMoodSession,
  getFoodMoodMatches,
  getFoodMoodSessionState,
  joinFoodMoodSession,
  normalizeState,
  proposeFoodMood,
  rejectFoodMoodProposal,
  startAnotherFoodMoodRound,
  submitFoodMoodReactions,
} from '@/lib/foodmood-api';
import {
  resolveFlowOutcome, resolveProposalView,
} from '@/lib/session-flow';

/**
 * Row shapes below are copied verbatim from the live Postgres definitions
 * (project hvcjmktxzeiwuzhmufid). Every RPC declares RETURNS TABLE, so PostgREST
 * hands back a single-element array of flat rows — never a nested object.
 * These fixtures must not be "improved" into fuller payloads: doing so hides
 * missing columns and previously masked a fatal bug where the partial
 * start_another_foodmood_round row blanked out sessionId.
 */
const SESSION_ID = '1c1bb1a6-2362-44a8-9e6e-b37d3df89739';
const PARTICIPANT_ID = 'bd6a2de5-d19d-4af5-be53-43753a6976e8';
const ROUND_ID = '2554e344-1963-4f35-a7b1-d817ee26e30e';
const JOIN_CODE = 'MOOD-7K2P';

/** get_foodmood_session_state(p_session_id uuid) */
function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION_ID,
    join_code: JOIN_CODE,
    participant_count: 2,
    current_round_id: ROUND_ID,
    round_number: 1,
    my_participant_id: PARTICIPANT_ID,
    my_seat: 1,
    my_finished: true,
    partner_finished: true,
    both_finished: true,
    final_food_option_id: null,
    final_selected_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  rpc.mockReset();
});

describe('normalizeState — get_foodmood_session_state contract', () => {
  it('maps every documented column', () => {
    const state = normalizeState([
      stateRow({ partner_display_name: 'Priya' }),
    ]);

    expect(state).toMatchObject({
      sessionId: SESSION_ID,
      joinCode: JOIN_CODE,
      participantId: PARTICIPANT_ID,
      partnerName: 'Priya',
      participantSeat: 1,
      partnerJoined: true,
      bothFinished: true,
      roundId: ROUND_ID,
      roundNumber: 1,
      finalFoodOptionId: null,
    });
  });

  it('treats an empty array as an empty state rather than throwing', () => {
    expect(normalizeState([]).sessionId).toBe('');
  });

  it('exposes the chosen final food id once the round has one', () => {
    const state = normalizeState([
      stateRow({ final_food_option_id: 'pizza' }),
    ]);

    expect(state.finalFoodOptionId).toBe('pizza');
  });

  it('reports a single seat as not yet joined', () => {
    const state = normalizeState([
      stateRow({ participant_count: 1, partner_display_name: null }),
    ]);

    expect(state.partnerJoined).toBe(false);
    expect(state.partnerName).toBe('');
  });
});

describe('create_foodmood_session', () => {
  it('sends p_display_name and normalises the name', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          session_id: SESSION_ID,
          join_code: JOIN_CODE,
          participant_id: PARTICIPANT_ID,
          round_id: ROUND_ID,
          round_number: 1,
        },
      ],
      error: null,
    });

    const state = await createFoodMoodSession('  Abhishek  Rao  ');

    expect(rpc).toHaveBeenCalledWith('create_foodmood_session', {
      p_display_name: 'Abhishek Rao',
    });
    // The create row has no seat column; seat 1 is the correct default.
    expect(state.participantSeat).toBe(1);
    expect(state.joinCode).toBe(JOIN_CODE);
  });
});

describe('joinFoodMoodSession', () => {
  it('reads the bare `seat` column the join RPC actually returns', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          session_id: SESSION_ID,
          participant_id: '9b46cebc-b4a3-49d4-a023-9c0b074ae6b2',
          seat: 2,
          round_id: ROUND_ID,
          round_number: 1,
        },
      ],
      error: null,
    });

    const state = await joinFoodMoodSession(` ${JOIN_CODE.toLowerCase()} `, 'Priya');

    expect(rpc).toHaveBeenCalledWith('join_foodmood_session', {
      p_join_code: JOIN_CODE,
      p_display_name: 'Priya',
    });
    expect(state.participantSeat).toBe(2);
    // The join row carries no join_code; App re-hydrates via the state RPC.
    expect(state.joinCode).toBe('');
  });
});

describe('getFoodMoodSessionState', () => {
  it('refuses an empty session id before it reaches Postgres', async () => {
    await expect(getFoodMoodSessionState('')).rejects.toThrow(
      /no longer active/i
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces "not a participant" as a membership problem, not a bad code', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'You are not a participant in this session' },
    });

    await expect(getFoodMoodSessionState(SESSION_ID)).rejects.toThrow(
      /no longer active for you/i
    );
  });

  it('still maps an unknown join code to the invalid-code message', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'FoodMood session not found' },
    });

    await expect(getFoodMoodSessionState(SESSION_ID)).rejects.toThrow(
      /invalid or no longer active/i
    );
  });
});

describe('startAnotherFoodMoodRound', () => {
  it('returns only the new round and never a full session', async () => {
    rpc.mockResolvedValue({
      data: [{ round_id: '6e82b4f0-ce0c-4a72-ba6a-497d40911075', round_number: 2 }],
      error: null,
    });

    const start = await startAnotherFoodMoodRound(SESSION_ID);

    expect(start).toEqual({
      roundId: '6e82b4f0-ce0c-4a72-ba6a-497d40911075',
      roundNumber: 2,
    });
    // Regression guard: the partial row must not be mistakable for session
    // state, which previously wiped sessionId to '' and stopped polling.
    expect(start).not.toHaveProperty('sessionId');
  });

  it('throws rather than returning an unusable round id', async () => {
    rpc.mockResolvedValue({ data: [{}], error: null });

    await expect(startAnotherFoodMoodRound(SESSION_ID)).rejects.toThrow(
      /could not start another round/i
    );
  });
});

describe('getFoodMoodMatches', () => {
  it('maps every match_tier the RPC can emit', async () => {
    rpc.mockResolvedValue({
      data: [
        { food_option_id: 'pizza', match_tier: 'Perfect', tier_order: 1, food_order: 1 },
        { food_option_id: 'sushi', match_tier: 'Possible', tier_order: 2, food_order: 4 },
        { food_option_id: 'thai', match_tier: 'Backup', tier_order: 3, food_order: 11 },
      ],
      error: null,
    });

    await expect(getFoodMoodMatches(ROUND_ID)).resolves.toEqual([
      { foodOptionId: 'pizza', tier: 'Perfect match' },
      { foodOptionId: 'sushi', tier: 'Possible match' },
      { foodOptionId: 'thai', tier: 'Backup match' },
    ]);
  });

  it('maps an unknown tier to the safest bucket', async () => {
    rpc.mockResolvedValue({
      data: [{ food_option_id: 'indian', match_tier: 'Surprise' }],
      error: null,
    });

    await expect(getFoodMoodMatches(ROUND_ID)).resolves.toEqual([
      { foodOptionId: 'indian', tier: 'Backup match' },
    ]);
  });
});

describe('submitFoodMoodReactions', () => {
  it('serialises reactions as the jsonb array the RPC validates', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await submitFoodMoodReactions(ROUND_ID, {
      pizza: 'craving',
      sushi: 'not_today',
    });

    expect(rpc).toHaveBeenCalledWith('submit_foodmood_reactions', {
      p_round_id: ROUND_ID,
      p_reactions: [
        { food_option_id: 'pizza', choice: 'craving' },
        { food_option_id: 'sushi', choice: 'not_today' },
      ],
    });
  });

  it('explains a partial submission', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Exactly 12 reactions are required' },
    });

    await expect(submitFoodMoodReactions(ROUND_ID, { pizza: 'craving' })).rejects.toThrow(
      /could not save your choices/i
    );
  });
});

/**
 * Proposal flow fixtures. The `proposed_*` columns and the three RPCs come from
 * migration 20261005000000_add_foodmood_proposal.sql.
 */
const ME = 'bd6a2de5-d19d-4af5-be53-43753a6976e8';
const PARTNER = '9b46cebc-b4a3-49d4-a023-9c0b074ae6b2';

describe('normalizeState — proposal columns', () => {
  it('surfaces a pending proposal and its proposer', () => {
    const state = normalizeState([
      stateRow({
        proposed_food_option_id: 'pizza',
        proposed_by_participant_id: PARTNER,
        proposed_at: '2026-10-05 09:00:00+00',
      }),
    ]);

    expect(state.proposedFoodOptionId).toBe('pizza');
    expect(state.proposedByParticipantId).toBe(PARTNER);
  });

  it('defaults to no proposal', () => {
    const state = normalizeState([stateRow()]);
    expect(state.proposedFoodOptionId).toBeNull();
    expect(state.proposedByParticipantId).toBeNull();
  });

  it('does not invent a proposal when the round is fresh', () => {
    const state = normalizeState([stateRow({ round_number: 2 })]);
    expect(state.proposedFoodOptionId).toBeNull();
  });
});

describe('proposeFoodMood', () => {
  it('proposes without finalizing', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await proposeFoodMood(ROUND_ID, 'pizza');

    expect(rpc).toHaveBeenCalledWith('propose_final_foodmood', {
      p_round_id: ROUND_ID,
      p_food_option_id: 'pizza',
    });
  });

  it('rejects a food that is not a shared match', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Only a shared match can be proposed' },
    });

    await expect(proposeFoodMood(ROUND_ID, 'pizza')).rejects.toThrow(
      /only a shared match can be proposed/i
    );
  });

  it('reports a conflicting simultaneous proposal', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message: 'A proposal is already pending or this round is already decided',
      },
    });

    await expect(proposeFoodMood(ROUND_ID, 'pizza')).rejects.toThrow(
      /already waiting for your partner/i
    );
  });

  it('refuses a stale proposal from a finished round', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'This round has already moved on' },
    });

    await expect(proposeFoodMood(ROUND_ID, 'pizza')).rejects.toThrow(
      /already moved on/i
    );
  });
});

describe('acceptFoodMoodProposal', () => {
  it('accepts the partner proposal with only the round id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await acceptFoodMoodProposal(ROUND_ID);

    expect(rpc).toHaveBeenCalledWith('accept_foodmood_proposal', {
      p_round_id: ROUND_ID,
    });
  });

  it('blocks accepting your own proposal', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'You cannot accept your own proposal' },
    });

    await expect(acceptFoodMoodProposal(ROUND_ID)).rejects.toThrow(
      /cannot respond to your own proposal/i
    );
  });

  it('blocks accepting when there is nothing pending', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'There is no proposal to accept' },
    });

    await expect(acceptFoodMoodProposal(ROUND_ID)).rejects.toThrow(
      /no proposal waiting anymore/i
    );
  });

  it('keeps an accepted FoodMood immutable', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'A final FoodMood has already been selected' },
    });

    await expect(acceptFoodMoodProposal(ROUND_ID)).rejects.toThrow(
      /already chose the final/i
    );
  });
});

describe('rejectFoodMoodProposal', () => {
  it('rejects with only the round id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await rejectFoodMoodProposal(ROUND_ID);

    expect(rpc).toHaveBeenCalledWith('reject_foodmood_proposal', {
      p_round_id: ROUND_ID,
    });
  });

  it('blocks rejecting your own proposal', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'You cannot reject your own proposal' },
    });

    await expect(rejectFoodMoodProposal(ROUND_ID)).rejects.toThrow(
      /cannot respond to your own proposal/i
    );
  });

  it('refuses a stale reject from a previous round', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'This round has already moved on' },
    });

    await expect(rejectFoodMoodProposal(ROUND_ID)).rejects.toThrow(
      /already moved on/i
    );
  });
});

describe('proposal round trip across two participants', () => {
  it('ends with both participants on the final FoodMood', async () => {
    // Proposer proposes; partner's poll sees the proposal...
    let server = stateRow({
      proposed_food_option_id: 'pizza',
      proposed_by_participant_id: ME,
    });

    rpc.mockImplementation(async (name: string) => {
      if (name === 'get_foodmood_session_state') return { data: [server], error: null };
      if (name === 'accept_foodmood_proposal') {
        // Server clears the proposal and finalizes.
        server = stateRow({ final_food_option_id: 'pizza', final_selected_at: '2026-10-05 09:01:00+00' });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const proposed = normalizeState([server]);
    expect(proposed.proposedFoodOptionId).toBe('pizza');
    expect(proposed.finalFoodOptionId).toBeNull();

    await acceptFoodMoodProposal(ROUND_ID);
    const afterAccept = normalizeState([server]);

    expect(afterAccept.finalFoodOptionId).toBe('pizza');
    // The proposal is consumed, so neither side can respond to it again.
    expect(afterAccept.proposedFoodOptionId).toBeNull();
    expect(resolveProposalView(afterAccept)).toEqual({ mode: 'none' });
  });

  it('ends with both participants in the next round after a reject', async () => {
    let server = stateRow({
      proposed_food_option_id: 'pizza',
      proposed_by_participant_id: PARTNER,
    });

    rpc.mockImplementation(async (name: string) => {
      if (name === 'reject_foodmood_proposal') {
        server = stateRow({
          round_id: '6e82b4f0-ce0c-4a72-ba6a-497d40911075',
          round_number: 2,
        });
        return { data: null, error: null };
      }
      if (name === 'get_foodmood_session_state') return { data: [server], error: null };
      return { data: null, error: null };
    });

    const before = normalizeState([server]);
    expect(before.finalFoodOptionId).toBeNull();

    await rejectFoodMoodProposal(ROUND_ID);
    const afterReject = normalizeState([server]);

    expect(afterReject.finalFoodOptionId).toBeNull();
    expect(afterReject.roundNumber).toBe(2);
    expect(afterReject.proposedFoodOptionId).toBeNull();
    // The partner's screen advances without a refresh.
    expect(resolveFlowOutcome(before.roundNumber, afterReject, 'reveal')).toBe('newRound');
    expect(resolveProposalView(afterReject)).toEqual({ mode: 'none' });
  });
});
