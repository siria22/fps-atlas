// 문의 접수(이용 안내 > 고지 사항의 "문의 작성"). 로그인한 사용자만 보낸다.
// 순서: 로그인 확인 → 횟수 제한 → public.inquiries에 기록 → 응답(접수 완료) → 공용 문의 수신구에 통보
//   통보는 응답 뒤에 이어서 하고, 실패하면 notified = false로 남긴다(통보 실패가 제출 실패는 아니다).
// 본문(사용자): { category, subject, body, replyTo, consent: true, pageUrl, locale }
//   성공 200 { ok: true, id } / 실패 4xx·5xx { ok: false, error: { code: 'auth' | 'invalid' | 'rate_limited' | 'server', message } }
// 본문(pg_cron): { "retry": true } + x-cleanup-secret 헤더 → 통보 못 한 문의를 다시 보낸다.
// 비밀값: INTAKE_ENDPOINT, INTAKE_SECRET(수신구), CLEANUP_SECRET(예약 호출 확인)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendInquiry, type IntakeConfig } from './intake.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

/** 수신구에 보내는 서비스 식별자(저장소 이름 기준). 과거 기록과 묶이므로 바꾸지 않는다. */
const SERVICE = 'fps-atlas'
/** 한 사용자가 1시간에 보낼 수 있는 문의 수 */
const HOURLY_LIMIT = 3
/** 예약 재시도 한 번에 다시 보낼 최대 건수와, 한 문의를 다시 보내는 최대 횟수 */
const RETRY_BATCH = 20
const MAX_ATTEMPTS = 12
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CATEGORIES = ['general', 'privacy', 'rights'] as const
/** 수신구 제목 형식 `<접수 창구>: <제목>`(수신구가 메일 제목 앞에 `[fps-atlas]`를 붙인다). 분류가 목록에서도 보이게 한다(인터페이스 문서 §2.1) */
const TITLE_LABEL: Record<(typeof CATEGORIES)[number], string> = { general: '일반', privacy: '개인정보', rights: '권리침해' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InquiryRow {
  id: number
  user_id: string
  category: (typeof CATEGORIES)[number]
  subject: string
  body: string
  page_url: string | null
  locale: string
  notify_attempts: number
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function fail(code: 'auth' | 'invalid' | 'rate_limited' | 'server', message: string, status: number) {
  return json({ ok: false, error: { code, message } }, status)
}

function sameSecret(given: string | null, expected: string) {
  if (!given || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** 수신구 메일에서 바로 그 행을 여는 Supabase 대시보드 표 편집기 링크 */
async function dashboardUrl(id: number) {
  const ref = new URL(Deno.env.get('SUPABASE_URL')!).hostname.split('.')[0]
  const { data: tableId } = await admin.rpc('inquiries_table_id')
  const base = `https://supabase.com/dashboard/project/${ref}/editor`
  return tableId ? `${base}/${tableId}?schema=public&filter=${encodeURIComponent(`id:eq:${id}`)}` : `${base}?schema=public`
}

/** 한 문의를 수신구에 알리고 결과를 행에 남긴다. 회신 이메일은 보내지 않는다(우리 DB에만 둔다). */
async function notify(row: InquiryRow) {
  const endpoint = Deno.env.get('INTAKE_ENDPOINT')
  const secret = Deno.env.get('INTAKE_SECRET')
  let notified = false
  let error: string | null
  if (!endpoint || !secret) {
    error = 'unreachable:not_configured'
  } else {
    const cfg: IntakeConfig = { endpoint, secret }
    const { data: profile } = await admin.from('profiles').select('display_name').eq('id', row.user_id).maybeSingle()
    const result = await sendInquiry(cfg, {
      service: SERVICE,
      id: `inq_${row.id}`,
      title: `${TITLE_LABEL[row.category]}: ${row.subject}`.slice(0, 200),
      kind: '문의',
      body: row.body,
      url: await dashboardUrl(row.id),
      from: profile?.display_name?.slice(0, 80) || undefined,
      attachments: [],
      meta: { category: row.category, lang: row.locale, page: row.page_url },
    })
    if (result.status === 'accepted') {
      notified = true
      error = null
    } else if (result.status === 'rejected') {
      // 같은 요청은 다시 보내도 거부된다. 코드나 입력 검증을 고쳐야 하므로 로그를 남긴다.
      error = `rejected:${result.error}`
      console.error(JSON.stringify({ intake: 'rejected', inquiry: row.id, error: result.error }))
    } else {
      error = `unreachable:${result.detail}`
      console.error(JSON.stringify({ intake: 'unreachable', inquiry: row.id, detail: result.detail }))
    }
  }
  const { error: updateError } = await admin.from('inquiries')
    .update({ notified, notify_error: error, notify_attempts: row.notify_attempts + 1 })
    .eq('id', row.id)
  if (updateError) console.error(JSON.stringify({ inquiry: row.id, updateError: updateError.message }))
  return notified
}

/** pg_cron이 10분마다 부른다. 거부된 건과 너무 많이 시도한 건은 건너뛴다. */
async function retry() {
  const { data, error } = await admin.from('inquiries')
    .select('id, user_id, category, subject, body, page_url, locale, notify_attempts')
    .eq('notified', false)
    .lt('notify_attempts', MAX_ATTEMPTS)
    .or('notify_error.is.null,notify_error.not.like."rejected:*"')
    // 방금 접수돼 아직 통보 중인 건과 겹치지 않게
    .lt('created_at', new Date(Date.now() - 2 * 60_000).toISOString())
    .order('created_at')
    .limit(RETRY_BATCH)
  if (error) return json({ error: error.message }, 500)
  let sent = 0
  for (const row of (data ?? []) as InquiryRow[]) if (await notify(row)) sent++
  return json({ retried: data?.length ?? 0, sent })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const cronSecret = Deno.env.get('CLEANUP_SECRET')
  if (req.headers.has('x-cleanup-secret')) {
    if (!cronSecret || !sameSecret(req.headers.get('x-cleanup-secret'), cronSecret)) return json({ error: 'forbidden' }, 403)
    return await retry()
  }

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: null }
  const user = userData?.user
  if (!user) return fail('auth', '로그인이 필요합니다.', 401)

  const input = await req.json().catch(() => null)
  const category = input?.category
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : ''
  const body = typeof input?.body === 'string' ? input.body.trim() : ''
  const replyTo = typeof input?.replyTo === 'string' ? input.replyTo.trim() : ''
  const pageUrl = typeof input?.pageUrl === 'string' && /^https?:\/\//.test(input.pageUrl) ? input.pageUrl.slice(0, 2000) : null
  const locale = input?.locale === 'en' ? 'en' : 'ko'
  if (
    !CATEGORIES.includes(category) || !subject || subject.length > 200 || !body || body.length > 5000
    || !EMAIL.test(replyTo) || replyTo.length > 320 || input?.consent !== true
  ) return fail('invalid', '입력한 내용을 확인해 주세요.', 400)

  const since = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count, error: countError } = await admin.from('inquiries')
    .select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since)
  if (countError) return fail('server', countError.message, 500)
  if ((count ?? 0) >= HOURLY_LIMIT) return fail('rate_limited', '1시간에 보낼 수 있는 문의 수를 넘었습니다.', 429)

  const { data: row, error: insertError } = await admin.from('inquiries')
    .insert({ user_id: user.id, category, subject, body, reply_to: replyTo, page_url: pageUrl, locale })
    .select('id, user_id, category, subject, body, page_url, locale, notify_attempts')
    .single()
  if (insertError || !row) return fail('server', insertError?.message ?? 'insert failed', 500)

  // 기록이 끝났으면 접수 완료. 통보는 응답 뒤에 이어서 한다(수신구가 느려도 사용자를 기다리게 하지 않음).
  const pending = notify(row as InquiryRow)
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(pending)
  else await pending
  return json({ ok: true, id: String(row.id) })
})
