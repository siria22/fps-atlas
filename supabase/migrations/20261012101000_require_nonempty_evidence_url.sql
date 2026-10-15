-- 공식·추정 근거 URL은 공백만으로 우회할 수 없게 한다.
alter table public.submissions
  drop constraint submissions_source_required_for_evidence;

alter table public.submissions
  add constraint submissions_source_required_for_evidence
  check (evidence_level = '기타' or nullif(btrim(source_url), '') is not null);
