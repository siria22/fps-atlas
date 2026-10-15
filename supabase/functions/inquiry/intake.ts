// 공용 문의 수신구 클라이언트. 서버 사이드 전용(시크릿을 브라우저로 내리지 않는다).
// 연결 규칙은 PersonalAssistant의 inquiry-intake-interface.md §6 참조 구현을 그대로 따른다.
//   - 판정은 HTTP 상태가 아니라 본문 ok (수신구는 성공·거부 모두 200)
//   - 거부(rejected)는 재시도하지 않는다 / 못 닿음(unreachable)은 백오프 재시도
//   - 같은 (service, id)로 다시 보내면 duplicated: true, 메일은 다시 나가지 않는다
export type InquiryKind = '문의' | '제보' | '버그' | '삭제요청' | '기타'

export interface Inquiry {
  service: string
  /** 서비스 DB에 실제로 있는 행의 id(중복 차단 키). 호출마다 새로 만들지 않는다. */
  id: string
  title: string
  kind: InquiryKind
  body: string
  /** 관리 화면 링크(답장을 쓰러 가는 통로). 비우지 않는다. */
  url: string
  /** 표시용 이름. 연락처를 넣지 않는다. */
  from?: string
  attachments?: string[]
  meta?: Record<string, unknown>
}

export type IntakeResult =
  | { status: 'accepted'; duplicated: boolean; mailed: boolean }
  | { status: 'rejected'; error: string }
  | { status: 'unreachable'; detail: string }

export interface IntakeConfig {
  endpoint: string
  secret: string
  /** 기본 10초 */
  timeoutMs?: number
  /** 기본 2회(= 최대 3번 시도) */
  retries?: number
}

export async function sendInquiry(cfg: IntakeConfig, inquiry: Inquiry): Promise<IntakeResult> {
  const timeoutMs = cfg.timeoutMs ?? 10_000
  const retries = cfg.retries ?? 2
  let last = ''

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * 3 ** (attempt - 1)) // 300ms → 900ms

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: cfg.secret, ...inquiry }),
        signal: ac.signal,
      })
      if (!res.ok) { last = `http_${res.status}`; continue }

      const data = (await res.json()) as Record<string, unknown>
      if (data.ok === true) return { status: 'accepted', duplicated: !!data.duplicated, mailed: !!data.mailed }
      const error = String(data.error ?? 'unknown')
      // 수신구 쪽 사정(설정 누락·저장 실패·내부 예외)은 다시 보낼 만하다. 그 밖의 거부는 몇 번을 보내도 같다.
      if (error === 'store_failed' || error === 'not_configured' || error === 'internal') {
        last = error
        continue
      }
      return { status: 'rejected', error }
    } catch (e) {
      last = e instanceof Error ? e.name : String(e)
    } finally {
      clearTimeout(timer)
    }
  }
  return { status: 'unreachable', detail: last }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
