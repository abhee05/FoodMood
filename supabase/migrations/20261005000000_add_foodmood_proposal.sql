-- FoodMood: two-person confirmation for the final FoodMood.
--
-- A click on a shared match now creates a *proposal* instead of finalizing the
-- pick. The proposer waits; only the other participant can accept or reject.
--
-- Design: three nullable columns on `round`. No new tables, no schema change
-- beyond additive columns, so the existing exactly-two-participants model and
-- match logic are untouched.
--
-- Security notes:
--   * Every new function is SECURITY DEFINER with SET search_path = '', and
--     re-establishes membership from auth.uid() before touching anything.
--   * Each function rejects a round_id that is no longer the session's newest
--     round, so a stale request from a finished round cannot alter the current
--     one (re-checked after taking the session lock, to close the race where
--     two requests race into a new round).
--   * Nothing here exposes reactions; matches still come only from
--     get_foodmood_matches, which requires both participants to have finished.
--   * select_final_foodmood is revoked from `authenticated` so no client can
--     bypass the confirmation step and finalize unilaterally.
--
-- Rollback: 20261005000000_add_foodmood_proposal.down.sql

alter table public.round
  add column if not exists proposed_food_option_id text
    references public.food_option (id) on delete set null,
  add column if not exists proposed_by_participant_id uuid
    references public.participant (id) on delete set null,
  add column if not exists proposed_at timestamp with time zone;

-- Session state now carries the pending proposal so both browsers learn about
-- it through the same poll they already use. Requires DROP + CREATE because a
-- RETURNS TABLE signature cannot be altered in place; EXECUTE is re-granted.
drop function if exists public.get_foodmood_session_state(uuid);

create or replace function public.get_foodmood_session_state(p_session_id uuid)
returns table (
  session_id uuid,
  join_code text,
  participant_count integer,
  current_round_id uuid,
  round_number smallint,
  my_participant_id uuid,
  my_seat smallint,
  my_finished boolean,
  partner_finished boolean,
  both_finished boolean,
  final_food_option_id text,
  final_selected_at timestamp with time zone,
  partner_display_name text,
  proposed_food_option_id text,
  proposed_by_participant_id uuid,
  proposed_at timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_my_participant_id uuid;
  v_my_seat smallint;
  v_round_id uuid;
  v_round_number smallint;
begin

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.id, p.seat
  into v_my_participant_id, v_my_seat
  from public.participant p
  where p.session_id = p_session_id
    and p.user_id = v_user_id;

  if v_my_participant_id is null then
    raise exception 'You are not a participant in this session';
  end if;

  select r.id, r.round_number
  into v_round_id, v_round_number
  from public.round r
  where r.session_id = p_session_id
  order by r.round_number desc
  limit 1;

  return query
  select
    s.id,
    s.join_code,

    (
      select count(*)::integer
      from public.participant p
      where p.session_id = s.id
    ),

    v_round_id,
    v_round_number,
    v_my_participant_id,
    v_my_seat,

    (
      select count(*) = 12
      from public.reaction rx
      where rx.round_id = v_round_id
        and rx.participant_id = v_my_participant_id
    ),

    coalesce((
      select count(*) = 12
      from public.reaction rx
      join public.participant pp
        on pp.id = rx.participant_id
      where rx.round_id = v_round_id
        and pp.session_id = p_session_id
        and pp.id <> v_my_participant_id
      group by pp.id
    ), false),

    (
      select count(*) = 2
      from (
        select rx.participant_id
        from public.reaction rx
        where rx.round_id = v_round_id
        group by rx.participant_id
        having count(*) = 12
      ) completed
    ),

    r.final_food_option_id,
    r.final_selected_at,

    (
      select p.display_name
      from public.participant p
      where p.session_id = p_session_id
        and p.id <> v_my_participant_id
      order by p.seat
      limit 1
    ),

    r.proposed_food_option_id,
    r.proposed_by_participant_id,
    r.proposed_at

  from public.session s
  join public.round r
    on r.id = v_round_id
  where s.id = p_session_id;

end;
$function$;

-- Step A: propose one of the shared matches. First proposal wins, so two
-- simultaneous taps cannot create conflicting proposals.
create or replace function public.propose_final_foodmood(
  p_round_id uuid,
  p_food_option_id text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_participant_id uuid;
  v_latest_round_id uuid;
  v_is_match boolean;
begin

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select r.session_id
  into v_session_id
  from public.round r
  where r.id = p_round_id;

  if v_session_id is null then
    raise exception 'Round not found';
  end if;

  select p.id
  into v_participant_id
  from public.participant p
  where p.session_id = v_session_id
    and p.user_id = v_user_id;

  if v_participant_id is null then
    raise exception 'You are not a participant in this session';
  end if;

  select r.id
  into v_latest_round_id
  from public.round r
  where r.session_id = v_session_id
  order by r.round_number desc
  limit 1;

  if v_latest_round_id is distinct from p_round_id then
    raise exception 'This round has already moved on';
  end if;

  -- get_foodmood_matches itself raises unless both participants finished, so
  -- a proposal can only ever be a genuine shared match.
  select exists (
    select 1
    from public.get_foodmood_matches(p_round_id) m
    where m.food_option_id = p_food_option_id
  )
  into v_is_match;

  if not v_is_match then
    raise exception 'Only a shared match can be proposed';
  end if;

  update public.round
  set
    proposed_food_option_id = p_food_option_id,
    proposed_by_participant_id = v_participant_id,
    proposed_at = now()
  where id = p_round_id
    and proposed_food_option_id is null
    and final_food_option_id is null;

  if not found then
    raise exception 'A proposal is already pending or this round is already decided';
  end if;

end;
$function$;

-- Step D: the partner confirms, which finalizes the pick. First-write-wins on
-- final_food_option_id keeps an accepted FoodMood immutable.
create or replace function public.accept_foodmood_proposal(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_participant_id uuid;
  v_latest_round_id uuid;
  v_proposed_food_option_id text;
  v_proposed_by_participant_id uuid;
begin

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select r.session_id
  into v_session_id
  from public.round r
  where r.id = p_round_id;

  if v_session_id is null then
    raise exception 'Round not found';
  end if;

  select p.id
  into v_participant_id
  from public.participant p
  where p.session_id = v_session_id
    and p.user_id = v_user_id;

  if v_participant_id is null then
    raise exception 'You are not a participant in this session';
  end if;

  select r.id
  into v_latest_round_id
  from public.round r
  where r.session_id = v_session_id
  order by r.round_number desc
  limit 1;

  if v_latest_round_id is distinct from p_round_id then
    raise exception 'This round has already moved on';
  end if;

  select r.proposed_food_option_id, r.proposed_by_participant_id
  into v_proposed_food_option_id, v_proposed_by_participant_id
  from public.round r
  where r.id = p_round_id;

  if v_proposed_food_option_id is null then
    raise exception 'There is no proposal to accept';
  end if;

  if v_proposed_by_participant_id = v_participant_id then
    raise exception 'You cannot accept your own proposal';
  end if;

  update public.round
  set
    final_food_option_id = v_proposed_food_option_id,
    final_selected_at = now(),
    proposed_food_option_id = null,
    proposed_by_participant_id = null,
    proposed_at = null
  where id = p_round_id
    and final_food_option_id is null;

  if not found then
    raise exception 'A final FoodMood has already been selected';
  end if;

end;
$function$;

-- Step E: rejecting clears the proposal and opens the next round in one call, so
-- the rejecting browser and its partner both advance without a refresh.
create or replace function public.reject_foodmood_proposal(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_participant_id uuid;
  v_latest_round_id uuid;
  v_latest_round_number smallint;
  v_proposed_food_option_id text;
  v_proposed_by_participant_id uuid;
begin

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select r.session_id
  into v_session_id
  from public.round r
  where r.id = p_round_id;

  if v_session_id is null then
    raise exception 'Round not found';
  end if;

  select p.id
  into v_participant_id
  from public.participant p
  where p.session_id = v_session_id
    and p.user_id = v_user_id;

  if v_participant_id is null then
    raise exception 'You are not a participant in this session';
  end if;

  -- Serialize against a concurrent reject so only one new round is created.
  perform 1
  from public.session
  where id = v_session_id
  for update;

  select r.id, r.round_number
  into v_latest_round_id, v_latest_round_number
  from public.round r
  where r.session_id = v_session_id
  order by r.round_number desc
  limit 1;

  -- Re-checked under the lock: a stale reject from a finished round must not
  -- create a round or clear a proposal that belongs to the current one.
  if v_latest_round_id is distinct from p_round_id then
    raise exception 'This round has already moved on';
  end if;

  select r.proposed_food_option_id, r.proposed_by_participant_id
  into v_proposed_food_option_id, v_proposed_by_participant_id
  from public.round r
  where r.id = p_round_id;

  if v_proposed_food_option_id is null then
    raise exception 'There is no proposal to reject';
  end if;

  if v_proposed_by_participant_id = v_participant_id then
    raise exception 'You cannot reject your own proposal';
  end if;

  update public.round
  set
    proposed_food_option_id = null,
    proposed_by_participant_id = null,
    proposed_at = null
  where id = p_round_id;

  insert into public.round (
    session_id,
    round_number
  )
  values (
    v_session_id,
    v_latest_round_number + 1
  );

end;
$function$;

-- Enforce the two-person rule server-side: the only way to finalize is now an
-- accepted proposal.
revoke execute on function public.select_final_foodmood(uuid, text) from authenticated;

grant execute on function public.get_foodmood_session_state(uuid) to authenticated;
grant execute on function public.propose_final_foodmood(uuid, text) to authenticated;
grant execute on function public.accept_foodmood_proposal(uuid) to authenticated;
grant execute on function public.reject_foodmood_proposal(uuid) to authenticated;