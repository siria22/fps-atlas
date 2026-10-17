-- 공개 표기를 닉네임으로 (2026-10-18)
--   승인된 제보 이미지의 출처("제보자 직접 촬영 · 이름")에 Google 실명(display_name)이 그대로 나가던 것을 닉네임으로 바꾼다.
--   닉네임은 자동으로 만든다("제보자-" + 6자). 사용자가 직접 바꾸는 화면은 아직 없다(시안 확정 후).
--   새 가입자는 열 기본값으로 채워지므로 가입 트리거(handle_new_user)는 고치지 않는다.

alter table public.profiles add column nickname text;
update public.profiles set nickname = '제보자-' || substr(md5(gen_random_uuid()::text), 1, 6) where nickname is null;
alter table public.profiles
  alter column nickname set default ('제보자-' || substr(md5(gen_random_uuid()::text), 1, 6)),
  alter column nickname set not null,
  add constraint profiles_nickname_check check (char_length(btrim(nickname)) between 1 and 30);

-- 관리 화면 승인: 출처 이름을 닉네임으로 (나머지는 20261012131000과 같다)
create or replace function public.approve_submission(
  p_submission_id bigint,
  p_map_id text,
  p_place_id text,
  p_place_name text,
  p_country text, p_country_code text, p_region text, p_admin1_code text,
  p_lat double precision, p_lng double precision,
  p_evidence public.evidence_level,
  p_era public.era,
  p_screenshot_path text default null, p_screenshot_thumb_path text default null,
  p_place_photo_path text default null, p_place_photo_thumb_path text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  s public.submissions;
  v_credit text;
  v_map_id text;
  v_place_id text;
  v_place public.places;
  v_link_id text;
begin
  perform public.assert_admin();
  select * into s from public.submissions where id = p_submission_id for update;
  if s.id is null then raise exception '제보를 찾을 수 없습니다.'; end if;
  if s.status <> '검토 대기' then raise exception '이미 처리된 제보입니다(%).', s.status; end if;

  select '제보자 직접 촬영 · ' || nickname into v_credit from public.profiles where id = s.user_id;
  v_map_id := public.admin_resolve_map(p_map_id, s.game_id, s.game_name, s.map_name, p_era, s.wiki_url);
  v_place_id := public.admin_resolve_place(p_place_id, p_place_name, p_country, p_country_code, p_region, p_admin1_code, p_lat, p_lng);
  select * into v_place from public.places where id = v_place_id;
  v_link_id := public.admin_link_map_place(v_map_id, v_place.id, p_evidence, s.source_url, s.description,
    p_screenshot_path, p_screenshot_thumb_path, v_credit, s.id);
  if p_place_photo_path is not null then
    perform public.admin_set_place_photo(v_place.id, p_place_photo_path, p_place_photo_thumb_path, v_credit, null, null, null);
  end if;

  update public.submissions set
      status = '승인',
      confirmed_region = v_place.region,
      confirmed_country_code = v_place.country_code,
      confirmed_admin1_code = v_place.admin1_code,
      confirmed_location_precision = v_place.location_precision,
      confirmed_lat = v_place.lat,
      confirmed_lng = v_place.lng,
      confirmed_evidence_level = p_evidence,
      confirmed_era = p_era,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      map_place_id = v_link_id
    where id = s.id;
  return v_link_id;
end;
$$;

-- 관리자 직접 등록: 출처 이름을 닉네임으로 (나머지는 20261012130000과 같다)
create or replace function public.admin_register(
  p_game_id text, p_game_name text, p_map_id text, p_map_name text, p_era public.era, p_wiki_url text,
  p_place_id text, p_place_name text,
  p_country text, p_country_code text, p_region text, p_admin1_code text,
  p_lat double precision, p_lng double precision,
  p_evidence public.evidence_level, p_source_url text, p_note text,
  p_screenshot_path text default null, p_screenshot_thumb_path text default null,
  p_place_photo_path text default null, p_place_photo_thumb_path text default null,
  p_commons_file text default null, p_commons_author text default null, p_commons_license text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_credit text;
  v_map_id text;
  v_place_id text;
  v_link_id text;
begin
  perform public.assert_admin();
  if p_evidence <> '기타' and nullif(btrim(p_source_url), '') is null then raise exception '공식·추정 근거에는 URL이 필요합니다.'; end if;
  select '직접 촬영 · ' || nickname into v_credit from public.profiles where id = (select auth.uid());
  v_map_id := public.admin_resolve_map(p_map_id, p_game_id, p_game_name, p_map_name, p_era, p_wiki_url);
  v_place_id := public.admin_resolve_place(p_place_id, p_place_name, p_country, p_country_code, p_region, p_admin1_code, p_lat, p_lng);
  v_link_id := public.admin_link_map_place(v_map_id, v_place_id, p_evidence, p_source_url, p_note,
    p_screenshot_path, p_screenshot_thumb_path, v_credit, null);
  perform public.admin_set_place_photo(v_place_id, p_place_photo_path, p_place_photo_thumb_path, v_credit,
    nullif(btrim(p_commons_file), ''), nullif(btrim(p_commons_author), ''), nullif(btrim(p_commons_license), ''));
  return v_link_id;
end;
$$;

-- 탈퇴 익명화 대상: 출처 글자 비교 대신, 그 사용자의 승인된 제보에서 복사한 이미지(경로 submissions/<제보 번호>/)가
-- 지금도 그 자리의 공개 이미지인지로 찾는다. 닉네임을 나중에 바꿔도 깨지지 않는다.
-- (관리 화면 승인과 npm run atlas -- apply 모두 이 경로로 복사한다)
create or replace function public.user_credit_targets(p_user uuid)
returns table (kind text, target_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with approved as (
    select s.id, s.map_place_id
    from public.submissions s
    where s.user_id = p_user and s.status = '승인' and s.map_place_id is not null
  )
  select 'screenshot', mp.id
  from approved a
  join public.map_places mp on mp.id = a.map_place_id
  where mp.screenshot_path like 'submissions/' || a.id || '/%'
  union
  select 'place_photo', pl.id
  from approved a
  join public.map_places mp on mp.id = a.map_place_id
  join public.places pl on pl.id = mp.place_id
  where pl.photo_path like 'submissions/' || a.id || '/%';
$$;

-- 이미 공개된 출처 중 실명(display_name)으로 된 것을 닉네임으로 (2026-10-18 기준 0건)
update public.map_places mp set screenshot_credit = '제보자 직접 촬영 · ' || p.nickname
  from public.submissions s join public.profiles p on p.id = s.user_id
  where s.map_place_id = mp.id and mp.screenshot_credit = '제보자 직접 촬영 · ' || p.display_name;
update public.places pl set photo_credit = '제보자 직접 촬영 · ' || p.nickname
  from public.submissions s join public.profiles p on p.id = s.user_id join public.map_places mp on mp.id = s.map_place_id
  where mp.place_id = pl.id and pl.photo_credit = '제보자 직접 촬영 · ' || p.display_name;
update public.map_places mp set screenshot_credit = '직접 촬영 · ' || p.nickname
  from public.profiles p where mp.screenshot_credit = '직접 촬영 · ' || p.display_name;
update public.places pl set photo_credit = '직접 촬영 · ' || p.nickname
  from public.profiles p where pl.photo_credit = '직접 촬영 · ' || p.display_name;
