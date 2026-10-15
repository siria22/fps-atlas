-- 위치 모델: 도시·지역 / 국가 → 주·도 / 국가 (2026-10-12 결정)
-- 주·도는 Natural Earth admin-1 경계. 코드는 국가 adm0_a3(예: FRA), 주·도 adm1_code(예: FRA-5322)를 그대로 쓴다.

alter type public.location_precision rename value '도시·지역' to '주·도';
alter table public.places alter column location_precision set default '주·도';

-- 공개 장소: 국가·주·도 코드 (region 열은 주·도 표시 이름으로 쓴다)
alter table public.places
  add column country_code text check (country_code ~ '^[A-Z]{3}$'),
  add column admin1_code text check (admin1_code ~ '^[A-Z]{3}-[0-9]+$');

-- 샘플 시드 4곳 채우기 (Natural Earth 10m admin-1 기준)
update public.places set country_code = 'FRA', admin1_code = 'FRA-5322', region = '망슈' where id = 'carentan';
update public.places set country_code = 'FRA', admin1_code = 'FRA-5275', region = '칼바도스' where id = 'omaha-beach';
update public.places set country_code = 'RUS', admin1_code = 'RUS-2369', region = '볼고그라드' where id = 'volgograd';
update public.places set country_code = 'KOR', admin1_code = 'KOR-2495', region = '인천광역시' where id = 'songdo';

-- 제보: 도시·지역 이름 열을 주·도 이름 열로 바꾸고 코드를 더한다
alter table public.submissions rename column city_region to region;
alter table public.submissions rename column confirmed_city_region to confirmed_region;
alter table public.submissions
  add column country_code text check (country_code ~ '^[A-Z]{3}$'),
  add column admin1_code text check (admin1_code ~ '^[A-Z]{3}-[0-9]+$'),
  add column confirmed_country_code text check (confirmed_country_code ~ '^[A-Z]{3}$'),
  add column confirmed_admin1_code text check (confirmed_admin1_code ~ '^[A-Z]{3}-[0-9]+$');

-- 범위 제약: 주·도면 코드·이름 필수, 국가면 둘 다 비움. 국가 코드는 항상 필수.
-- (현재 submissions 행 0개라 기존 행 검사 문제 없음)
alter table public.submissions drop constraint submissions_location_scope;
alter table public.submissions
  alter column country_code set not null,
  add constraint submissions_location_scope check (
    (location_precision = '주·도' and admin1_code is not null and nullif(btrim(region), '') is not null)
    or (location_precision = '국가' and admin1_code is null and region is null)
  );

-- 제보자는 새 코드 열도 직접 쓸 수 있다(관리자 확정 열은 여전히 불가)
grant insert (country_code, admin1_code) on public.submissions to authenticated;
