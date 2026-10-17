import type { AdminPlace } from './api.ts'
import { locationLabel } from './api.ts'
import styles from './Admin.module.css'

/** 장소 확정: 기존 장소 id 또는 새 장소 이름 */
export type PlaceDecision = { kind: 'existing'; placeId: string } | { kind: 'new'; name: string } | null

/**
 * 관리자 확정 · 장소 (04 검토 패널, 10 오른쪽 카드).
 * 같은 주·도에 등록된 장소를 후보로 보여 주고, 없으면 새 장소로 등록한다.
 */
export function PlaceChoice(props: {
  candidates: AdminPlace[]
  /** 확정한 맵 id. 그 맵과 이미 연결된 장소는 "근거 추가"로 표시한다. */
  mapId: string | null
  value: PlaceDecision
  onChange: (value: PlaceDecision) => void
  newHint: string
}) {
  const { candidates, mapId, value, onChange } = props
  const newName = value?.kind === 'new' ? value.name : ''
  return (
    <div className={styles.options} role="radiogroup" aria-label="관리자 확정 · 장소">
      {candidates.map((place) => {
        const active = value?.kind === 'existing' && value.placeId === place.id
        const linked = mapId !== null && place.links.some((l) => l.mapId === mapId)
        return (
          <label key={place.id} className={active ? styles.optionActive : styles.option}>
            <input type="radio" name="place-choice" checked={active} onChange={() => onChange({ kind: 'existing', placeId: place.id })} />
            <span>
              <b>{place.name}</b>
              <small>
                기존 장소 · {locationLabel(place.country, place.region)} · 맵 {place.links.length}개 연결 · {place.lat.toFixed(2)}, {place.lng.toFixed(2)}
                {linked && ' · 이 맵과 이미 연결됨(근거 추가)'}
              </small>
            </span>
          </label>
        )
      })}
      <label className={value?.kind === 'new' ? styles.optionActive : styles.option}>
        <input type="radio" name="place-choice" checked={value?.kind === 'new'} onChange={() => onChange({ kind: 'new', name: newName })} />
        <span>
          <b>새 장소로 등록</b>
          <small>{props.newHint}</small>
        </span>
      </label>
      {value?.kind === 'new' && (
        <label className={styles.adminField}>
          <span className={styles.fieldLabel}>새 장소 이름 *</span>
          <input
            className={styles.adminInput}
            value={newName}
            onChange={(e) => onChange({ kind: 'new', name: e.target.value })}
            placeholder="예: 카랑탕"
            aria-label="새 장소 이름"
          />
        </label>
      )}
    </div>
  )
}
