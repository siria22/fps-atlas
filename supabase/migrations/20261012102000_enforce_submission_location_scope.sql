-- 도시·지역 제보에는 지역 이름을, 국가 범위 제보에는 국가만 받는다.
alter table public.submissions
  add constraint submissions_location_scope
  check (
    (location_precision = '도시·지역' and nullif(btrim(city_region), '') is not null)
    or (location_precision = '국가' and city_region is null)
  );
