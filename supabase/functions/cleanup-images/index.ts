// 이미지 자동 정리 (pg_cron이 매시간 호출). 후보는 DB 함수가 고르고, 삭제는 Storage API로 한다.
// 호출에는 x-cleanup-secret 헤더가 필요하다(Vault의 cleanup_images_secret = 함수 비밀값 CLEANUP_SECRET).
// 본문(선택): { "dryRun": true } 후보만 돌려준다. { "orphanAge": "1 minute", "rejectedAge": "0 seconds" } 점검용 기간.
import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'submission-images'
const CHUNK = 100

interface Candidate {
  kind: 'orphan' | 'rejected'
  submission_id: number | null
  path: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function sameSecret(given: string | null, expected: string) {
  if (!given || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CLEANUP_SECRET')
  if (!secret || !sameSecret(req.headers.get('x-cleanup-secret'), secret)) return json({ error: 'forbidden' }, 403)
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const body = await req.json().catch(() => ({}))
  const dryRun = body.dryRun === true
  const args: Record<string, string> = {}
  if (typeof body.orphanAge === 'string') args.p_orphan_age = body.orphanAge
  if (typeof body.rejectedAge === 'string') args.p_rejected_age = body.rejectedAge

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin.rpc('image_cleanup_candidates', args)
  if (error) return json({ error: error.message }, 500)
  const candidates = (data ?? []) as Candidate[]
  const summary = {
    dryRun,
    orphan: candidates.filter((c) => c.kind === 'orphan').map((c) => c.path),
    rejected: candidates.filter((c) => c.kind === 'rejected').map((c) => c.path),
    removed: 0,
    clearedSubmissions: 0,
  }
  if (dryRun || !candidates.length) return json(summary)

  const paths = [...new Set(candidates.map((c) => c.path))]
  for (let i = 0; i < paths.length; i += CHUNK) {
    const { data: removed, error: removeError } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + CHUNK))
    if (removeError) return json({ ...summary, error: removeError.message }, 500)
    summary.removed += removed?.length ?? 0
  }

  // 파일을 지운 뒤에만 경로를 비운다. 이미 없던 파일도 경로는 비운다.
  const ids = [...new Set(candidates.flatMap((c) => (c.kind === 'rejected' && c.submission_id !== null ? [c.submission_id] : [])))]
  if (ids.length) {
    const { data: cleared, error: clearError } = await admin.rpc('clear_rejected_submission_images', { p_submission_ids: ids })
    if (clearError) return json({ ...summary, error: clearError.message }, 500)
    summary.clearedSubmissions = cleared ?? 0
  }

  console.log(JSON.stringify({ ...summary, orphan: summary.orphan.length, rejected: summary.rejected.length }))
  return json(summary)
})
