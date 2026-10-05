import type { FoodMoodState } from '@/lib/foodmood-api';

/**
 * Pure decision logic for the reveal → proposal → confirmation flow.
 *
 * Extracted from the polling effect so the ordering guarantees (newest round
 * wins, then a final selection, then the reveal) are unit testable without a
 * DOM, and so App keeps a single reconciliation path.
 */

export type FlowOutcome = 'newRound' | 'final' | 'reveal' | 'idle';

/** Screens where a poll result may move the user somewhere new. */
export type FlowScreen = string;

/**
 * Decides what a freshly fetched server state means for the current screen.
 *
 * Order is significant:
 *  1. A higher round number always wins, so a stale in-flight poll can never
 *     drag a participant backwards into a finished round.
 *  2. A final FoodMood outranks the reveal, so acceptance never flashes the
 *     match list first.
 *  3. The reveal is only entered from the waiting screen, so it cannot
 *     re-trigger for someone already reviewing matches.
 */
export function resolveFlowOutcome(
  previousRoundNumber: number | null,
  next: FoodMoodState,
  currentScreen: FlowScreen
): FlowOutcome {
  if (next.roundNumber > (previousRoundNumber ?? next.roundNumber)) {
    return 'newRound';
  }

  if (next.finalFoodOptionId) {
    return 'final';
  }

  if (next.bothFinished && currentScreen === 'wait') {
    return 'reveal';
  }

  return 'idle';
}

export type ProposalView =
  | { mode: 'none' }
  | { mode: 'mine'; foodOptionId: string }
  | { mode: 'theirs'; foodOptionId: string };

/**
 * Describes how the current participant should see a pending proposal.
 *
 * A finalized FoodMood always clears the proposal, so `finalFoodOptionId`
 * short-circuits to 'none' and the reveal hands over to the result screen.
 * The proposer can never be asked to confirm their own pick.
 */
export function resolveProposalView(session: FoodMoodState | null): ProposalView {
  if (!session) return { mode: 'none' };

  const foodOptionId = session.proposedFoodOptionId;
  if (!foodOptionId || session.finalFoodOptionId) return { mode: 'none' };

  return session.proposedByParticipantId &&
    session.proposedByParticipantId === session.participantId
    ? { mode: 'mine', foodOptionId }
    : { mode: 'theirs', foodOptionId };
}