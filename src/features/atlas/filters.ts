import type { Era, EvidenceLevel } from '../../lib/domain.ts'
import type { MapLink, Place } from './data.ts'

export const ERAS: Era[] = ['WWI', 'WWII', '냉전', '현대', '근미래', '기타']
export const EVIDENCE_LEVELS: EvidenceLevel[] = ['공식', '커뮤니티 추정', '기타']

export interface Filters {
  games: ReadonlySet<string>
  eras: ReadonlySet<Era>
  evidence: ReadonlySet<EvidenceLevel>
  query: string
}

/** 기본값은 전체 선택, 검색어 없음 */
export function defaultFilters(gameIds: string[]): Filters {
  return { games: new Set(gameIds), eras: new Set(ERAS), evidence: new Set(EVIDENCE_LEVELS), query: '' }
}

export function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, '')
}

export interface VisiblePlace extends Place {
  /** 필터를 통과한 맵 연결만 */
  visibleLinks: MapLink[]
}

/**
 * 게임·시대·근거 필터는 맵 연결 단위로 적용하고, 통과한 연결이 하나라도 있는 장소만 남긴다.
 * 검색은 화면 언어와 관계없이 장소 이름(한국어·영어)·지역·맵 이름·맵 별칭에서 공백을 무시하고 부분 일치로 찾는다.
 */
export function applyFilters(places: Place[], f: Filters): VisiblePlace[] {
  const q = normalize(f.query)
  const result: VisiblePlace[] = []
  for (const place of places) {
    const links = place.links.filter((l) => f.games.has(l.gameId) && f.eras.has(l.era) && f.evidence.has(l.evidence))
    if (links.length === 0) continue
    if (q) {
      const placeHit = [place.name, place.nameEn, place.region].some((s) => s && normalize(s).includes(q))
      if (!placeHit && !links.some((l) => [l.mapName, ...l.mapAliases].some((s) => normalize(s).includes(q)))) continue
    }
    result.push({ ...place, visibleLinks: links })
  }
  return result
}
