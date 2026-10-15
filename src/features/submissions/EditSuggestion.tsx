import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase.ts'
import type { Database } from '../../lib/database.types.ts'
import type { EvidenceLevel } from '../../lib/domain.ts'
import type { LocationValue } from './LocationPicker.tsx'
import styles from './ReportForm.module.css'

type SuggestionField = Database['public']['Enums']['suggestion_field']
const FIELDS: SuggestionField[] = ['위치', '근거 수준', '근거 출처', '팬덤 위키', '기타']

/** 수정 제안 대상: 등록된 맵↔장소 연결 하나와 지금 공개된 정보 */
export interface SuggestionTarget {
  mapPlaceId: string
  title: string
  location: string
  evidence: EvidenceLevel
  sourceCount: number
  hasWiki: boolean
}

/**
 * 화면 03-b의 펼쳐진 "수정 제안" 섹션. 위치를 고치는 경우 오른쪽 위치 카드에서 고른 값을 새 위치로 보낸다.
 * 제보 폼 안에 놓이므로(form 중첩 불가) 버튼으로 따로 제출한다.
 */
export function EditSuggestion(props: {
  target: SuggestionTarget
  location: LocationValue
  onCancel: () => void
  onDone: (code: string) => void
}) {
  const { target, location, onCancel, onDone } = props
  const [fields, setFields] = useState<SuggestionField[]>([])
  const [proposal, setProposal] = useState('')
  const [reason, setReason] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fixesLocation = fields.includes('위치')

  const toggle = (field: SuggestionField) =>
    setFields((current) => (current.includes(field) ? current.filter((f) => f !== field) : [...current, field]))

  const submit = async () => {
    setError('')
    if (!fields.length) return setError('고칠 항목을 하나 이상 골라 주세요.')
    if (!proposal.trim() || !reason.trim()) return setError('어떻게 바꿔야 하는지와 그 이유를 적어 주세요.')
    if (referenceUrl.trim() && !/^https?:\/\//.test(referenceUrl.trim())) return setError('참고 URL에 올바른 주소를 입력해 주세요.')
    if (fixesLocation && !location.countryCode) return setError('위치를 고치려면 오른쪽 위치 카드에서 새 국가를 골라 주세요.')
    if (fixesLocation && location.region.trim() && !location.admin1Code) return setError('주·도는 목록이나 지도에서 고르거나, 모르면 비워 주세요.')

    setBusy(true)
    const { data, error: insertError } = await supabase
      .from('edit_suggestions')
      .insert({
        map_place_id: target.mapPlaceId,
        fields,
        proposal: proposal.trim(),
        reason: reason.trim(),
        reference_url: referenceUrl.trim() || null,
        ...(fixesLocation
          ? {
              location_precision: location.admin1Code ? ('주·도' as const) : ('국가' as const),
              country: location.country.trim(),
              country_code: location.countryCode,
              region: location.admin1Code ? location.region : null,
              admin1_code: location.admin1Code,
            }
          : {}),
      })
      .select('code')
      .single()
    setBusy(false)
    if (insertError) return setError(`수정 제안을 보내지 못했습니다: ${insertError.message}`)
    onDone(data.code ?? '')
  }

  return (
    <section className={`${styles.card} ${styles.suggestion}`} aria-label="수정 제안">
      <div className={styles.cardTitle}>
        <div>
          <h2>수정 제안 · {target.title}</h2>
          <p className={styles.caption}>등록된 정보 중 고쳐야 할 부분과 그 이유를 알려 주세요. 관리자의 확인 후 반영됩니다.</p>
        </div>
      </div>

      <div className={styles.current}>
        <b>현재 등록된 정보</b>
        <dl>
          <div>
            <dt>위치</dt>
            <dd>{target.location}</dd>
          </div>
          <div>
            <dt>근거 수준</dt>
            <dd>{target.evidence}</dd>
          </div>
          <div>
            <dt>근거 출처</dt>
            <dd>{target.sourceCount}개</dd>
          </div>
          <div>
            <dt>팬덤 위키</dt>
            <dd>{target.hasWiki ? '있음' : '없음'}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.group}>
        <span className={styles.label}>고칠 항목 * (여러 개 선택 가능)</span>
        <div className={styles.chips}>
          {FIELDS.map((field) => (
            <button
              type="button"
              key={field}
              className={fields.includes(field) ? styles.chipActive : styles.chip}
              aria-pressed={fields.includes(field)}
              onClick={() => toggle(field)}
            >
              {field}
            </button>
          ))}
        </div>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>어떻게 바꿔야 하나요? *</span>
        <textarea className={styles.input} rows={2} maxLength={2000} value={proposal} onChange={(e) => setProposal(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>왜 그렇게 생각하나요? *</span>
        <textarea className={styles.input} rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>참고 URL (선택)</span>
        <input className={styles.input} type="url" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://" />
        <small className={styles.help}>
          {fixesLocation ? '새 위치는 오른쪽 위치 카드에서 고른 값으로 보냅니다.' : '위치를 고치는 경우 오른쪽 위치 카드에서 새 위치를 고르세요.'}
        </small>
      </label>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          취소
        </button>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void submit()}>
          {busy ? '보내는 중…' : '수정 제안 제출'} <ArrowRight size={14} />
        </button>
      </div>
    </section>
  )
}
