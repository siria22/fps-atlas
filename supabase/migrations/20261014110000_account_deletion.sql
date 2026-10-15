-- 연동 해제(탈퇴) (2026-10-14)
--   계정을 지우면 profiles → 제보·수정 제안이 기존 on delete cascade로 함께 지워진다(반영되지 않은 제보는 사라짐).
--   공개된 이미지 출처("제보자 직접 촬영 · 이름")는 본인이 고르면 "사용자"로 바꾼다.
--   실제 삭제는 Edge Function `delete-account`가 한다(인증 계정 삭제에는 service role이 필요).

-- 이 사용자의 승인된 제보로 공개된 이미지 중, 출처가 아직 이 사용자 이름인 것.
-- (나중에 다른 사람 사진으로 바뀐 자리는 출처 글자가 달라 제외된다)
create or replace function public.user_credit_targets(p_user uuid)
returns table (kind text, target_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select '제보자 직접 촬영 · ' || display_name as credit from public.profiles where id = p_user
  ),
  approved as (
    select s.map_place_id, s.place_photo_path
    from public.submissions s
    where s.user_id = p_user and s.status = '승인' and s.map_place_id is not null
  )
  select 'screenshot', mp.id
  from approved a
  join public.map_places mp on mp.id = a.map_place_id
  cross join me
  where mp.screenshot_path is not null and mp.screenshot_credit = me.credit
  union
  select 'place_photo', pl.id
  from approved a
  join public.map_places mp on mp.id = a.map_place_id
  join public.places pl on pl.id = mp.place_id
  cross join me
  where a.place_photo_path is not null and pl.photo_path is not null and pl.photo_credit = me.credit;
$$;

-- 탈퇴 확인 화면용: 지워질 제보 수, 이름이 걸린 공개 이미지 수, 관리자 여부(관리자는 탈퇴 불가)
create or replace function public.my_account_summary()
returns table (pending integer, rejected integer, suggestions integer, published_images integer, is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.submissions where user_id = (select auth.uid()) and status = '검토 대기'),
    (select count(*)::integer from public.submissions where user_id = (select auth.uid()) and status = '반려'),
    (select count(*)::integer from public.edit_suggestions where user_id = (select auth.uid()) and status = '검토 대기'),
    (select count(*)::integer from public.user_credit_targets((select auth.uid()))),
    coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false);
$$;

-- 출처 이름을 "사용자"로 바꾼다. 계정 삭제 직전에 Edge Function이 부른다(제보가 지워지기 전이어야 찾을 수 있음).
create or replace function public.anonymize_user_credits(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_count integer;
begin
  update public.map_places set screenshot_credit = '제보자 직접 촬영 · 사용자'
  where id in (select target_id from public.user_credit_targets(p_user) where kind = 'screenshot');
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  update public.places set photo_credit = '제보자 직접 촬영 · 사용자'
  where id in (select target_id from public.user_credit_targets(p_user) where kind = 'place_photo');
  get diagnostics v_count = row_count;
  return v_total + v_count;
end;
$$;

revoke execute on function public.user_credit_targets(uuid) from public, anon, authenticated;
revoke execute on function public.anonymize_user_credits(uuid) from public, anon, authenticated;
revoke execute on function public.my_account_summary() from public, anon;
grant execute on function public.user_credit_targets(uuid) to service_role;
grant execute on function public.anonymize_user_credits(uuid) to service_role;
grant execute on function public.my_account_summary() to authenticated;
