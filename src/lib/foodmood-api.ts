import { supabase } from '@/lib/supabase';

export type Reaction = 'craving' | 'maybe' | 'not_today';

export type FoodMoodState = {
  sessionId: string;
  joinCode: string;
  participantId: string;
  participantName: string;
  participantSeat: number;
  partnerJoined: boolean;
  bothFinished: boolean;
  roundId: string;
  roundNumber: number;
  finalFoodOptionId: string | null;
};

export type FoodMoodMatch = {
  foodOptionId: string;
  tier: 'Perfect match' | 'Possible match' | 'Backup match';
};

type JsonRecord = Record<string, unknown>;

function firstRecord(value: unknown): JsonRecord {
  if (Array.isArray(value)) return (value[0] ?? {}) as JsonRecord;
  return (value ?? {}) as JsonRecord;
}

function nestedRecord(record: JsonRecord, key: string): JsonRecord {
  return typeof record[key] === 'object' && record[key] !== null
    ? record[key] as JsonRecord
    : {};
}

function stringValue(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === 'string') ?? '';
}

function booleanValue(...values: unknown[]): boolean {
  return values.find((value): value is boolean => typeof value === 'boolean') ?? false;
}

function numberValue(...values: unknown[]): number {
  return values.find((value): value is number => typeof value === 'number') ?? 1;
}

function getErrorMessage(
  error: { message?: string } | null,
  fallback: string
): string {
  const message = error?.message?.toLowerCase() ?? '';

  if (message.includes('full') || message.includes('seat')) {
    return 'This FoodMood already has two participants.';
  }

  if (message.includes('code') || message.includes('session')) {
    return 'That FoodMood code is invalid or no longer active.';
  }

  if (message.includes('final') || message.includes('selected')) {
    return 'Your partner already chose the final FoodMood.';
  }

  return fallback;
}

function assertRpc<T>(
  data: unknown,
  error: { message?: string } | null,
  fallback: string
): T {
  if (error) throw new Error(getErrorMessage(error, fallback));
  return data as T;
}

export function normalizeState(data: unknown): FoodMoodState {
  const root = firstRecord(data);
  const session = nestedRecord(root, 'session');
  const participant = nestedRecord(root, 'participant');
  const round = nestedRecord(root, 'round');

  const participantCount = numberValue(
    root.participant_count,
    root.participantCount
  );

  const participantSeat = numberValue(
    root.my_seat,
    root.participant_seat,
    root.participantSeat,
    participant.seat
  );

  return {
    sessionId: stringValue(
      root.session_id,
      root.sessionId,
      session.id
    ),

    joinCode: stringValue(
      root.join_code,
      root.joinCode,
      session.join_code
    ),

    participantId: stringValue(
      root.my_participant_id,
      root.participant_id,
      root.participantId,
      participant.id
    ),

    participantName: stringValue(
      root.participant_name,
      root.participantName,
      participant.display_name
    ),

    participantSeat,

    partnerJoined:
      participantCount >= 2 ||
      booleanValue(
        root.partner_joined,
        root.partnerJoined,
        root.session_full
      ),

    bothFinished: booleanValue(
      root.both_finished,
      root.bothFinished,
      root.reveal_unlocked
    ),

    roundId: stringValue(
      root.current_round_id,
      root.round_id,
      root.roundId,
      round.id
    ),

    roundNumber: numberValue(
      root.round_number,
      root.roundNumber,
      round.round_number
    ),

    finalFoodOptionId:
      stringValue(
        root.final_food_option_id,
        root.finalFoodOptionId,
        round.final_food_option_id
      ) || null,
  };
}

export async function authenticateAnonymously(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error('We could not check your session. Please try again.');
  }

  if (data.session) return;

  const signInResult = await supabase.auth.signInAnonymously();

  if (signInResult.error) {
    throw new Error(
      'We could not start a secure FoodMood session. Please try again.'
    );
  }
}

export async function createFoodMoodSession(): Promise<FoodMoodState> {
  const { data, error } = await supabase.rpc('create_foodmood_session');

  return normalizeState(
    assertRpc(
      data,
      error,
      'We could not create a FoodMood. Please try again.'
    )
  );
}

export async function joinFoodMoodSession(
  joinCode: string
): Promise<FoodMoodState> {
  const { data, error } = await supabase.rpc(
    'join_foodmood_session',
    {
      p_join_code: joinCode.trim().toUpperCase(),
    }
  );

  return normalizeState(
    assertRpc(
      data,
      error,
      'We could not join this FoodMood. Please try again.'
    )
  );
}

export async function getFoodMoodSessionState(
  sessionId: string
): Promise<FoodMoodState> {
  const { data, error } = await supabase.rpc(
    'get_foodmood_session_state',
    {
      p_session_id: sessionId,
    }
  );

  return normalizeState(
    assertRpc(
      data,
      error,
      'We could not refresh the FoodMood. Please try again.'
    )
  );
}

export async function submitFoodMoodReactions(
  roundId: string,
  reactions: Record<string, Reaction>
): Promise<void> {
  const payload = Object.entries(reactions).map(
    ([foodOptionId, choice]) => ({
      food_option_id: foodOptionId,
      choice,
    })
  );

  const { data, error } = await supabase.rpc(
    'submit_foodmood_reactions',
    {
      p_round_id: roundId,
      p_reactions: payload,
    }
  );

  assertRpc(
    data,
    error,
    'We could not save your choices. Please try again.'
  );
}

export async function getFoodMoodMatches(
  roundId: string
): Promise<FoodMoodMatch[]> {
  const { data, error } = await supabase.rpc(
    'get_foodmood_matches',
    {
      p_round_id: roundId,
    }
  );

  const result = assertRpc<unknown>(
    data,
    error,
    'We could not reveal the matches. Please try again.'
  );

  const rows = Array.isArray(result)
    ? result
    : (firstRecord(result).matches ?? []);

  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const record = row as JsonRecord;

      const rawTier = stringValue(
        record.tier,
        record.match_tier
      ).toLowerCase();

      const tier: FoodMoodMatch['tier'] =
        rawTier.includes('perfect')
          ? 'Perfect match'
          : rawTier.includes('possible')
          ? 'Possible match'
          : 'Backup match';

      return {
        foodOptionId: stringValue(
          record.food_option_id,
          record.foodOptionId,
          record.id
        ),
        tier,
      };
    })
    .filter((match) => match.foodOptionId);
}

export async function selectFinalFoodMood(
  roundId: string,
  foodOptionId: string
): Promise<void> {
  const { data, error } = await supabase.rpc(
    'select_final_foodmood',
    {
      p_round_id: roundId,
      p_food_option_id: foodOptionId,
    }
  );

  assertRpc(
    data,
    error,
    'Your partner may have already chosen the final FoodMood.'
  );
}

export async function startAnotherFoodMoodRound(
  sessionId: string
): Promise<FoodMoodState> {
  const { data, error } = await supabase.rpc(
    'start_another_foodmood_round',
    {
      p_session_id: sessionId,
    }
  );

  return normalizeState(
    assertRpc(
      data,
      error,
      'We could not start another round yet. Please refresh and try again.'
    )
  );
}
