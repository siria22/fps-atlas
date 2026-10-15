import { useState } from 'react'
import { Check, ImageIcon, X } from 'lucide-react'
import { StatusBadge } from '../../components/Badge.tsx'
import { Checkbox } from '../../components/Checkbox.tsx'
import { supabase } from '../../lib/supabase.ts'
import type { Era, EvidenceLevel } from '../../lib/domain.ts'
import { safeExternalUrl } from '../atlas/media.ts'
import { LocationPicker, defaultCoords, useAdmin1, useCountries, type Coords, type LocationValue } from '../submissions/LocationPicker.tsx'
import {
  ERAS,
  EVIDENCE_LEVELS,
  copyToPublic,
  formatDateTime,
  locationLabel,
  placeCandidates,
  removePublic,
  rpcArgs,
  useAdminCatalog,
  useAdminPlaces,
  useRefreshAdmin,
  useSignedUrl,
  type AdminSubmission,
} from './api.ts'
import { PlaceChoice, type PlaceDecision } from './PlaceChoice.tsx'
import styles from './Admin.module.css'

const NEW_MAP = 'new'
const CHECKS = ['근거 원문 확인', '맵·장소 연결 확인', '공개 위치 확인'] as const

/** 화면 04 오른쪽 "제보 상세 검토"와 04-b 반려 사유 입력. 부모가 제보 id를 key로 넘겨 제보마다 상태를 새로 만든다. */
export function SubmissionReview({ submission: s }: { submission: AdminSubmission }) {
  const catalog = useAdminCatalog()
  const places = useAdminPlaces()
  const countries = useCountries()
  const refresh = useRefreshAdmin()

  // 맵 확정: 제보에 맵 id가 있으면 그 맵, 없으면 같은 게임의 같은 이름 맵, 그것도 없으면 새 맵
  const game = catalog.data?.games.find((g) => g.id === s.game_id || g.name.toLocaleLowerCase() === s.game_name.trim().toLocaleLowerCase()) ?? null
  const gameMaps = catalog.data?.maps.filter((m) => m.gameId === game?.id) ?? []
  const guessedMap = s.map_id ?? gameMaps.find((m) => m.name.toLocaleLowerCase() === s.map_name.trim().toLocaleLowerCase())?.id ?? null
  const [mapChoice, setMapChoice] = useState<string | null>(null)
  const mapId = (mapChoice ?? guessedMap ?? NEW_MAP) === NEW_MAP ? null : (mapChoice ?? guessedMap)
  const chosenMap = gameMaps.find((m) => m.id === mapId) ?? null

  const [evidence, setEvidence] = useState<EvidenceLevel>(s.evidence_level)
  const [era, setEra] = useState<Era | null>(null)
  const effectiveEra = era ?? chosenMap?.era ?? '기타'

  const [location, setLocation] = useState<LocationValue>({
    countryCode: s.country_code,
    country: s.country,
    admin1Code: s.admin1_code,
    region: s.region ?? '',
  })
  const [coords, setCoords] = useState<Coords | null>(null)
  const admin1 = useAdmin1(location.countryCode)
  // 공개 좌표 기본값(주·도 대표 지점 / 수도)은 경계 데이터가 오면 채운다
  const fallbackCoords = defaultCoords(
    countries.data?.find((c) => c.code === location.countryCode) ?? null,
    admin1.data?.find((r) => r.properties.code === location.admin1Code) ?? null,
  )

  const candidates = placeCandidates(places.data, location.countryCode, location.admin1Code)
  const [place, setPlace] = useState<PlaceDecision>(null)
  const existingPlace = place?.kind === 'existing' ? (places.data?.find((p) => p.id === place.placeId) ?? null) : null
  const shownLocation: LocationValue = existingPlace
    ? { countryCode: existingPlace.countryCode, country: existingPlace.country, admin1Code: existingPlace.admin1Code, region: existingPlace.region ?? '' }
    : location
  const shownCoords = existingPlace ? { lat: existingPlace.lat, lng: existingPlace.lng } : (coords ?? fallbackCoords)

  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pending = s.status === '검토 대기'
  const ready = checks.every(Boolean) && place !== null && !busy

  const approve = async () => {
    setError('')
    if (!place) return setError('장소를 확정해 주세요.')
    if (place.kind === 'new') {
      if (!place.name.trim()) return setError('새 장소 이름을 입력해 주세요.')
      if (!location.countryCode) return setError('국가를 목록에서 골라 주세요.')
      if (location.region.trim() && !location.admin1Code) return setError('주·도는 목록이나 지도에서 고르거나 비워 주세요.')
      if (!shownCoords) return setError('공개 좌표를 정해 주세요.')
    }
    setBusy(true)
    // 이미 스크린샷이 있는 연결, 이미 사진이 있는 장소에는 복사하지 않는다(DB도 덮어쓰지 않음)
    const linkHasShot = existingPlace?.links.some((l) => l.mapId === mapId && l.hasScreenshot) ?? false
    const folder = `submissions/${s.id}`
    const copies = [
      ...(s.screenshot_path && s.screenshot_thumb_path && !linkHasShot
        ? [{ from: s.screenshot_path, to: `${folder}/screenshot.webp` }, { from: s.screenshot_thumb_path, to: `${folder}/screenshot-thumb.webp` }]
        : []),
      ...(s.place_photo_path && s.place_photo_thumb_path && !existingPlace?.hasPhoto
        ? [{ from: s.place_photo_path, to: `${folder}/place-photo.webp` }, { from: s.place_photo_thumb_path, to: `${folder}/place-photo-thumb.webp` }]
        : []),
    ]
    let copied: string[] = []
    try {
      copied = await copyToPublic(copies)
      const has = (name: string) => (copied.includes(`${folder}/${name}`) ? `${folder}/${name}` : null)
      const { error: rpcError } = await supabase.rpc(
        'approve_submission',
        rpcArgs.approve({
          p_submission_id: s.id,
          p_map_id: mapId,
          p_place_id: existingPlace?.id ?? null,
          p_place_name: place.kind === 'new' ? place.name.trim() : null,
          p_country: location.country.trim(),
          p_country_code: location.countryCode,
          p_region: location.admin1Code ? location.region : null,
          p_admin1_code: location.admin1Code,
          p_lat: shownCoords?.lat ?? null,
          p_lng: shownCoords?.lng ?? null,
          p_evidence: evidence,
          p_era: effectiveEra,
          p_screenshot_path: has('screenshot.webp'),
          p_screenshot_thumb_path: has('screenshot-thumb.webp'),
          p_place_photo_path: has('place-photo.webp'),
          p_place_photo_thumb_path: has('place-photo-thumb.webp'),
        }),
      )
      if (rpcError) throw rpcError
      await refresh()
    } catch (e) {
      await removePublic(copied)
      setError(`승인하지 못했습니다: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    setError('')
    if (!reason.trim()) return setError('반려 사유를 입력해 주세요.')
    setBusy(true)
    const { error: updateError } = await supabase
      .from('submissions')
      .update({ status: '반려', reject_reason: reason.trim(), reviewed_at: new Date().toISOString(), reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null })
      .eq('id', s.id)
      .eq('status', '검토 대기')
    setBusy(false)
    if (updateError) return setError(`반려하지 못했습니다: ${updateError.message}`)
    await refresh()
  }

  return (
    <aside className={styles.panel} aria-label="제보 상세 검토">
      <div className={styles.panelTitle}>
        <h2>제보 상세 검토</h2>
        <StatusBadge status={s.status} />
      </div>
      <div className={styles.meta}>
        <span>{s.submitter?.display_name ?? '제보자'} · Google 계정</span>
        <span>
          {s.code} · {formatDateTime(s.created_at)}
        </span>
      </div>
      <p className={styles.target}>
        {s.game_name} · {s.map_name}
      </p>
      <p className={styles.proposed}>
        제보자 제안 · {s.evidence_level} / {locationLabel(s.country, s.region)} ({s.location_precision} 단위)
      </p>

      {pending ? (
        <>
          <div className={styles.pair}>
            <AdminSelect
              label={`관리자 확정 · 맵 (제보자 입력: ${s.map_name})`}
              value={mapId ?? NEW_MAP}
              onChange={(v) => {
                setMapChoice(v)
                setEra(null)
              }}
              options={[
                ...gameMaps.map((m) => ({ value: m.id, label: `${m.name} · 등록된 맵에 연결` })),
                { value: NEW_MAP, label: `${s.map_name} · 새 맵으로 등록${game ? '' : ' (새 게임)'}` },
              ]}
            />
            <AdminSelect label="관리자 확정 · 근거 수준" value={evidence} onChange={(v) => setEvidence(v as EvidenceLevel)} options={EVIDENCE_LEVELS.map((v) => ({ value: v, label: v }))} />
          </div>
          <div className={styles.pair}>
            <AdminSelect label="관리자 확정 · 시대" value={effectiveEra} onChange={(v) => setEra(v as Era)} options={ERAS.map((v) => ({ value: v, label: v }))} />
            <span className={styles.help}>목록에 없거나 판단하기 어려우면 기타</span>
          </div>

          <span className={styles.fieldLabel}>관리자 확정 · 장소 (같은 주·도에 등록된 장소)</span>
          <PlaceChoice
            candidates={candidates}
            mapId={mapId}
            value={place}
            onChange={setPlace}
            newHint="장소 이름을 정하고 아래 지도에서 공개 핀을 찍습니다"
          />
          <span className={styles.help}>기존 장소를 고르면 그 장소의 좌표를 그대로 씁니다. 이 맵과 이미 연결돼 있으면 근거만 추가됩니다.</span>

          <span className={styles.sectionLabel}>공개 좌표 · 새 장소일 때 지도를 클릭해 핀을 실제 위치로 옮기세요</span>
          <LocationPicker
            embedded
            value={shownLocation}
            onChange={(next) => {
              setLocation(next)
              setPlace((current) => (current?.kind === 'existing' ? null : current))
            }}
            pin={{ coords: shownCoords, onChange: setCoords, readOnly: Boolean(existingPlace) }}
          />
        </>
      ) : (
        <Processed submission={s} />
      )}

      <Attachments submission={s} />

      {pending && (
        <>
          <div className={styles.checks}>
            {CHECKS.map((label, i) => (
              <Checkbox key={label} checked={checks[i]} onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}>
                {label}
              </Checkbox>
            ))}
          </div>
          <div className={styles.decide}>
            <button type="button" className={styles.approve} disabled={!ready} onClick={() => void approve()}>
              {busy && !rejecting ? '승인 중…' : '제보 승인'} <Check size={14} />
            </button>
            <button type="button" className={styles.reject} disabled={busy} onClick={() => setRejecting(true)}>
              제보 반려 <X size={14} />
            </button>
          </div>
          {!rejecting && <span className={styles.condition}>3개 항목을 모두 확인하고 장소를 확정해야 승인할 수 있습니다</span>}
          {rejecting && (
            <div className={styles.rejectBox}>
              <b>반려 사유 입력</b>
              <span className={styles.fieldLabel}>반려 사유 * · 입력한 내용은 제보자에게 전달됩니다.</span>
              <textarea className={styles.adminInput} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="반려 사유" />
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
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </aside>
  )
}

function AdminSelect(props: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className={styles.adminField}>
      <span className={styles.fieldLabel}>{props.label}</span>
      <select className={styles.adminSelect} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** 처리된 제보: 확정값 또는 반려 사유만 보여 준다. */
function Processed({ submission: s }: { submission: AdminSubmission }) {
  return (
    <div className={styles.done}>
      {s.status === '승인' ? (
        <p>
          승인됨 · {s.confirmed_evidence_level} · {s.confirmed_era} · {locationLabel(s.country, s.confirmed_region)}
          {s.confirmed_lat !== null && ` · ${s.confirmed_lat.toFixed(2)}, ${s.confirmed_lng?.toFixed(2)}`}
        </p>
      ) : (
        <>
          <b>반려 사유</b>
          <p>{s.reject_reason}</p>
        </>
      )}
      {s.reviewed_at && <span className={styles.fieldLabel}>검토일 · {formatDateTime(s.reviewed_at)}</span>}
    </div>
  )
}

function Attachments({ submission: s }: { submission: AdminSubmission }) {
  const shot = useSignedUrl(s.screenshot_thumb_path)
  const photo = useSignedUrl(s.place_photo_thumb_path)
  const source = safeExternalUrl(s.source_url)
  const wiki = safeExternalUrl(s.wiki_url)
  return (
    <>
      <span className={styles.sectionLabel}>첨부 이미지 · 승인 전 비공개</span>
      <div className={styles.images}>
        <Thumb url={shot.data ?? null} has={Boolean(s.screenshot_path)} label="인게임 스크린샷" />
        <Thumb url={photo.data ?? null} has={Boolean(s.place_photo_path)} label="장소 사진" />
      </div>
      <p className={styles.material}>
        근거 출처 {source ? <a href={source} target="_blank" rel="noreferrer">↗ {source}</a> : '· 없음'}
      </p>
      <p className={styles.material}>
        팬덤 위키 {wiki ? <a href={wiki} target="_blank" rel="noreferrer">↗ {wiki}</a> : '· 없음'}
      </p>
      <p className={styles.material}>설명 · {s.description ?? '없음'}</p>
    </>
  )
}

function Thumb({ url, has, label }: { url: string | null; has: boolean; label: string }) {
  return (
    <span className={styles.image}>
      <span className={has ? styles.thumb : styles.thumbEmpty}>
        {url ? <img src={url} alt={`${label} 미리보기`} /> : has ? <ImageIcon size={16} /> : '없음'}
      </span>
      {has ? `${label} · 제보자 직접 촬영` : `${label} · 첨부 없음`}
    </span>
  )
}
