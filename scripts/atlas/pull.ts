// DB 전체를 data/atlas.json, data/names.json으로 뽑고, 비교 기준 사본을 data/.review/base.json에 둔다.
// 검수 중인 작업(작업 목록·차이·결정)이 있으면 덮어쓰지 않고 멈춘다(--force로 버림).
import { appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  FILES, HISTORY, MODE_LABEL, REVIEW, readJsonIf, sql, workState, writeJson,
  type AtlasFile, type GameEntry, type Image, type NamesFile, type PlaceEntry,
} from './lib.ts'

interface Dump {
  games: { id: string; name: string; series: string | null; release_year: number | null }[]
  maps: { id: string; game_id: string; name: string; era: string; wiki_url: string | null; verified: boolean }[]
  places: (Omit<PlaceEntry, 'photo' | 'commons'> & {
    id: string; photo_path: string | null; photo_thumb_path: string | null; photo_credit: string | null
    commons_file: string | null; commons_author: string | null; commons_license: string | null
  })[]
  links: {
    map_id: string; place_id: string; evidence_level: string; note: string | null; verified: boolean
    screenshot_path: string | null; screenshot_thumb_path: string | null; screenshot_credit: string | null; sources: string[]
  }[]
  game_aliases: { game_id: string; alias: string; lang: string }[]
  map_aliases: { map_id: string; alias: string; lang: string }[]
}

const DUMP_SQL = `
select json_build_object(
  'games', (select coalesce(json_agg(g order by g.id), '[]') from (select id, name, series, release_year from public.games) g),
  'maps', (select coalesce(json_agg(m order by m.id), '[]') from (select id, game_id, name, era, wiki_url, verified from public.maps) m),
  'places', (select coalesce(json_agg(p order by p.id), '[]') from (
    select id, name, name_en, country, country_code, region, admin1_code, location_precision, lat, lng, wikipedia_title_en, verified,
           photo_path, photo_thumb_path, photo_credit, commons_file, commons_author, commons_license from public.places) p),
  'links', (select coalesce(json_agg(l order by l.map_id, l.place_id), '[]') from (
    select mp.map_id, mp.place_id, mp.evidence_level, mp.note, mp.verified, mp.screenshot_path, mp.screenshot_thumb_path, mp.screenshot_credit,
           coalesce((select json_agg(s.url order by s.id) from public.map_place_sources s where s.map_place_id = mp.id), '[]') as sources
    from public.map_places mp) l),
  'game_aliases', (select coalesce(json_agg(a order by a.game_id, a.alias), '[]') from (select game_id, alias, lang from public.game_aliases) a),
  'map_aliases', (select coalesce(json_agg(a order by a.map_id, a.alias), '[]') from (select map_id, alias, lang from public.map_aliases) a)
) as dump`

export async function pull({ force = false, afterApply = false } = {}) {
  // 고친 내용이 남아 있으면 덮어쓰지 않는다(직접 수정·제보 처리 모두). --force는 버린다.
  const state = workState()
  if (state.mode === 'manual' || state.mode === 'inbox') {
    if (!force) throw new Error(`${MODE_LABEL[state.mode]}입니다(바뀐 행 ${state.changed}개). 반영(apply)하거나, 버리려면 pull --force.`)
    if (!afterApply) {
      console.log(`고친 내용 ${state.changed}행${state.mode === 'inbox' ? '과 작업 목록' : ''}을 버립니다.`)
      // 무엇을 버렸는지 한 줄 남긴다
      const ids = readJsonIf<{ items: { id: string }[] }>(FILES.worklist)?.items.map((i) => i.id) ?? []
      mkdirSync(HISTORY, { recursive: true })
      appendFileSync(join(HISTORY, 'discarded.log'), `${new Date().toISOString()}\t${MODE_LABEL[state.mode]}\t버린 행 ${state.changed}\t작업 목록 ${ids.join(',') || '-'}\n`)
    }
  }
  if (existsSync(FILES.decisions) && !force) throw new Error('검수 결정(decisions.json)이 남아 있습니다. 반영하거나 pull --force.')
  rmSync(REVIEW, { recursive: true, force: true })

  const [{ dump }] = await sql<{ dump: Dump }>(DUMP_SQL)
  const exported_at = new Date().toISOString()
  const img = (path: string | null, thumb: string | null, credit: string | null): Image | null => (path && thumb ? { path, thumb_path: thumb, credit } : null)

  const places: AtlasFile['places'] = {}
  for (const p of dump.places) {
    places[p.id] = {
      name: p.name, name_en: p.name_en, country: p.country, country_code: p.country_code, region: p.region, admin1_code: p.admin1_code,
      location_precision: p.location_precision, lat: p.lat, lng: p.lng, wikipedia_title_en: p.wikipedia_title_en,
      photo: img(p.photo_path, p.photo_thumb_path, p.photo_credit),
      commons: p.commons_file ? { file: p.commons_file, author: p.commons_author, license: p.commons_license } : null,
      verified: p.verified,
    }
  }
  const games: Record<string, GameEntry> = {}
  for (const g of dump.games) games[g.id] = { name: g.name, series: g.series, release_year: g.release_year, maps: {} }
  for (const m of dump.maps) games[m.game_id].maps[m.id] = { name: m.name, era: m.era, wiki_url: m.wiki_url, verified: m.verified, places: {} }
  const gameOfMap = new Map(dump.maps.map((m) => [m.id, m.game_id]))
  for (const l of dump.links) {
    games[gameOfMap.get(l.map_id)!].maps[l.map_id].places[l.place_id] = {
      evidence_level: l.evidence_level, sources: l.sources, note: l.note,
      screenshot: img(l.screenshot_path, l.screenshot_thumb_path, l.screenshot_credit), verified: l.verified,
    }
  }
  const atlas: AtlasFile = { format: 'fps-atlas-data/1', exported_at, places, games }

  const names: NamesFile = { format: 'fps-atlas-names/1', exported_at, games: {} }
  for (const g of dump.games) names.games[g.id] = { aliases: {}, maps: Object.fromEntries(dump.maps.filter((m) => m.game_id === g.id).map((m) => [m.id, {}])) }
  for (const a of dump.game_aliases) (names.games[a.game_id].aliases[a.lang] ??= []).push(a.alias)
  for (const a of dump.map_aliases) (names.games[gameOfMap.get(a.map_id)!].maps[a.map_id][a.lang] ??= []).push(a.alias)

  writeJson(FILES.atlas, atlas)
  writeJson(FILES.names, names)
  writeJson(FILES.base, { atlas, names })
  console.log(`뽑기 완료: 게임 ${dump.games.length} · 맵 ${dump.maps.length} · 장소 ${dump.places.length} · 연결 ${dump.links.length} · 별칭 ${dump.game_aliases.length + dump.map_aliases.length}`)
}
