-- 수정 제안 (화면 03-b): 등록된 맵↔장소 연결에 대해 무엇을, 어떻게, 왜 고칠지 받는다.
-- 작성자 본인과 관리자만 조회한다. 관리자 검토는 04의 "수정 제안" 탭(6단계).

create type public.suggestion_field as enum ('위치', '근거 수준', '근거 출처', '팬덤 위키', '기타');

create table public.edit_suggestions (
  id bigint generated always as identity primary key,
  code text generated always as ('ED-' || lpad(id::text, 3, '0')) stored,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status public.submission_status not null default '검토 대기',

  -- 작성자 입력
  map_place_id text not null references public.map_places (id) on delete cascade,
  fields public.suggestion_field[] not null check (cardinality(fields) > 0),
  proposal text not null check (length(btrim(proposal)) between 1 and 2000),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  reference_url text check (reference_url ~ '^https?://'),
  -- "위치"를 고치는 경우 새 위치(주·도 / 국가)
  location_precision public.location_precision,
  country_code text check (country_code ~ '^[A-Z]{3}$'),
  country text,
  admin1_code text check (admin1_code ~ '^[A-Z]{3}-[0-9]+$'),
  region text,

  -- 관리자 처리
  reject_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  constraint edit_suggestions_reject_reason check (status <> '반려' or reject_reason is not null),
  -- 위치를 고친다면 새 위치가 있어야 하고, 아니면 비워 둔다
  constraint edit_suggestions_location check (
    case when '위치' = any (fields) then
      country_code is not null and nullif(btrim(country), '') is not null and (
        (location_precision = '주·도' and admin1_code is not null and nullif(btrim(region), '') is not null)
        or (location_precision = '국가' and admin1_code is null and region is null))
    else
      location_precision is null and country_code is null and country is null and admin1_code is null and region is null
    end
  )
);
create index edit_suggestions_user_id_idx on public.edit_suggestions (user_id);
create index edit_suggestions_status_idx on public.edit_suggestions (status);

grant select on public.edit_suggestions to authenticated;
-- 작성자는 입력 열만 쓸 수 있다. 상태·처리 열은 관리자 update로만 바뀐다.
grant insert (
  map_place_id, fields, proposal, reason, reference_url,
  location_precision, country_code, country, admin1_code, region
) on public.edit_suggestions to authenticated;
grant update on public.edit_suggestions to authenticated;

alter table public.edit_suggestions enable row level security;

create policy "본인 또는 관리자만 수정 제안 조회" on public.edit_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "본인 이름으로만 수정 제안" on public.edit_suggestions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = '검토 대기');

create policy "관리자만 수정 제안 처리" on public.edit_suggestions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
