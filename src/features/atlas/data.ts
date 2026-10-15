import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase.ts'
import type { Era, EvidenceLevel, LocationPrecision } from '../../lib/domain.ts'

export interface Game {
  id: string
  /** 영문 공식명(대표 이름). 화면에는 항상 이 이름을 쓴다. */
  name: string
  /** 검색 전용 별칭(다른 언어 이름·약칭·오타) */
  aliases: string[]
}

/** 맵↔장소 연결 하나. 근거 수준과 근거 출처는 이 단위의 값이다. */
export interface MapLink {
  id: string
  placeId: string
  evidence: EvidenceLevel
  note: string | null
  screenshotThumbPath: string | null
  screenshotCredit: string | null
  sources: { url: string }[]
  mapId: string
  mapName: string
  /** 검색 전용 별칭 */
  mapAliases: string[]
  era: Era
  wikiUrl: string | null
  gameId: string
  gameName: string
}

export interface Place {
  id: string
  /** 한국어 이름 */
  name: string
  /** 영어 화면용 이름. 없으면 name */
  nameEn: string | null
  region: string | null
  country: string
  /** Natural Earth adm0_a3 · adm1_code. 영어 화면에서 국가·주·도 이름을 찾는 데 쓴다. */
  countryCode: string | null
  admin1Code: string | null
  lat: number
  lng: number
  precision: LocationPrecision
  wikipediaTitleEn: string | null
  photoPath: string | null
  photoCredit: string | null
  commonsFile: string | null
  commonsAuthor: string | null
  commonsLicense: string | null
  events: AtlasEvent[]
  links: MapLink[]
}

export interface AtlasEvent {
  id: string
  name: string
  wikipediaTitleEn: string | null
}

export interface AtlasData {
  games: Game[]
  places: Place[]
}

// 공개 테이블만 읽는다. 승인된 데이터만 들어 있으므로 RLS상 누구나 조회 가능.
async function fetchAtlas(): Promise<AtlasData> {
  const [games, places] = await Promise.all([
    supabase.from('games').select('id, name, game_aliases ( alias )').order('name'),
    supabase
      .from('places')
      .select(
        `id, name, name_en, region, country, country_code, admin1_code, lat, lng, location_precision,
         wikipedia_title_en, photo_thumb_path, photo_path, photo_credit,
         commons_file, commons_author, commons_license,
         place_events ( events ( id, name, wikipedia_title_en ) ),
         map_places ( id, evidence_level, note, screenshot_thumb_path, screenshot_credit,
           map_place_sources ( url ),
           maps ( id, name, era, wiki_url, map_aliases ( alias ), games ( id, name ) ) )`,
      )
      .order('name'),
  ])
  if (games.error) throw games.error
  if (places.error) throw places.error

  return {
    games: games.data.map((g) => ({ id: g.id, name: g.name, aliases: g.game_aliases.map((a) => a.alias) })),
    places: places.data.map((p) => ({
      id: p.id,
      name: p.name,
      nameEn: p.name_en,
      region: p.region,
      country: p.country,
      countryCode: p.country_code,
      admin1Code: p.admin1_code,
      lat: p.lat,
      lng: p.lng,
      precision: p.location_precision,
      wikipediaTitleEn: p.wikipedia_title_en,
      photoPath: p.photo_thumb_path ?? p.photo_path,
      photoCredit: p.photo_credit,
      commonsFile: p.commons_file,
      commonsAuthor: p.commons_author,
      commonsLicense: p.commons_license,
      events: p.place_events.flatMap(({ events: event }) => event ? [{
        id: event.id,
        name: event.name,
        wikipediaTitleEn: event.wikipedia_title_en,
      }] : []).sort((a, b) => a.id.localeCompare(b.id)),
      links: p.map_places.flatMap((mp) => {
        const map = mp.maps
        const game = map?.games
        if (!map || !game) return []
        return [
          {
            id: mp.id,
            placeId: p.id,
            evidence: mp.evidence_level,
            note: mp.note,
            screenshotThumbPath: mp.screenshot_thumb_path,
            screenshotCredit: mp.screenshot_credit,
            sources: mp.map_place_sources,
            mapId: map.id,
            mapName: map.name,
            mapAliases: map.map_aliases.map((a) => a.alias),
            era: map.era,
            wikiUrl: map.wiki_url,
            gameId: game.id,
            gameName: game.name,
          },
        ]
      }),
    })),
  }
}

export function useAtlasData() {
  return useQuery({ queryKey: ['atlas'], queryFn: fetchAtlas, staleTime: 5 * 60 * 1000 })
}
