-- 제보 폼 v2: 사용자 추정값은 넓은 위치 이름으로 받고 좌표는 관리자 검토에서 확정한다.

-- 근거 수준 선택지는 전체 공개 데이터에서 동일한 의미로 사용한다.
alter type public.evidence_level rename value '공식 확인' to '공식';
alter type public.evidence_level rename value '유력' to '추정';
alter type public.evidence_level rename value '커뮤니티 추정' to '기타';

-- 위치 정밀도는 제보자가 선택하는 도시·지역 또는 국가만 남긴다.
create type public.location_precision_v2 as enum ('도시·지역', '국가');

alter table public.places alter column location_precision drop default;
alter table public.places
  alter column location_precision type public.location_precision_v2
  using case when location_precision::text = '국가' then '국가'::public.location_precision_v2 else '도시·지역'::public.location_precision_v2 end;
alter table public.places alter column location_precision set default '도시·지역';

alter table public.submissions
  alter column location_precision type public.location_precision_v2
  using case when location_precision::text = '국가' then '국가'::public.location_precision_v2 else '도시·지역'::public.location_precision_v2 end;
alter table public.submissions
  alter column confirmed_location_precision type public.location_precision_v2
  using case when confirmed_location_precision is null then null
    when confirmed_location_precision::text = '국가' then '국가'::public.location_precision_v2
    else '도시·지역'::public.location_precision_v2 end;

alter type public.location_precision rename to location_precision_v1;
alter type public.location_precision_v2 rename to location_precision;
drop type public.location_precision_v1;

-- 사용자는 관계 유형과 지도 좌표를 정하지 않는다. 관리자가 관계와 좌표를 확정한다.
alter table public.submissions drop column relation_type;
alter table public.submissions alter column city_region drop not null;
alter table public.submissions alter column source_url drop not null;
alter table public.submissions alter column description drop not null;
alter table public.submissions alter column lat drop not null;
alter table public.submissions alter column lng drop not null;
alter table public.submissions alter column screenshot_path drop not null;
alter table public.submissions alter column screenshot_thumb_path drop not null;

alter table public.submissions rename column self_shot_confirmed to image_rights_confirmed;
alter table public.submissions drop constraint if exists submissions_self_shot_confirmed_check;
alter table public.submissions alter column image_rights_confirmed drop not null;

alter table public.submissions add column confirmed_lat double precision check (confirmed_lat between -90 and 90);
alter table public.submissions add column confirmed_lng double precision check (confirmed_lng between -180 and 180);

alter table public.submissions
  add constraint submissions_source_required_for_evidence
    check (evidence_level = '기타' or source_url is not null),
  add constraint submissions_screenshot_pair
    check ((screenshot_path is null) = (screenshot_thumb_path is null)),
  add constraint submissions_confirmed_coordinates_pair
    check ((confirmed_lat is null) = (confirmed_lng is null)),
  add constraint submissions_image_rights_required
    check ((screenshot_path is null and place_photo_path is null) or image_rights_confirmed is true);

drop policy "본인 이름으로만 제보, 이미지는 본인 폴더" on public.submissions;
create policy "본인 제보, 이미지는 본인 폴더" on public.submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = '검토 대기'
    and (screenshot_path is null or split_part(screenshot_path, '/', 1) = (select auth.uid())::text)
    and (screenshot_thumb_path is null or split_part(screenshot_thumb_path, '/', 1) = (select auth.uid())::text)
    and (place_photo_path is null or split_part(place_photo_path, '/', 1) = (select auth.uid())::text)
    and (place_photo_thumb_path is null or split_part(place_photo_thumb_path, '/', 1) = (select auth.uid())::text)
    and ((screenshot_path is null and place_photo_path is null) or image_rights_confirmed is true)
  );
