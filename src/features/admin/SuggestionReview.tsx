import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { StatusBadge } from '../../components/Badge.tsx'
import { Checkbox } from '../../components/Checkbox.tsx'
import { supabase } from '../../lib/supabase.ts'
import type { EvidenceLevel } from '../../lib/domain.ts'
import { safeExternalUrl } from '../atlas/media.ts'
import { LocationPicker, defaultCoords, useAdmin1, useCountries, type Coords, type LocationValue } from '../submissions/LocationPicker.tsx'
import { EVIDENCE_LEVELS, formatDateTime, isHttpUrl, locationLabel, rpcArgs, useRefreshAdmin, type AdminSuggestion } from './api.ts'
import styles from './Admin.module.css'

const CHECKS = ['제안 근거 확인', '반영할 값 확인'] as const

/** 화면 04-c 오른쪽 "수정 제안 검토". 반영할 값은 고칠 항목으로 고른 것만 보여 준다. */
export function SuggestionReview({ suggestion: e }: { suggestion: AdminSuggestion }) {
  const refresh = useRefreshAdmin()
  const countries = useCountries()
  const link = e.map_places
  const place = link?.places ?? null
  const map = link?.maps ?? null
  const has = (field: AdminSuggestion['fields'][number]) => e.fields.includes(field)

  // 위치: 제안한 새 위치에서 시작, 공개 좌표는 그 주·도 대표 지점(국가만 있으면 수도)
  const [location, setLocation] = useState<LocationValue>({
    countryCode: e.country_code,
    country: e.country ?? '',
    admin1Code: e.admin1_code,
    region: e.region ?? '',
  })
  const [coords, setCoords] = useState<Coords | null>(null)
  const admin1 = useAdmin1(location.countryCode)
  const shownCoords =
    coords ??
    defaultCoords(
      countries.data?.find((c) => c.code === location.countryCode) ?? null,
      admin1.data?.find((r) => r.properties.code === location.admin1Code) ?? null,
    )
  const [evidence, setEvidence] = useState<EvidenceLevel>(link?.evidence_level ?? '커뮤니티 추정')
  const [sourceUrl, setSourceUrl] = useState(has('근거 출처') ? (e.reference_url ?? '') : '')
  const [wikiUrl, setWikiUrl] = useState(has('팬덤 위키') ? (e.reference_url ?? map?.wiki_url ?? '') : '')

  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = e.status === '검토 대기'
  const linkedMaps = place?.map_places[0]?.count ?? 1

  const apply = async () => {
    setError('')
    if (has('위치')) {
      if (!location.countryCode) return setError('국가를 목록에서 골라 주세요.')
      if (location.region.trim() && !location.admin1Code) return setError('주·도는 목록이나 지도에서 고르거나 비워 주세요.')
      if (!shownCoords) return setError('공개 좌표를 정해 주세요.')
    }
    if (has('근거 출처') && !isHttpUrl(sourceUrl.trim())) return setError('추가할 근거 출처 URL을 입력해 주세요.')
    if (has('팬덤 위키') && !isHttpUrl(wikiUrl.trim())) return setError('팬덤 위키 URL을 입력해 주세요.')
    setBusy(true)
    const { error: rpcError } = await supabase.rpc(
      'apply_edit_suggestion',
      rpcArgs.apply({
        p_suggestion_id: e.id,
        p_country: has('위치') ? location.country.trim() : null,
        p_country_code: has('위치') ? location.countryCode : null,
        p_region: has('위치') && location.admin1Code ? location.region : null,
        p_admin1_code: has('위치') ? location.admin1Code : null,
        p_lat: has('위치') ? (shownCoords?.lat ?? null) : null,
        p_lng: has('위치') ? (shownCoords?.lng ?? null) : null,
        p_evidence: has('근거 수준') ? evidence : null,
        p_source_url: has('근거 출처') ? sourceUrl.trim() : null,
        p_wiki_url: has('팬덤 위키') ? wikiUrl.trim() : null,
      }),
    )
    setBusy(false)
    if (rpcError) return setError(`반영하지 못했습니다: ${rpcError.message}`)
    await refresh()
  }

  const reject = async () => {
    setError('')
    if (!reason.trim()) return setError('반려 사유를 입력해 주세요.')
    setBusy(true)
    const { error: updateError } = await supabase
      .from('edit_suggestions')
      .update({ status: '반려', reject_reason: reason.trim(), reviewed_at: new Date().toISOString(), reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null })
      .eq('id', e.id)
      .eq('status', '검토 대기')
    setBusy(false)
    if (updateError) return setError(`반려하지 못했습니다: ${updateError.message}`)
    await refresh()
  }

  const reference = safeExternalUrl(e.reference_url)
  return (
    <aside className={styles.panel} aria-label="수정 제안 검토">
      <div className={styles.panelTitle}>
        <h2>수정 제안 검토</h2>
        <StatusBadge status={e.status} />
      </div>
      <div className={styles.meta}>
        <span>{e.submitter?.display_name ?? '제안자'} · Google 계정</span>
        <span>
          {e.code} · {formatDateTime(e.created_at)}
        </span>
      </div>
      <p className={styles.target}>
        {map?.games?.name} · {map?.name}
      </p>
      <div className={styles.chipRow}>
        <span className={styles.fieldLabel}>고칠 항목</span>
        {e.fields.map((f) => (
          <span key={f} className={styles.fieldChip}>
            {f}
          </span>
        ))}
      </div>

      <div className={styles.current}>
        <b>현재 등록된 정보</b>
        <dl>
          <div>
            <dt>위치</dt>
            <dd>{place ? `${place.name} · ${locationLabel(place.country, place.region)}` : '—'}</dd>
          </div>
          <div>
            <dt>근거 수준</dt>
            <dd>{link?.evidence_level}</dd>
          </div>
          <div>
            <dt>근거 출처</dt>
            <dd>{link?.map_place_sources.length ?? 0}개</dd>
          </div>
          <div>
            <dt>팬덤 위키</dt>
            <dd>{map?.wiki_url ? '있음' : '없음'}</dd>
          </div>
        </dl>
      </div>

      <span className={styles.fieldLabel}>어떻게 바꿔야 하나요?</span>
      <p className={styles.answer}>{e.proposal}</p>
      <span className={styles.fieldLabel}>왜 그렇게 생각하나요?</span>
      <p className={styles.answer}>{e.reason}</p>
      <p className={styles.material}>
        참고 URL {reference ? <a href={reference} target="_blank" rel="noreferrer">↗ {reference}</a> : '· 없음'}
      </p>
      {has('위치') && (
        <p className={styles.proposed}>제안한 새 위치 · {locationLabel(e.country ?? '', e.region)}</p>
      )}

      {pending ? (
        <>
          <hr className={styles.divider} />
          <span className={styles.sectionLabel}>관리자 확정 · 반영할 값 (고칠 항목만 표시)</span>
          {has('위치') && (
            <>
              <span className={styles.fieldLabel}>위치 · 이 장소에 연결된 맵 {linkedMaps}개에 모두 반영됩니다</span>
              <LocationPicker embedded value={location} onChange={setLocation} pin={{ coords: shownCoords, onChange: setCoords }} />
            </>
          )}
          {has('근거 수준') && (
            <label className={styles.adminField}>
              <span className={styles.fieldLabel}>근거 수준</span>
              <select className={styles.adminSelect} value={evidence} onChange={(ev) => setEvidence(ev.target.value as EvidenceLevel)}>
                {EVIDENCE_LEVELS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          {has('근거 출처') && (
            <label className={styles.adminField}>
              <span className={styles.fieldLabel}>근거 출처 · 추가할 URL</span>
              <input className={styles.adminInput} type="url" value={sourceUrl} onChange={(ev) => setSourceUrl(ev.target.value)} placeholder="https://" />
            </label>
          )}
          {has('팬덤 위키') && (
            <label className={styles.adminField}>
              <span className={styles.fieldLabel}>팬덤 위키 · 바꿀 URL</span>
              <input className={styles.adminInput} type="url" value={wikiUrl} onChange={(ev) => setWikiUrl(ev.target.value)} placeholder="https://" />
            </label>
          )}
          {has('기타') && <span className={styles.help}>기타 항목은 자동으로 바뀌는 값이 없습니다. 반영하면 상태만 승인으로 바뀝니다.</span>}

          <div className={styles.checks}>
            {CHECKS.map((label, i) => (
              <Checkbox key={label} checked={checks[i]} onChange={(ev) => setChecks((c) => c.map((v, j) => (j === i ? ev.target.checked : v)))}>
                {label}
              </Checkbox>
            ))}
          </div>
          <div className={styles.decide}>
            <button type="button" className={styles.approve} disabled={!checks.every(Boolean) || busy} onClick={() => void apply()}>
              {busy && !rejecting ? '반영 중…' : '제안 반영'} <Check size={14} />
            </button>
            <button type="button" className={styles.reject} disabled={busy} onClick={() => setRejecting(true)}>
              제안 반려 <X size={14} />
            </button>
          </div>
          {!rejecting && <span className={styles.condition}>2개 항목을 모두 확인해야 반영할 수 있습니다. 반려하면 사유를 적습니다.</span>}
          {rejecting && (
            <div className={styles.rejectBox}>
              <b>반려 사유 입력</b>
              <span className={styles.fieldLabel}>반려 사유 * · 입력한 내용은 제안자에게 전달됩니다.</span>
              <textarea className={styles.adminInput} rows={3} maxLength={1000} value={reason} onChange={(ev) => setReason(ev.target.value)} aria-label="반려 사유" />
              <div className={styles.decide}>
                <button type="button" className={styles.ghost} onClick={() => { setRejecting(false); setReason('') }}>
                  취소
                </button>
                <button type="button" className={styles.reject} disabled={busy} onClick={() => void reject()}>
                  {busy ? '반려 중…' : '반려 확정'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.done}>
          {e.status === '승인' ? <p>반영됨</p> : (<><b>반려 사유</b><p>{e.reject_reason}</p></>)}
          {e.reviewed_at && <span className={styles.fieldLabel}>검토일 · {formatDateTime(e.reviewed_at)}</span>}
        </div>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </aside>
  )
}
