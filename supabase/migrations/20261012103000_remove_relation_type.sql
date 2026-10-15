-- 관계 유형은 제보자 입력·저장·공개 표시에서 제거한다.
alter table public.map_places drop column relation_type;
alter table public.submissions drop column confirmed_relation_type;
drop type public.relation_type;
