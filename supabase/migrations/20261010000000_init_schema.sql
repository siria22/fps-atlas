-- 전장 아틀라스 초기 스키마
-- 공개 테이블(games, maps, places, map_places, map_place_sources, events, place_events)에는
-- 승인된 데이터만 들어간다. 제보는 submissions에 따로 두고 본인·관리자만 조회한다.

-- ───────────── 열거형 ─────────────
create type public.evidence_level as enum ('공식 확인', '유력', '커뮤니티 추정');
create type public.relation_type as enum ('직접 재현', '영감', '합성', '문화 참조');
create type public.location_precision as enum ('정확 좌표', '구역', '도시', '국가');
create type public.era as enum ('WWI', 'WWII', '냉전', '현대', '근미래', '기타');
create type public.submission_status as enum ('검토 대기', '승인', '반려');
create type public.user_role as enum ('user', 'admin');

-- ───────────── 사용자 ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

-- Google 로그인으로 처음 가입할 때 프로필 생성. 관리자 지정은 SQL로 role='admin'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      '사용자'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS 정책에서 쓰는 관리자 판정. security definer로 profiles RLS 재귀를 피한다.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ───────────── 공개 데이터 ─────────────
create table public.games (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  series text,
  release_year smallint,
  created_at timestamptz not null default now()
);

create table public.maps (
  id text primary key default gen_random_uuid()::text,
  game_id text not null references public.games (id) on delete restrict,
  name text not null,
  era public.era not null default '기타',
  wiki_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, name)
);
create index maps_game_id_idx on public.maps (game_id);

create table public.events (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  era public.era not null default '기타',
  wikipedia_title_ko text,
  wikipedia_title_en text,
  created_at timestamptz not null default now()
);

create table public.places (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  region text,
  country text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  location_precision public.location_precision not null default '도시',
  -- 역사 요약 대체 문서(Event 문서가 없을 때)
  wikipedia_title_ko text,
  wikipedia_title_en text,
  -- 지역 사진: 업로드(public-images 버킷 경로) 또는 Commons 중 하나. 없으면 패널에서 숨김.
  photo_path text,
  photo_thumb_path text,
  photo_credit text,
  commons_file text,
  commons_author text,
  commons_license text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint places_photo_one_source check (photo_path is null or commons_file is null)
);

create table public.place_events (
  place_id text not null references public.places (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  primary key (place_id, event_id)
);
create index place_events_event_id_idx on public.place_events (event_id);

-- 근거 수준·관계 유형은 맵↔장소 연결 단위의 값
create table public.map_places (
  id text primary key default gen_random_uuid()::text,
  map_id text not null references public.maps (id) on delete cascade,
  place_id text not null references public.places (id) on delete cascade,
  evidence_level public.evidence_level not null,
  relation_type public.relation_type not null,
  note text,
  -- 인게임 스크린샷(public-images 버킷 경로). 시드·관리자 등록에서는 없을 수 있다.
  screenshot_path text,
  screenshot_thumb_path text,
  screenshot_credit text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (map_id, place_id)
);
create index map_places_place_id_idx on public.map_places (place_id);

-- ───────────── 제보 ─────────────
create table public.submissions (
  id bigint generated always as identity primary key,
  code text generated always as ('AT-' || lpad(id::text, 3, '0')) stored,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status public.submission_status not null default '검토 대기',

  -- 제보자 입력
  game_id text references public.games (id) on delete set null,
  game_name text not null,
  map_id text references public.maps (id) on delete set null,
  map_name text not null,
  evidence_level public.evidence_level not null,
  relation_type public.relation_type not null,
  source_url text not null,
  wiki_url text,
  description text not null,
  city_region text not null,
  country text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  location_precision public.location_precision not null,
  -- 첨부 이미지(submission-images 비공개 버킷, '{user_id}/...' 경로)
  screenshot_path text not null,
  screenshot_thumb_path text not null,
  place_photo_path text,
  place_photo_thumb_path text,
  self_shot_confirmed boolean not null check (self_shot_confirmed),

  -- 관리자 확정
  confirmed_city_region text,
  confirmed_location_precision public.location_precision,
  confirmed_relation_type public.relation_type,
  confirmed_evidence_level public.evidence_level,
  confirmed_era public.era,
  reject_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  -- 승인 결과로 만들어지거나 근거가 추가된 연결
  map_place_id text references public.map_places (id) on delete set null,

  created_at timestamptz not null default now(),
  constraint submissions_reject_reason check (status <> '반려' or reject_reason is not null),
  constraint submissions_place_photo_pair check ((place_photo_path is null) = (place_photo_thumb_path is null))
);
create index submissions_user_id_idx on public.submissions (user_id);
create index submissions_status_idx on public.submissions (status);

-- 한 연결에 근거 출처 여러 개. 승인 시 같은 맵+장소면 여기에 행이 추가된다.
create table public.map_place_sources (
  id bigint generated always as identity primary key,
  map_place_id text not null references public.map_places (id) on delete cascade,
  url text not null,
  submission_id bigint references public.submissions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (map_place_id, url)
);

-- ───────────── 권한 ─────────────
-- 테이블 노출을 명시적으로 관리한다(기본 권한에 기대지 않음).
revoke all on all tables in schema public from anon, authenticated;

grant select on public.games, public.maps, public.events, public.places,
  public.place_events, public.map_places, public.map_place_sources
  to anon, authenticated;
grant insert, update, delete on public.games, public.maps, public.events, public.places,
  public.place_events, public.map_places, public.map_place_sources
  to authenticated;

grant select on public.profiles to authenticated;

grant select on public.submissions to authenticated;
-- 사용자는 제보자 입력 열만 쓸 수 있다. 상태·관리자 확정 열은 관리자 update로만 바뀐다.
grant insert (
  game_id, game_name, map_id, map_name, evidence_level, relation_type,
  source_url, wiki_url, description, city_region, country, lat, lng, location_precision,
  screenshot_path, screenshot_thumb_path, place_photo_path, place_photo_thumb_path,
  self_shot_confirmed
) on public.submissions to authenticated;
grant update on public.submissions to authenticated;

-- ───────────── RLS ─────────────
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.maps enable row level security;
alter table public.events enable row level security;
alter table public.places enable row level security;
alter table public.place_events enable row level security;
alter table public.map_places enable row level security;
alter table public.map_place_sources enable row level security;
alter table public.submissions enable row level security;

create policy "본인 또는 관리자만 프로필 조회" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- 공개 데이터: 누구나 읽고, 관리자만 쓴다.
do $$
declare
  t text;
begin
  foreach t in array array['games', 'maps', 'events', 'places', 'place_events', 'map_places', 'map_place_sources']
  loop
    execute format('create policy "누구나 조회" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "관리자만 추가" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "관리자만 수정" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "관리자만 삭제" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- 제보: 공개 조회 없음. 본인 것과 관리자만.
create policy "본인 또는 관리자만 제보 조회" on public.submissions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "본인 이름으로만 제보, 이미지는 본인 폴더" on public.submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = '검토 대기'
    and split_part(screenshot_path, '/', 1) = (select auth.uid())::text
    and split_part(screenshot_thumb_path, '/', 1) = (select auth.uid())::text
    and (place_photo_path is null or split_part(place_photo_path, '/', 1) = (select auth.uid())::text)
    and (place_photo_thumb_path is null or split_part(place_photo_thumb_path, '/', 1) = (select auth.uid())::text)
  );

create policy "관리자만 제보 검토" on public.submissions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ───────────── Storage ─────────────
-- submission-images: 제보 첨부, 비공개. 승인 시 관리자가 public-images로 복사한다.
-- public-images: 승인된 이미지만, 공개 읽기. 쓰기는 관리자만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('submission-images', 'submission-images', false, 5242880, array['image/webp']),
  ('public-images', 'public-images', true, 5242880, array['image/webp']);

create policy "제보 이미지: 본인 폴더에 업로드" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submission-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "제보 이미지: 본인 또는 관리자 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submission-images'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "제보 이미지: 본인 또는 관리자 삭제" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submission-images'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "공개 이미지: 관리자만 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'public-images' and (select public.is_admin()));

create policy "공개 이미지: 관리자만 수정" on storage.objects
  for update to authenticated
  using (bucket_id = 'public-images' and (select public.is_admin()))
  with check (bucket_id = 'public-images' and (select public.is_admin()));

create policy "공개 이미지: 관리자만 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'public-images' and (select public.is_admin()));
