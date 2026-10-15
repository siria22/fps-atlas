-- 문의(이용 안내 > 고지 사항의 "문의 작성", Figma 11-d)
-- 로그인한 사용자만 보낸다. Edge Function `inquiry`가 이 표에 먼저 기록한 뒤 공용 문의 수신구에 알린다.
-- 회신 이메일 등 원본은 여기에만 두고, 수신구에는 제목·내용·관리 링크만 보낸다.
-- 표는 service role(Edge Function)만 읽고 쓴다. 정책을 두지 않아 공개 키로는 조회·기록이 막힌다.

create table public.inquiries (
  id bigint generated always as identity primary key,
  -- 계정 연동을 해제하면 문의도 함께 지운다(개인정보 처리방침 "해제하면 지체 없이 파기")
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('general', 'privacy', 'rights')),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  reply_to text not null check (char_length(reply_to) between 3 and 320),
  page_url text check (char_length(page_url) <= 2000),
  locale text not null check (locale in ('ko', 'en')),
  -- 수신구 통보 상태. 실패하면 notified = false로 남고 10분마다 다시 보낸다.
  -- notify_error: 'rejected:<코드>'(요청이 잘못됨, 재시도 안 함) | 'unreachable:<내용>'(재시도)
  notified boolean not null default false,
  notify_attempts integer not null default 0,
  notify_error text,
  created_at timestamptz not null default now()
);

create index inquiries_user_created on public.inquiries (user_id, created_at);
create index inquiries_unnotified on public.inquiries (created_at) where not notified;

alter table public.inquiries enable row level security;
revoke all on table public.inquiries from anon, authenticated;

-- 수신구 메일의 관리 링크(Supabase 대시보드 표 편집기)에 쓸 표 번호
create or replace function public.inquiries_table_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select 'public.inquiries'::regclass::oid::bigint;
$$;

revoke execute on function public.inquiries_table_id() from public, anon, authenticated;
grant execute on function public.inquiries_table_id() to service_role;

-- 통보 재시도: 10분마다 Edge Function `inquiry`를 부른다.
-- 주소는 이미지 정리 함수 주소(Vault cleanup_images_url)에서 함수 이름만 바꾸고, 호출 비밀값도 같은 것을 쓴다.
select cron.schedule(
  'inquiry-notify-retry',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_images_url'), '/cleanup-images', '/inquiry'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_images_secret')
    ),
    body := '{"retry": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- 보관 기간: 접수일로부터 90일 뒤 삭제(매일 03:41)
select cron.schedule(
  'inquiry-expire',
  '41 3 * * *',
  $cron$ delete from public.inquiries where created_at < now() - interval '90 days'; $cron$
);
