-- 6단계 관리: 제보 승인(04), 수정 제안 반영(04-c), 관리자 직접 등록(10)
-- 여러 공개 테이블을 함께 바꾸므로 함수 하나 = 트랜잭션 하나로 처리한다.
-- security invoker: 호출한 관리자의 RLS 권한으로 실행된다. 함수 안에서도 관리자인지 다시 확인한다.
-- 반려는 관리자 update 정책으로 submissions / edit_suggestions를 직접 고친다(별도 함수 없음).

create function public.assert_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.' using errcode = '42501';
  end if;
end;
$$;

-- 맵 확정: 등록된 맵이면 시대·위키를 갱신하고, 새 맵이면 게임(이름으로 찾거나 새로)과 맵을 만든다.
create function public.admin_resolve_map(
  p_map_id text, p_game_id text, p_game_name text, p_map_name text, p_era public.era, p_wiki_url text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_game_id text := p_game_id;
  v_map_id text;
begin
  perform public.assert_admin();
  if p_map_id is not null then
    update public.maps
      set era = p_era, wiki_url = coalesce(wiki_url, nullif(btrim(p_wiki_url), ''))
      where id = p_map_id
      returning id into v_map_id;
    if v_map_id is null then raise exception '맵을 찾을 수 없습니다: %', p_map_id; end if;
    return v_map_id;
  end if;

  if nullif(btrim(p_map_name), '') is null then raise exception '맵 이름이 필요합니다.'; end if;
  if v_game_id is null then
    if nullif(btrim(p_game_name), '') is null then raise exception '게임 이름이 필요합니다.'; end if;
    select id into v_game_id from public.games where lower(name) = lower(btrim(p_game_name));
    if v_game_id is null then
      insert into public.games (name) values (btrim(p_game_name)) returning id into v_game_id;
    end if;
  end if;

  -- 같은 게임에 같은 이름의 맵이 이미 있으면 그 맵을 쓴다(unique (game_id, name))
  insert into public.maps (game_id, name, era, wiki_url, verified)
    values (v_game_id, btrim(p_map_name), p_era, nullif(btrim(p_wiki_url), ''), true)
    on conflict (game_id, name) do update
      set era = excluded.era, wiki_url = coalesce(public.maps.wiki_url, excluded.wiki_url)
    returning id into v_map_id;
  return v_map_id;
end;
$$;

-- 장소 확정: 기존 장소면 그대로, 아니면 새 장소를 만든다(위치 범위는 주·도 코드 유무로 정한다).
create function public.admin_resolve_place(
  p_place_id text, p_name text,
  p_country text, p_country_code text, p_region text, p_admin1_code text,
  p_lat double precision, p_lng double precision
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_place_id text;
begin
  perform public.assert_admin();
  if p_place_id is not null then
    select id into v_place_id from public.places where id = p_place_id;
    if v_place_id is null then raise exception '장소를 찾을 수 없습니다: %', p_place_id; end if;
    return v_place_id;
  end if;

  if nullif(btrim(p_name), '') is null then raise exception '새 장소 이름이 필요합니다.'; end if;
  if p_country_code is null or nullif(btrim(p_country), '') is null then raise exception '국가가 필요합니다.'; end if;
  if (p_admin1_code is null) <> (nullif(btrim(p_region), '') is null) then raise exception '주·도 코드와 이름을 함께 정해야 합니다.'; end if;
  if p_lat is null or p_lng is null then raise exception '공개 좌표가 필요합니다.'; end if;

  insert into public.places (name, country, country_code, region, admin1_code, lat, lng, location_precision, verified)
    values (btrim(p_name), btrim(p_country), p_country_code, nullif(btrim(p_region), ''), p_admin1_code, p_lat, p_lng,
            case when p_admin1_code is null then '국가'::public.location_precision else '주·도'::public.location_precision end,
            true)
    returning id into v_place_id;
  return v_place_id;
end;
$$;

-- 맵↔장소 연결: 이미 있으면 근거 수준을 확정값으로 바꾸고 근거 출처만 더한다. 비어 있는 설명·스크린샷은 채운다.
create function public.admin_link_map_place(
  p_map_id text, p_place_id text, p_evidence public.evidence_level, p_source_url text, p_note text,
  p_screenshot_path text, p_screenshot_thumb_path text, p_screenshot_credit text, p_submission_id bigint
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_link_id text;
begin
  perform public.assert_admin();
  if (p_screenshot_path is null) <> (p_screenshot_thumb_path is null) then raise exception '스크린샷과 썸네일 경로를 함께 넘겨야 합니다.'; end if;

  insert into public.map_places (map_id, place_id, evidence_level, note, screenshot_path, screenshot_thumb_path, screenshot_credit, verified)
    values (p_map_id, p_place_id, p_evidence, nullif(btrim(p_note), ''), p_screenshot_path, p_screenshot_thumb_path,
            case when p_screenshot_path is null then null else p_screenshot_credit end, true)
    on conflict (map_id, place_id) do update set
      evidence_level = excluded.evidence_level,
      note = coalesce(public.map_places.note, excluded.note),
      screenshot_credit = case when public.map_places.screenshot_path is null then excluded.screenshot_credit else public.map_places.screenshot_credit end,
      screenshot_thumb_path = coalesce(public.map_places.screenshot_thumb_path, excluded.screenshot_thumb_path),
      screenshot_path = coalesce(public.map_places.screenshot_path, excluded.screenshot_path)
    returning id into v_link_id;

  if nullif(btrim(p_source_url), '') is not null then
    insert into public.map_place_sources (map_place_id, url, submission_id)
      values (v_link_id, btrim(p_source_url), p_submission_id)
      on conflict (map_place_id, url) do nothing;
  end if;
  return v_link_id;
end;
$$;

-- 장소 사진: 비어 있을 때만 채운다(업로드 또는 Commons 중 하나).
create function public.admin_set_place_photo(
  p_place_id text, p_photo_path text, p_photo_thumb_path text, p_photo_credit text,
  p_commons_file text, p_commons_author text, p_commons_license text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_photo_path is not null and p_commons_file is not null then raise exception '장소 사진은 업로드와 Commons 중 하나만 지정합니다.'; end if;
  if p_photo_path is null and p_commons_file is null then return; end if;
  update public.places set
      photo_path = p_photo_path, photo_thumb_path = p_photo_thumb_path,
      photo_credit = case when p_photo_path is null then null else p_photo_credit end,
      commons_file = p_commons_file, commons_author = p_commons_author, commons_license = p_commons_license
    where id = p_place_id and photo_path is null and commons_file is null;
end;
$$;

-- 04 승인. 이미지는 호출 전에 관리자가 public-images로 복사하고 그 경로를 넘긴다.
create function public.approve_submission(
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
  v_place public.places;
  v_link_id text;
begin
  perform public.assert_admin();
  select * into s from public.submissions where id = p_submission_id for update;
  if s.id is null then raise exception '제보를 찾을 수 없습니다.'; end if;
  if s.status <> '검토 대기' then raise exception '이미 처리된 제보입니다(%).', s.status; end if;

  select '제보자 직접 촬영 · ' || display_name into v_credit from public.profiles where id = s.user_id;
  v_map_id := public.admin_resolve_map(p_map_id, s.game_id, s.game_name, s.map_name, p_era, s.wiki_url);
  select * into v_place from public.places
    where id = public.admin_resolve_place(p_place_id, p_place_name, p_country, p_country_code, p_region, p_admin1_code, p_lat, p_lng);
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

-- 04-c 반영: 제안에서 고른 항목만 바꾼다. "기타"는 자동으로 바꿀 값이 없어 상태만 승인된다.
create function public.apply_edit_suggestion(
  p_suggestion_id bigint,
  p_country text default null, p_country_code text default null, p_region text default null, p_admin1_code text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_evidence public.evidence_level default null,
  p_source_url text default null,
  p_wiki_url text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  e public.edit_suggestions;
  v_link public.map_places;
begin
  perform public.assert_admin();
  select * into e from public.edit_suggestions where id = p_suggestion_id for update;
  if e.id is null then raise exception '수정 제안을 찾을 수 없습니다.'; end if;
  if e.status <> '검토 대기' then raise exception '이미 처리된 수정 제안입니다(%).', e.status; end if;
  select * into v_link from public.map_places where id = e.map_place_id;

  if '위치' = any (e.fields) then
    if p_country_code is null or nullif(btrim(p_country), '') is null or p_lat is null or p_lng is null then
      raise exception '반영할 위치(국가·공개 좌표)가 필요합니다.';
    end if;
    if (p_admin1_code is null) <> (nullif(btrim(p_region), '') is null) then raise exception '주·도 코드와 이름을 함께 정해야 합니다.'; end if;
    update public.places set
        country = btrim(p_country), country_code = p_country_code,
        region = nullif(btrim(p_region), ''), admin1_code = p_admin1_code,
        lat = p_lat, lng = p_lng,
        location_precision = case when p_admin1_code is null then '국가'::public.location_precision else '주·도'::public.location_precision end
      where id = v_link.place_id;
  end if;
  if '근거 수준' = any (e.fields) then
    if p_evidence is null then raise exception '반영할 근거 수준이 필요합니다.'; end if;
    update public.map_places set evidence_level = p_evidence where id = v_link.id;
  end if;
  if '근거 출처' = any (e.fields) then
    if nullif(btrim(p_source_url), '') is null then raise exception '추가할 근거 출처 URL이 필요합니다.'; end if;
    insert into public.map_place_sources (map_place_id, url) values (v_link.id, btrim(p_source_url))
      on conflict (map_place_id, url) do nothing;
  end if;
  if '팬덤 위키' = any (e.fields) then
    if nullif(btrim(p_wiki_url), '') is null then raise exception '반영할 팬덤 위키 URL이 필요합니다.'; end if;
    update public.maps set wiki_url = btrim(p_wiki_url) where id = v_link.map_id;
  end if;

  update public.edit_suggestions set status = '승인', reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = e.id;
end;
$$;

-- 10 관리자 직접 등록. 이미지는 호출 전에 public-images에 올리고 경로를 넘긴다.
create function public.admin_register(
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
  select '직접 촬영 · ' || display_name into v_credit from public.profiles where id = (select auth.uid());
  v_map_id := public.admin_resolve_map(p_map_id, p_game_id, p_game_name, p_map_name, p_era, p_wiki_url);
  v_place_id := public.admin_resolve_place(p_place_id, p_place_name, p_country, p_country_code, p_region, p_admin1_code, p_lat, p_lng);
  v_link_id := public.admin_link_map_place(v_map_id, v_place_id, p_evidence, p_source_url, p_note,
    p_screenshot_path, p_screenshot_thumb_path, v_credit, null);
  perform public.admin_set_place_photo(v_place_id, p_place_photo_path, p_place_photo_thumb_path, v_credit,
    nullif(btrim(p_commons_file), ''), nullif(btrim(p_commons_author), ''), nullif(btrim(p_commons_license), ''));
  return v_link_id;
end;
$$;

-- 실행 권한: 로그인 사용자만(관리자 확인은 함수 안에서). 익명은 호출 불가.
do $$
declare
  f text;
begin
  foreach f in array array[
    'assert_admin()',
    'admin_resolve_map(text, text, text, text, public.era, text)',
    'admin_resolve_place(text, text, text, text, text, text, double precision, double precision)',
    'admin_link_map_place(text, text, public.evidence_level, text, text, text, text, text, bigint)',
    'admin_set_place_photo(text, text, text, text, text, text, text)',
    'approve_submission(bigint, text, text, text, text, text, text, text, double precision, double precision, public.evidence_level, public.era, text, text, text, text)',
    'apply_edit_suggestion(bigint, text, text, text, text, double precision, double precision, public.evidence_level, text, text)',
    'admin_register(text, text, text, text, public.era, text, text, text, text, text, text, text, double precision, double precision, public.evidence_level, text, text, text, text, text, text, text, text, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
