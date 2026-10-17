// 데이터 작업 공통 모듈(로컬 전용). 흐름과 파일 형식은 docs/data-workflow.md.
//   data/atlas.json, data/names.json  — DB 사본 + 이번에 고칠 내용(작업용)
//   data/.review/                     — 검수하는 동안만 있는 파일(원본 사본, 작업 목록, 차이, 결정, 썸네일)
// DB는 관리 API(SQL)로 읽고 쓴다. 공개 API의 1,000행 제한을 받지 않고 한 문장으로 끝난다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types.ts'

export const DATA = 'data'
export const REVIEW = join(DATA, '.review')
/** 반영할 때마다 실행 로그·결정·작업 목록·반영 전 DB 사본을 남기는 곳(지우지 않고 쌓아 둔다) */
export const HISTORY = join(DATA, '.history')
export const FILES = {
  atlas: join(DATA, 'atlas.json'),
  names: join(DATA, 'names.json'),
  base: join(REVIEW, 'base.json'),
  worklist: join(REVIEW, 'worklist.json'),
  diff: join(REVIEW, 'diff.json'),
  decisions: join(REVIEW, 'decisions.json'),
  apply: join(REVIEW, 'apply.sql'),
  images: join(REVIEW, 'images'),
}

export type Row = Record<string, unknown>

// ───────────── 파일 형식 ─────────────

export interface Image { path: string; thumb_path: string; credit: string | null }
export interface PlaceEntry {
  name: string | null; name_en: string | null
  country: string; country_code: string | null; region: string | null; admin1_code: string | null
  location_precision: string; lat: number; lng: number
  wikipedia_title_en: string | null
  photo: Image | null
  commons: { file: string; author: string | null; license: string | null } | null
  verified: boolean
}
export interface LinkEntry { evidence_level: string; sources: string[]; note: string | null; screenshot: Image | null; verified: boolean }
export interface MapEntry { name: string; era: string | null; wiki_url: string | null; verified: boolean; places: Record<string, LinkEntry> }
export interface GameEntry { name: string; series: string | null; release_year: number | null; maps: Record<string, MapEntry> }
export interface AtlasFile { format: 'fps-atlas-data/1'; exported_at: string; places: Record<string, PlaceEntry>; games: Record<string, GameEntry> }
export interface NamesFile {
  format: 'fps-atlas-names/1'; exported_at: string
  games: Record<string, { aliases: Record<string, string[]>; maps: Record<string, Record<string, string[]>> }>
}

// ───────────── 환경 ─────────────

let loaded = false
export function need(key: string) {
  if (!loaded) { process.loadEnvFile('.env'); loaded = true }
  const v = process.env[key]
  if (!v) throw new Error(`.env에 ${key}가 없습니다.`)
  return v
}

/** 관리 API로 SQL 한 문장을 실행한다. select의 결과 행을 돌려준다. */
export async function sql<T = Row>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${need('SUPABASE_PROJECT_REF')}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${need('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (res.status === 401) throw new Error('관리 API 토큰이 거부됐습니다(만료?). Supabase 대시보드 > Account > Access Tokens에서 새로 만들어 .env의 SUPABASE_ACCESS_TOKEN에 넣으세요.')
  if (!res.ok) throw new Error(`SQL 실패: HTTP ${res.status} ${text}`)
  return JSON.parse(text) as T[]
}

export function adminClient() {
  return createClient<Database>(need('VITE_SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}

// ───────────── 파일 입출력 ─────────────

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
export const readJsonIf = <T>(path: string): T | null => (existsSync(path) ? readJson<T>(path) : null)
export function writeJson(path: string, value: unknown) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}
export const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

// ───────────── SQL 값 ─────────────

const TAG = '$atlas$'
export function lit(v: unknown): string {
  if (v == null) return 'null'
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`숫자가 아님: ${v}`); return String(v) }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  const s = String(v)
  if (s.includes(TAG)) throw new Error(`값에 ${TAG}가 들어 있어 쓸 수 없습니다.`)
  return `'${s.replace(/'/g, "''")}'`
}
export const DO_TAG = TAG

// ───────────── 행 단위로 펼치기 ─────────────
// 파일의 중첩 구조를 DB 표 단위 행으로 펼친다. 키는 "표:자연키".
//   places:<id> · games:<id> · maps:<id> · map_places:<map>|<place> · map_place_sources:<map>|<place>|<url>
//   game_aliases:<game>|<alias> · map_aliases:<map>|<alias>

export type Table = 'games' | 'maps' | 'places' | 'map_places' | 'map_place_sources' | 'game_aliases' | 'map_aliases'
export const TABLE_ORDER: Table[] = ['games', 'maps', 'places', 'map_places', 'map_place_sources', 'game_aliases', 'map_aliases']
export const TABLE_LABEL: Record<Table, string> = {
  games: '게임', maps: '맵', places: '장소', map_places: '맵↔장소 연결', map_place_sources: '근거 출처', game_aliases: '게임 별칭', map_aliases: '맵 별칭',
}
export interface FlatRow { table: Table; key: Record<string, string>; values: Row; game: string }
export const tableOf = (rowKey: string) => rowKey.slice(0, rowKey.indexOf(':')) as Table

const image = (prefix: string, img: Image | null): Row => ({ [`${prefix}_path`]: img?.path ?? null, [`${prefix}_thumb_path`]: img?.thumb_path ?? null, [`${prefix}_credit`]: img?.credit ?? null })

export function flatten(atlas: AtlasFile, names: NamesFile): Map<string, FlatRow> {
  const out = new Map<string, FlatRow>()
  const placeGame = new Map<string, string>()
  for (const [gid, g] of Object.entries(atlas.games)) {
    out.set(`games:${gid}`, { table: 'games', key: { id: gid }, game: gid, values: { name: g.name, series: g.series, release_year: g.release_year } })
    for (const [mid, m] of Object.entries(g.maps)) {
      out.set(`maps:${mid}`, { table: 'maps', key: { id: mid }, game: gid, values: { game_id: gid, name: m.name, era: m.era, wiki_url: m.wiki_url, verified: m.verified } })
      for (const [pid, l] of Object.entries(m.places)) {
        if (!placeGame.has(pid)) placeGame.set(pid, gid)
        out.set(`map_places:${mid}|${pid}`, {
          table: 'map_places', key: { map_id: mid, place_id: pid }, game: gid,
          values: { evidence_level: l.evidence_level, note: l.note, verified: l.verified, ...image('screenshot', l.screenshot) },
        })
        for (const url of l.sources) out.set(`map_place_sources:${mid}|${pid}|${url}`, { table: 'map_place_sources', key: { map_id: mid, place_id: pid, url }, game: gid, values: {} })
      }
    }
  }
  for (const [pid, p] of Object.entries(atlas.places)) {
    out.set(`places:${pid}`, {
      table: 'places', key: { id: pid }, game: placeGame.get(pid) ?? '',
      values: {
        name: p.name, name_en: p.name_en, country: p.country, country_code: p.country_code, region: p.region, admin1_code: p.admin1_code,
        location_precision: p.location_precision, lat: p.lat, lng: p.lng, wikipedia_title_en: p.wikipedia_title_en, verified: p.verified,
        ...image('photo', p.photo),
        commons_file: p.commons?.file ?? null, commons_author: p.commons?.author ?? null, commons_license: p.commons?.license ?? null,
      },
    })
  }
  for (const [gid, g] of Object.entries(names.games)) {
    for (const [lang, list] of Object.entries(g.aliases ?? {})) for (const alias of list) out.set(`game_aliases:${gid}|${alias}`, { table: 'game_aliases', key: { game_id: gid, alias }, game: gid, values: { lang } })
    for (const [mid, langs] of Object.entries(g.maps ?? {})) {
      for (const [lang, list] of Object.entries(langs)) for (const alias of list) out.set(`map_aliases:${mid}|${alias}`, { table: 'map_aliases', key: { map_id: mid, alias }, game: gid, values: { lang } })
    }
  }
  return out
}

// ───────────── 값 검사 ─────────────

export const ERAS = ['WWI', 'WWII', '냉전', '현대', '근미래', '기타']
export const EVIDENCE = ['공식', '커뮤니티 추정', '기타']
export const PRECISIONS = ['주·도', '국가']
const ID = /^[a-z0-9][a-z0-9-]*$/

/** 한 행의 값이 DB에 들어갈 수 있는지(새 행·바뀐 행에만 쓴다) */
export function checkRow(r: FlatRow): string[] {
  const e: string[] = []
  const v = r.values
  const str = (f: string, required = false) => {
    const x = v[f]
    if (x == null) { if (required) e.push(`${f}가 비어 있음`); return }
    if (typeof x !== 'string' || x.trim() === '') e.push(`${f}는 비어 있지 않은 문자열`)
    else if (x !== x.trim()) e.push(`${f} 앞뒤에 공백`)
  }
  for (const [k, x] of Object.entries(r.key)) {
    if (k === 'url') { if (!/^https?:\/\/\S+$/.test(x)) e.push('근거 출처는 http(s) 주소') }
    else if (k === 'alias') { if (!x.trim() || x !== x.trim()) e.push('별칭이 비었거나 앞뒤에 공백') }
    else if (!ID.test(x)) e.push(`${k} "${x}"는 영문 소문자·숫자·하이픈만`)
    else if (x.startsWith('new-')) e.push(`${k} "${x}"는 임시 id · 실제 id로 바꿔야 함`)
  }
  switch (r.table) {
    case 'games':
      str('name', true); str('series')
      if (v.release_year != null && !Number.isInteger(v.release_year)) e.push('release_year는 정수')
      break
    case 'maps':
      str('name', true)
      if (!ERAS.includes(v.era as string)) e.push(`era는 ${ERAS.join('·')}`)
      if (v.wiki_url != null && !/^https?:\/\/\S+$/.test(String(v.wiki_url))) e.push('wiki_url은 http(s) 주소')
      break
    case 'places':
      str('name', true); str('name_en'); str('country', true); str('region'); str('wikipedia_title_en')
      if (typeof v.country_code !== 'string' || !/^[A-Z]{3}$/.test(v.country_code)) e.push('country_code는 대문자 3자(adm0_a3)')
      if (v.admin1_code != null && !/^[A-Z]{3}[-+][0-9]+\??$/.test(String(v.admin1_code))) e.push('admin1_code는 Natural Earth adm1_code')
      if (!PRECISIONS.includes(v.location_precision as string)) e.push(`location_precision은 ${PRECISIONS.join('·')}`)
      if (v.location_precision === '주·도' && (!v.admin1_code || !v.region)) e.push('주·도 단위인데 region·admin1_code가 비어 있음')
      if (v.location_precision === '국가' && (v.admin1_code || v.region)) e.push('국가 단위인데 region·admin1_code가 있음')
      if (typeof v.lat !== 'number' || v.lat < -90 || v.lat > 90) e.push('lat은 -90~90 숫자')
      if (typeof v.lng !== 'number' || v.lng < -180 || v.lng > 180) e.push('lng는 -180~180 숫자')
      break
    case 'map_places':
      if (!EVIDENCE.includes(v.evidence_level as string)) e.push(`evidence_level은 ${EVIDENCE.join('·')}`)
      str('note')
      if ((v.screenshot_path == null) !== (v.screenshot_thumb_path == null)) e.push('스크린샷과 썸네일은 함께 있어야 함')
      break
    case 'game_aliases': case 'map_aliases':
      if (typeof v.lang !== 'string' || !/^[a-z]{2}$/.test(v.lang)) e.push('언어는 ko·en 같은 두 글자')
      break
  }
  return e
}

/** 제보 이미지(비공개 버킷)를 가리키는 경로. 반영할 때 공개 버킷으로 복사한다. */
export const SUBMISSION_PREFIX = 'submission:'

/** 국가·주·도 표준 이름과 대표 지점(public/geo) */
export interface GeoPoint { code: string; name: string; point: [number, number] }
let countries: (GeoPoint & { pointIsCapital: boolean })[] | null = null
export function country(code: string) {
  countries ??= readJson('public/geo/countries.json')
  return countries!.find((c) => c.code === code) ?? null
}
export function admin1(countryCode: string, code: string): GeoPoint | null {
  const path = `public/geo/admin1/${countryCode}.json`
  if (!existsSync(path)) return null
  const fc = readJson<{ features: { properties: GeoPoint }[] }>(path)
  return fc.features.find((f) => f.properties.code === code)?.properties ?? null
}

// ───────────── 작업 상태 ─────────────
// 작업은 한 번에 하나: 직접 수정(검수기 탭 1, import-names) 또는 제보 처리(inbox → worklist.json).
// 깨끗함 = 작업 파일이 뽑았을 때의 사본(base.json)과 같음.

export type Mode = 'none' | 'clean' | 'manual' | 'inbox'
export function workState(): { mode: Mode; changed: number; pulledAt: string | null } {
  if (!existsSync(FILES.base)) return { mode: 'none', changed: 0, pulledAt: null }
  const base = readJson<{ atlas: AtlasFile; names: NamesFile }>(FILES.base)
  const was = flatten(base.atlas, base.names)
  const now = flatten(readJson<AtlasFile>(FILES.atlas), readJson<NamesFile>(FILES.names))
  const canon = (v: unknown) => JSON.stringify(v, Object.keys((v ?? {}) as object).sort())
  let changed = 0
  for (const k of new Set([...was.keys(), ...now.keys()])) if (canon(was.get(k)?.values) !== canon(now.get(k)?.values)) changed++
  const mode: Mode = existsSync(FILES.worklist) ? 'inbox' : changed ? 'manual' : 'clean'
  return { mode, changed, pulledAt: base.atlas.exported_at }
}
export const MODE_LABEL: Record<Mode, string> = { none: '작업 파일 없음', clean: '깨끗함', manual: '직접 수정 중', inbox: '제보 처리 중' }
