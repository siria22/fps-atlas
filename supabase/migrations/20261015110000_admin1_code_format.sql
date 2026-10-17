-- 주·도 코드 형식 완화. Natural Earth adm1_code에는 '<국가>-<번호>' 말고도
-- 작은 영토·분쟁 지역에 '<국가>+00?' · '<국가>+99?' 형식이 있다(예: VAT+00? 바티칸, MCO+00? 모나코, MAC+00? 마카오, GUM+00? 괌).
-- public/geo/admin1에서 고를 수 있는 4,580개 중 34개가 이 형식이라 제보·수정 제안·등록이 check 제약에 걸렸다.
alter table public.places drop constraint places_admin1_code_check,
  add constraint places_admin1_code_check check (admin1_code ~ '^[A-Z]{3}[-+][0-9]+\??$');
alter table public.submissions drop constraint submissions_admin1_code_check,
  add constraint submissions_admin1_code_check check (admin1_code ~ '^[A-Z]{3}[-+][0-9]+\??$');
alter table public.submissions drop constraint submissions_confirmed_admin1_code_check,
  add constraint submissions_confirmed_admin1_code_check check (confirmed_admin1_code ~ '^[A-Z]{3}[-+][0-9]+\??$');
alter table public.edit_suggestions drop constraint edit_suggestions_admin1_code_check,
  add constraint edit_suggestions_admin1_code_check check (admin1_code ~ '^[A-Z]{3}[-+][0-9]+\??$');
