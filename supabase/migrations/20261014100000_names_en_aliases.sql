-- 다국어: 장소 영어 이름 + 맵·게임 검색 별칭 (2026-10-14)
-- 게임·맵의 대표 이름은 영문 공식명(name) 하나만 쓰고, 다른 언어 이름·약칭·오타는 검색 별칭으로만 둔다.

-- 장소는 지금 한국어 이름(name)이라 영어 화면용 이름을 따로 둔다. 비어 있으면 name을 보여 준다.
alter table public.places add column name_en text;

create table public.map_aliases (
  map_id text not null references public.maps (id) on delete cascade,
  alias text not null check (length(btrim(alias)) > 0),
  created_at timestamptz not null default now(),
  primary key (map_id, alias)
);

create table public.game_aliases (
  game_id text not null references public.games (id) on delete cascade,
  alias text not null check (length(btrim(alias)) > 0),
  created_at timestamptz not null default now(),
  primary key (game_id, alias)
);

alter table public.map_aliases enable row level security;
alter table public.game_aliases enable row level security;

do $$
declare t text;
begin
  foreach t in array array['map_aliases', 'game_aliases'] loop
    execute format('create policy "누구나 조회" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "관리자만 추가" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "관리자만 수정" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "관리자만 삭제" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;
