-- Rollback for 20261004200000_add_partner_display_name.
--
-- Restores get_foodmood_session_state to its previous 12-column signature,
-- dropping partner_display_name. Same DROP + CREATE + re-GRANT dance is
-- required because a RETURNS TABLE signature cannot be altered in place.
--
-- The frontend tolerates a missing partner_display_name: normalizeState falls
-- back to an empty partner name and the UI shows "Your partner".

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
  final_selected_at timestamp with time zone
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
    r.final_selected_at

  from public.session s
  join public.round r
    on r.id = v_round_id
  where s.id = p_session_id;

end;
$function$;

grant execute on function public.get_foodmood_session_state(uuid) to authenticated;
