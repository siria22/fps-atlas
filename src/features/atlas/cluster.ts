import type { VisiblePlace } from './filters.ts'

export interface ScreenPoint {
  place: VisiblePlace
  x: number
  y: number
}

export type MapMarker =
  | { kind: 'place'; id: string; x: number; y: number; place: VisiblePlace }
  | { kind: 'cluster'; id: string; x: number; y: number; places: VisiblePlace[]; linkCount: number }

/**
 * 화면 거리 기준 클러스터링. 연결이 많은 장소부터 기준점으로 잡고, 반경 안의 장소를 묶는다.
 * 클러스터 숫자는 묶인 장소들의 (필터를 통과한) 맵 연결 총수다.
 * `keepSeparate` 장소(선택된 장소)는 묶지 않고 항상 단독 핀으로 둔다.
 */
export function clusterPoints(points: ScreenPoint[], radius: number, keepSeparate: string | null = null): MapMarker[] {
  const sorted = [...points].sort((a, b) => b.place.visibleLinks.length - a.place.visibleLinks.length)
  const used = new Set<string>()
  const markers: MapMarker[] = []
  const solo = keepSeparate ? sorted.find((p) => p.place.id === keepSeparate) : undefined
  if (solo) {
    used.add(solo.place.id)
    markers.push({ kind: 'place', id: solo.place.id, x: solo.x, y: solo.y, place: solo.place })
  }
  const r2 = radius * radius

  for (const seed of sorted) {
    if (used.has(seed.place.id)) continue
    const group = sorted.filter((p) => {
      if (used.has(p.place.id)) return false
      const dx = p.x - seed.x
      const dy = p.y - seed.y
      return dx * dx + dy * dy <= r2
    })
    for (const p of group) used.add(p.place.id)

    if (group.length === 1) {
      markers.push({ kind: 'place', id: seed.place.id, x: seed.x, y: seed.y, place: seed.place })
      continue
    }
    const places = group.map((p) => p.place)
    markers.push({
      kind: 'cluster',
      // 같은 장소 묶음이면 줌 단계가 바뀌어도 같은 id → 선택 상태 유지
      id: places.map((p) => p.id).sort().join('|'),
      x: group.reduce((s, p) => s + p.x, 0) / group.length,
      y: group.reduce((s, p) => s + p.y, 0) / group.length,
      places,
      linkCount: places.reduce((s, p) => s + p.visibleLinks.length, 0),
    })
  }
  return markers
}
