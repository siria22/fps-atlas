import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database, Tables } from '../../lib/database.types.ts'
import { supabase } from '../../lib/supabase.ts'
import type { Era, EvidenceLevel } from '../../lib/domain.ts'

export const EVIDENCE_LEVELS: EvidenceLevel[] = ['공식', '커뮤니티 추정', '기타']
export const ERAS: Era[] = ['WWI', 'WWII', '냉전', '현대', '근미래', '기타']

export type AdminSubmission = Tables<'submissions'> & { submitter: { display_name: string } | null }

export function useAdminSubmissions() {
  return useQuery({
    queryKey: ['admin-submissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('*, submitter:profiles!submissions_user_id_fkey ( display_name )')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as AdminSubmission[]
    },
  })
}

export interface AdminPlace {
  id: string
  name: string
  country: string
  countryCode: string | null
  region: string | null
  admin1Code: string | null
  lat: number
  lng: number
  hasPhoto: boolean
  /** 이 장소에 연결된 맵: map id → 스크린샷 유무 */
  links: { id: string; mapId: string; hasScreenshot: boolean }[]
}

/** 장소 확정 후보와 "이미 연결/사진 있음" 판단에 쓴다. 공개 테이블이라 전부 읽어도 작다. */
export function useAdminPlaces() {
  return useQuery({
    queryKey: ['admin-places'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('places')
        .select('id, name, country, country_code, region, admin1_code, lat, lng, photo_path, commons_file, map_places ( id, map_id, screenshot_path )')
        .order('name')
      if (error) throw error
      return data.map(
        (p): AdminPlace => ({
          id: p.id,
          name: p.name,
          country: p.country,
          countryCode: p.country_code,
          region: p.region,
          admin1Code: p.admin1_code,
          lat: p.lat,
          lng: p.lng,
          hasPhoto: Boolean(p.photo_path || p.commons_file),
          links: p.map_places.map((mp) => ({ id: mp.id, mapId: mp.map_id, hasScreenshot: Boolean(mp.screenshot_path) })),
        }),
      )
    },
  })
}

/** 같은 주·도(국가 단위면 같은 나라의 국가 단위 장소)에 등록된 장소 */
export function placeCandidates(places: AdminPlace[] | undefined, countryCode: string | null, admin1Code: string | null) {
  if (!places || !countryCode) return []
  return places.filter((p) => p.countryCode === countryCode && p.admin1Code === admin1Code)
}

export interface AdminCatalog {
  games: { id: string; name: string }[]
  maps: { id: string; gameId: string; name: string; era: Era; wikiUrl: string | null }[]
}

export function useAdminCatalog() {
  return useQuery({
    queryKey: ['admin-catalog'],
    queryFn: async (): Promise<AdminCatalog> => {
      const [games, maps] = await Promise.all([
        supabase.from('games').select('id, name').order('name'),
        supabase.from('maps').select('id, game_id, name, era, wiki_url').order('name'),
      ])
      if (games.error) throw games.error
      if (maps.error) throw maps.error
      return {
        games: games.data,
        maps: maps.data.map((m) => ({ id: m.id, gameId: m.game_id, name: m.name, era: m.era, wikiUrl: m.wiki_url })),
      }
    },
  })
}

export type AdminSuggestion = Tables<'edit_suggestions'> & {
  submitter: { display_name: string } | null
  map_places: {
    id: string
    evidence_level: EvidenceLevel
    map_place_sources: { url: string }[]
    places: Pick<Tables<'places'>, 'id' | 'name' | 'country' | 'country_code' | 'region' | 'admin1_code' | 'lat' | 'lng'> & {
      map_places: { count: number }[]
    }
    maps: { id: string; name: string; wiki_url: string | null; games: { name: string } | null } | null
  } | null
}

export function useAdminSuggestions() {
  return useQuery({
    queryKey: ['admin-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('edit_suggestions')
        .select(
          `*, submitter:profiles!edit_suggestions_user_id_fkey ( display_name ),
           map_places ( id, evidence_level, map_place_sources ( url ),
             places ( id, name, country, country_code, region, admin1_code, lat, lng, map_places ( count ) ),
             maps ( id, name, wiki_url, games ( name ) ) )`,
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as AdminSuggestion[]
    },
  })
}

/** 승인·반영·등록 뒤 공개 지도와 관리 목록을 다시 읽는다. */
export function useRefreshAdmin() {
  const client = useQueryClient()
  return () =>
    Promise.all(
      ['admin-submissions', 'admin-suggestions', 'admin-places', 'admin-catalog', 'atlas', 'submission-catalog'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
}

/** 비공개 제보 이미지 미리보기(관리자만 읽을 수 있음) */
export function useSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ['signed-url', path],
    enabled: Boolean(path),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('submission-images').createSignedUrl(path!, 600)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/** 승인 시 비공개 버킷 이미지를 공개 버킷으로 복사한다. 실패하면 이미 올린 파일을 지운다. */
export async function copyToPublic(pairs: { from: string; to: string }[]) {
  const done: string[] = []
  try {
    for (const { from, to } of pairs) {
      const { data, error } = await supabase.storage.from('submission-images').download(from)
      if (error) throw error
      const up = await supabase.storage.from('public-images').upload(to, data, { contentType: 'image/webp', upsert: false })
      if (up.error) throw up.error
      done.push(to)
    }
  } catch (e) {
    if (done.length) await supabase.storage.from('public-images').remove(done)
    throw e
  }
  return done
}

export async function removePublic(paths: string[]) {
  if (paths.length) await supabase.storage.from('public-images').remove(paths)
}

/**
 * RPC 인자. DB 함수는 null을 받지만 생성된 타입은 인자를 null 불가로 적으므로 여기서 한 번만 맞춘다.
 */
type Nullable<T> = { [K in keyof T]: T[K] | null }
type Fn = Database['public']['Functions']
export const rpcArgs = {
  approve: (args: Nullable<Fn['approve_submission']['Args']>) => args as Fn['approve_submission']['Args'],
  apply: (args: Nullable<Fn['apply_edit_suggestion']['Args']>) => args as Fn['apply_edit_suggestion']['Args'],
  register: (args: Nullable<Fn['admin_register']['Args']>) => args as Fn['admin_register']['Args'],
}

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
export const locationLabel = (country: string, region: string | null) => (region ? `${country} > ${region}` : country)

export function isHttpUrl(value: string) {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
