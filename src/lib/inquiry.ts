// 문의 보내기. 로그인한 사용자만 보낸다.
//   브라우저 → Edge Function `inquiry` → public.inquiries에 기록 → 공용 문의 수신구(메일) 통보
// 수신구의 주소·시크릿은 Edge Function 비밀값에만 있고 브라우저 번들에는 들어가지 않는다.
// 회신 이메일은 우리 DB에만 저장하고 수신구로 보내지 않는다.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'

export type InquiryCategory = 'general' | 'privacy' | 'rights'

/** Edge Function으로 보내는 본문 */
export interface InquiryRequest {
  category: InquiryCategory
  subject: string
  body: string
  /** 회신 받을 이메일 */
  replyTo: string
  /** 회신 이메일 사용 동의. 동의해야만 보낼 수 있다. */
  consent: true
  /** 문의를 보낸 화면 주소와 화면 언어(답변 참고용) */
  pageUrl: string
  locale: 'ko' | 'en'
}

export type InquiryErrorCode = 'auth' | 'invalid' | 'rate_limited' | 'network' | 'server'

/**
 * Edge Function 응답.
 * - 성공: HTTP 200 `{ "ok": true, "id": "<접수 번호>" }`
 * - 실패: HTTP 4xx/5xx `{ "ok": false, "error": { "code": "auth" | "invalid" | "rate_limited" | "server", "message": "..." } }`
 * 함수에 닿지 못하면 이 파일에서 'network'로 만든다.
 */
export type InquiryResult = { ok: true; id: string } | { ok: false; code: InquiryErrorCode; message: string }

export async function sendInquiry(request: InquiryRequest): Promise<InquiryResult> {
  const { data, error } = await supabase.functions.invoke<{ ok: true; id: string }>('inquiry', { body: request })
  if (!error && data?.ok) return { ok: true, id: data.id }
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response
    const detail = (await res.json().catch(() => null)) as { error?: { code?: InquiryErrorCode; message?: string } } | null
    const code = detail?.error?.code ?? (res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limited' : res.status < 500 ? 'invalid' : 'server')
    return { ok: false, code, message: detail?.error?.message ?? `HTTP ${res.status}` }
  }
  return { ok: false, code: error ? 'network' : 'server', message: error?.message ?? '응답을 해석할 수 없습니다.' }
}
