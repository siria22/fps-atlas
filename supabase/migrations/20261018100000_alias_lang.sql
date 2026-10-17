-- 게임·맵 별칭에 언어를 남긴다(ISO 639-1 두 글자, 예: ko, en, ja).
-- 로컬 data/names.json이 언어별로 별칭을 묶는데, DB에 언어가 없으면 뽑았다 넣을 때 사라진다.
-- 고유 기준은 그대로 (게임|맵, 별칭): 같은 글자를 언어만 바꿔 두 번 넣지 않는다.
-- 검색은 언어와 관계없이 모든 별칭에서 찾으므로 서비스 화면은 바뀌지 않는다.
-- 두 표 모두 비어 있어(2026-10-18) 기본값 없이 필수로 둔다.
alter table public.game_aliases add column lang text not null check (lang ~ '^[a-z]{2}$');
alter table public.map_aliases add column lang text not null check (lang ~ '^[a-z]{2}$');
