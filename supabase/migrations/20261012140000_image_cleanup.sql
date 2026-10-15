-- 7단계 이미지 자동 정리 (CLAUDE.md "이미지 정책")
--   제출되지 않은 업로드: 24시간 후 삭제
--   반려된 제보 이미지: 반려 30일 후 삭제
--   검토 대기·승인 제보가 가리키는 이미지: 삭제하지 않음
-- 실제 삭제는 Edge Function `cleanup-images`가 Storage API로 한다(storage.objects를 SQL로 지우지 않음).
-- 여기서는 후보 조회·경로 비우기 함수와 매시간 예약만 만든다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 삭제 후보. kind = 'orphan'(어느 제보도 가리키지 않는 업로드) | 'rejected'(반려 후 기간이 지난 제보 이미지)
create or replace function public.image_cleanup_candidates(
  p_orphan_age interval default interval '24 hours',
  p_rejected_age interval default interval '30 days'
)
returns table (kind text, submission_id bigint, path text)
language sql
stable
security definer
set search_path = ''
as $$
  with referenced as (
    select p.path
    from public.submissions s
    cross join lateral unnest(array[s.screenshot_path, s.screenshot_thumb_path, s.place_photo_path, s.place_photo_thumb_path]) as p (path)
    where p.path is not null
  )
  select 'orphan', null::bigint, o.name
  from storage.objects o
  where o.bucket_id = 'submission-images'
    and o.created_at < now() - p_orphan_age
    and not exists (select 1 from referenced r where r.path = o.name)
  union all
  select 'rejected', s.id, p.path
  from public.submissions s
  cross join lateral unnest(array[s.screenshot_path, s.screenshot_thumb_path, s.place_photo_path, s.place_photo_thumb_path]) as p (path)
  where s.status = '반려'
    and s.reviewed_at < now() - p_rejected_age
    and p.path is not null;
$$;

-- Storage에서 지운 뒤 반려 제보의 이미지 경로를 비운다(검토 화면·내 제보에서 깨진 이미지 방지).
create or replace function public.clear_rejected_submission_images(p_submission_ids bigint[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with cleared as (
    update public.submissions
    set screenshot_path = null, screenshot_thumb_path = null, place_photo_path = null, place_photo_thumb_path = null
    where id = any (p_submission_ids) and status = '반려'
    returning 1
  )
  select count(*)::integer from cleared;
$$;

-- Edge Function(service role)만 부른다.
revoke execute on function public.image_cleanup_candidates(interval, interval) from public, anon, authenticated;
revoke execute on function public.clear_rejected_submission_images(bigint[]) from public, anon, authenticated;
grant execute on function public.image_cleanup_candidates(interval, interval) to service_role;
grant execute on function public.clear_rejected_submission_images(bigint[]) to service_role;

-- 매시간 17분에 Edge Function 호출. 주소와 호출 비밀값은 Vault에 둔다(마이그레이션·저장소에 넣지 않음):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/cleanup-images', 'cleanup_images_url');
--   select vault.create_secret('<CLEANUP_SECRET>', 'cleanup_images_secret');
select cron.schedule(
  'cleanup-images',
  '17 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_images_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_images_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
