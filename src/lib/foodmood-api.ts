import { supabase } from '@/lib/supabase';

export type Reaction = 'craving' | 'maybe' | 'not_today';

/**
 * Display-name argument expected by the create/join RPCs.
 * Kept as a single constant so it can be re-pointed in one place if the
 * deployed Postgres signatures use a different parameter name.
 */
export const DISPLAY_NAME_RPC_PARAM = 'p_display_name';

export const MAX_DISPLAY_NAME_LENGTH = 24;

/** Trims, collapses inner whitespace and clamps to the maximum length. */
export function normalizeDisplayName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
}

export type FoodMoodState = {
  sessionId: string;
  joinCode: string;
  participantId: string;
  participantName: string;
  partnerName: string;
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

/**
 * `start_another_foodmood_round` returns only the new round identity — it does
 * NOT return session_id, join_code or participant_id. It is therefore a
 * distinct shape so it can never be mistaken for a full `FoodMoodState`.
 */
export type FoodMoodRoundStart = {
  roundId: string;
  roundNumber: number;
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

/** Trims and collapses runs of whitespace in a name coming back from Postgres. */
function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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

  // Must be checked before the generic "session" branch below, because the RPC
  // text ("You are not a participant in this session") contains "session".
  if (message.includes('not a participant')) {
    return 'This FoodMood is no longer active for you. Please join again with the code.';
  }

  if (message.includes('code') || message.includes('session')) {
    return 'That FoodMood code is invalid or no longer active.';
  }

  if (message.includes('shared matches')) {
    return 'Tonight’s FoodMood has to be one of the shared matches.';
  }

  if (message.includes('final') || message.includes('selected')) {
    return 'Your partner already chose the final FoodMood.';
  }

  if (message.includes('name') || message.includes('character')) {
    return 'Please enter your name (2 to 24 characters).';
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

  // join_foodmood_session returns the seat as a bare `seat` column, while
  // get_foodmood_session_state returns it as `my_seat`.
  const participantSeat = numberValue(
    root.my_seat,
    root.participant_seat,
    root.participantSeat,
    root.seat,
    participant.seat
  );

  const partnerName = cleanName(stringValue(
    root.partner_name,
    root.partnerName,
    root.partner_display_name,
    root.partnerDisplayName,
    root.other_participant_name,
    root.otherParticipantName,
    session.partner_name,
    session.partner_display_name
  ));

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

    participantName: cleanName(stringValue(
      root.participant_name,
      root.participantName,
      root.my_display_name,
      participant.display_name
    )),

    partnerName,

    participantSeat,

    partnerJoined:
      Boolean(partnerName) ||
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
        root.chosen_food_option_id,
        round.final_food_option_id,
        round.finalFoodOptionId,
        session.final_food_option_id
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

export async function createFoodMoodSession(
  displayName: string
): Promise<FoodMoodState> {
  const { data, error } = await supabase.rpc('create_foodmood_session', {
    [DISPLAY_NAME_RPC_PARAM]: normalizeDisplayName(displayName),
  });

  return normalizeState(
    assertRpc(
      data,
      error,
      'We could not create a FoodMood. Please try again.'
    )
  );
}

export async function joinFoodMoodSession(
  joinCode: string,
  displayName: string
): Promise<FoodMoodState> {
  const { data, error } = await supabase.rpc(
    'join_foodmood_session',
    {
      p_join_code: joinCode.trim().toUpperCase(),
      [DISPLAY_NAME_RPC_PARAM]: normalizeDisplayName(displayName),
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
  // An empty id would be sent as an invalid uuid and come back as a confusing
  // generic failure, so fail fast with an actionable message instead.
  if (!sessionId.trim()) {
    throw new Error('This FoodMood session is no longer active.');
  }

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
): Promise<FoodMoodRoundStart> {
  const { data, error } = await supabase.rpc(
    'start_another_foodmood_round',
    {
      p_session_id: sessionId,
    }
  );

  const row = firstRecord(
    assertRpc<unknown>(
      data,
      error,
      'We could not start another round yet. Please refresh and try again.'
    )
  );

  const roundId = stringValue(row.round_id, row.roundId, row.id);

  // The RPC cannot return a blank round id; treat it as a failed transition
  // rather than handing the caller an unusable session.
  if (!roundId) {
    throw new Error(
      'We could not start another round yet. Please refresh and try again.'
    );
  }

  return {
    roundId,
    roundNumber: numberValue(row.round_number, row.roundNumber),
  };
}
