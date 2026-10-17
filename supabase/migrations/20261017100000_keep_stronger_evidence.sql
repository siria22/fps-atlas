-- 맵↔장소 연결이 이미 있을 때 근거 수준을 덮어쓰지 않고 더 높은 쪽을 남긴다.
-- 이전에는 승인·직접 등록에서 고른 값으로 바꿔, '공식' 연결에 '커뮤니티 추정' 제보를 승인하면 조용히 내려갔다.
-- 근거 수준을 낮추려면 수정 제안 검토(apply_edit_suggestion)에서 한다.
-- evidence_level 순서는 '공식' < '커뮤니티 추정' < '기타'(선언 순서)라 least()가 더 높은 근거다.
create or replace function public.admin_link_map_place(
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
      evidence_level = least(public.map_places.evidence_level, excluded.evidence_level),
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
