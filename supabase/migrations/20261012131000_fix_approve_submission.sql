-- approve_submission 수정: 장소 확정 함수를 WHERE 절 안에서 부르면 행마다 다시 실행되고,
-- 같은 문장에서는 방금 넣은 장소가 보이지 않아 연결 생성이 실패했다. 변수에 먼저 받아 둔다.

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

  select '제보자 직접 촬영 · ' || display_name into v_credit from public.profiles where id = s.user_id;
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
