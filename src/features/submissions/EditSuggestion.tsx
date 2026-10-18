import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase.ts'
import type { Database } from '../../lib/database.types.ts'
import type { EvidenceLevel } from '../../lib/domain.ts'
import type { LocationValue } from './LocationPicker.tsx'
import { useI18n } from '../../i18n/i18n.tsx'
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
  const { t } = useI18n()
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
    if (!fields.length) return setError(t('suggest.err.fields'))
    if (!proposal.trim() || !reason.trim()) return setError(t('suggest.err.text'))
    if (referenceUrl.trim() && !/^https?:\/\//.test(referenceUrl.trim())) return setError(t('suggest.err.url'))
    if (fixesLocation && !location.countryCode) return setError(t('suggest.err.country'))
    if (fixesLocation && location.region.trim() && !location.admin1Code) return setError(t('report.err.region'))

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
    if (insertError) return setError(t('suggest.err.send', { message: insertError.message }))
    onDone(data.code ?? '')
  }

  return (
    <section className={`${styles.card} ${styles.suggestion}`} aria-label={t('report.suggestEdit')}>
      <div className={styles.cardTitle}>
        <div>
          <h2>{t('suggest.title', { title: target.title })}</h2>
          <p className={styles.caption}>{t('suggest.caption')}</p>
        </div>
      </div>

      <div className={styles.current}>
        <b>{t('suggest.current')}</b>
        <dl>
          <div>
            <dt>{t('suggest.field.위치')}</dt>
            <dd>{target.location}</dd>
          </div>
          <div>
            <dt>{t('suggest.field.근거 수준')}</dt>
            <dd>{t(`evidence.${target.evidence}`)}</dd>
          </div>
          <div>
            <dt>{t('suggest.field.근거 출처')}</dt>
            <dd>{t('suggest.sourceCount', { n: target.sourceCount })}</dd>
          </div>
          <div>
            <dt>{t('suggest.field.팬덤 위키')}</dt>
            <dd>{target.hasWiki ? t('suggest.has') : t('suggest.none')}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.group}>
        <span className={styles.label}>{t('suggest.fields')}</span>
        <div className={styles.chips}>
          {FIELDS.map((field) => (
            <button
              type="button"
              key={field}
              className={fields.includes(field) ? styles.chipActive : styles.chip}
              aria-pressed={fields.includes(field)}
              onClick={() => toggle(field)}
            >
              {t(`suggest.field.${field}`)}
            </button>
          ))}
        </div>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>{t('suggest.how')}</span>
        <textarea className={styles.input} rows={2} maxLength={2000} value={proposal} onChange={(e) => setProposal(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{t('suggest.why')}</span>
        <textarea className={styles.input} rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{t('suggest.reference')}</span>
        <input className={styles.input} type="url" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://" />
        <small className={styles.help}>
          {fixesLocation ? t('suggest.locationOn') : t('suggest.locationOff')}
        </small>
      </label>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void submit()}>
          {busy ? t('suggest.sending') : t('suggest.submit')} <ArrowRight size={14} />
        </button>
      </div>
    </section>
  )
}
