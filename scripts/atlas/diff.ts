// 작업 파일(data/atlas.json, names.json)과 원본 사본(.review/base.json)을 비교해 바뀐 행만 골라내고,
// 그 행들만 DB에서 새로 읽어 data/.review/diff.json을 만든다(검수기 탭 2가 읽는다).
// - 이전 칸 = 방금 읽은 DB 값. DB 값이 원본 사본과 다르면 그 사이 누가 고친 것 → "DB 충돌"
// - 변경 단위: 새 행·삭제는 행 하나, 수정은 필드 하나(이미지 경로·썸네일·출처 표기는 한 묶음)
// - 작업 목록(worklist)의 touches로 제보·수정 제안별로 묶고, 나머지는 게임별로 묶는다.
import { existsSync } from 'node:fs'
import {
  EVIDENCE, FILES, SUBMISSION_PREFIX, TABLE_LABEL, TABLE_ORDER, checkRow, flatten, lit, readJson, readJsonIf, sha256, sql, writeJson,
  type AtlasFile, type FlatRow, type NamesFile, type Row, type Table,
} from './lib.ts'
import type { WorkItem, Worklist } from './inbox.ts'

export interface Unit {
  id: string
  row: string
  table: Table
  op: 'insert' | 'update' | 'delete'
  /** 수정일 때 필드(이미지는 screenshot·photo·commons 묶음 이름) */
  field: string | null
  game: string
  key: Record<string, string>
  /** 방금 읽은 DB 값(새 행이면 null) */
  before: unknown
  /** 작업 파일의 값(삭제면 null) */
  after: unknown
  conflict: string | null
  errors: string[]
  flags: string[]
  /** 이 단위를 고르려면 함께 골라야 하는 단위 */
  requires: string[]
  /** 이 단위를 가리키는 작업 목록 항목들(같은 내용의 제보 여러 건이 한 행을 함께 가리킬 수 있다) */
  items: string[]
}
export interface Group { id: string; kind: 'item' | 'game'; title: string; units: string[]; item?: WorkItem }
export interface DiffFile {
  format: 'fps-atlas-diff/1'
  created_at: string
  hashes: { atlas: string; names: string; worklist: string | null }
  units: Unit[]
  groups: Group[]
  /** 둘 이상의 항목이 함께 가리키는 행(오류가 아니라 의도된 병합) */
  shared: { row: string; items: string[] }[]
  warnings: string[]
}

const IMAGE_GROUPS: Record<string, string[]> = {
  screenshot: ['screenshot_path', 'screenshot_thumb_path', 'screenshot_credit'],
  photo: ['photo_path', 'photo_thumb_path', 'photo_credit'],
  commons: ['commons_file', 'commons_author', 'commons_license'],
}
const FOLDED = new Set(Object.values(IMAGE_GROUPS).flat())
/** 키 순서와 관계없이 같은 값인지(DB에서 읽은 행과 파일의 행은 키 순서가 다르다) */
const canon = (v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)])) : v ?? null
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const pick = (v: Row, fields: string[]) => (fields.every((f) => v[f] == null) ? null : Object.fromEntries(fields.map((f) => [f, v[f] ?? null])))

/** 바뀐 행들의 DB 현재 값을 표별로 한 번씩 읽는다(행 키 → 펼친 값, 없으면 없음) */
async function readCurrent(rows: FlatRow[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>()
  const by = (t: Table) => rows.filter((r) => r.table === t)
  const inList = (rs: FlatRow[], cols: string[]) => rs.map((r) => `(${cols.map((c) => lit(r.key[c])).join(', ')})`).join(', ')
  const run = async (t: Table, cols: string[], select: string) => {
    const rs = by(t)
    if (!rs.length) return
    for (const row of await sql<Row>(select.replace('$IN', inList(rs, cols)))) {
      const key = `${t}:${cols.map((c) => row[`k_${c}`]).join('|')}`
      const values = { ...row }
      for (const c of cols) delete values[`k_${c}`]
      out.set(key, values)
    }
  }
  await run('games', ['id'], `select id as k_id, name, series, release_year from public.games where (id) in ($IN)`)
  await run('maps', ['id'], `select id as k_id, game_id, name, era, wiki_url, verified from public.maps where (id) in ($IN)`)
  await run('places', ['id'], `select id as k_id, name, name_en, country, country_code, region, admin1_code, location_precision, lat, lng,
    wikipedia_title_en, verified, photo_path, photo_thumb_path, photo_credit, commons_file, commons_author, commons_license from public.places where (id) in ($IN)`)
  await run('map_places', ['map_id', 'place_id'], `select map_id as k_map_id, place_id as k_place_id, evidence_level, note, verified,
    screenshot_path, screenshot_thumb_path, screenshot_credit from public.map_places where (map_id, place_id) in ($IN)`)
  await run('map_place_sources', ['map_id', 'place_id', 'url'], `select m.map_id as k_map_id, m.place_id as k_place_id, s.url as k_url
    from public.map_place_sources s join public.map_places m on m.id = s.map_place_id where (m.map_id, m.place_id, s.url) in ($IN)`)
  await run('game_aliases', ['game_id', 'alias'], `select game_id as k_game_id, alias as k_alias, lang from public.game_aliases where (game_id, alias) in ($IN)`)
  await run('map_aliases', ['map_id', 'alias'], `select map_id as k_map_id, alias as k_alias, lang from public.map_aliases where (map_id, alias) in ($IN)`)
  return out
}

export async function diff() {
  if (!existsSync(FILES.base)) throw new Error('먼저 pull로 데이터를 뽑으세요.')
  const base = readJson<{ atlas: AtlasFile; names: NamesFile }>(FILES.base)
  const atlas = readJson<AtlasFile>(FILES.atlas)
  const names = readJson<NamesFile>(FILES.names)
  const worklist = readJsonIf<Worklist>(FILES.worklist)
  const was = flatten(base.atlas, base.names)
  const now = flatten(atlas, names)

  const changedKeys = [...new Set([...was.keys(), ...now.keys()])].filter((k) => !same(was.get(k)?.values, now.get(k)?.values))
  const changedRows = changedKeys.map((k) => (now.get(k) ?? was.get(k))!)
  const current = await readCurrent(changedRows)

  const itemOf = new Map<string, string[]>()
  for (const it of worklist?.items ?? []) for (const k of new Set(it.touches)) itemOf.set(k, [...(itemOf.get(k) ?? []), it.id])
  const gameName = (gid: string) => atlas.games[gid]?.name ?? base.atlas.games[gid]?.name ?? gid
  const linksOfPlace = (pid: string) => Object.values(atlas.games).flatMap((g) => Object.values(g.maps)).filter((m) => m.places[pid]).length

  const units: Unit[] = []
  const warnings: string[] = []
  for (const k of changedKeys) {
    const oldRow = was.get(k)
    const newRow = now.get(k)
    const row = (newRow ?? oldRow)!
    const db = current.get(k) ?? null
    const common = { row: k, table: row.table, game: row.game, key: row.key, items: itemOf.get(k) ?? [], requires: [] as string[] }
    if (!oldRow) {
      const errors = checkRow(newRow!)
      const flags: string[] = []
      if (Object.values(newRow!.values).some((v) => typeof v === 'string' && v.startsWith(SUBMISSION_PREFIX))) flags.push('제보 이미지 복사')
      units.push({ ...common, id: k, op: 'insert', field: null, before: db, after: newRow!.values, errors, flags, conflict: db ? '그 사이 DB에 같은 행이 생김' : null })
    } else if (!newRow) {
      const errors = ['games', 'maps', 'places'].includes(row.table) ? [`${TABLE_LABEL[row.table]}는 지울 수 없음(연결을 지우세요)`] : []
      // 연결을 지우면 그 근거 출처는 DB에서 함께 지워진다
      if (row.table === 'map_place_sources' && !now.has(`map_places:${row.key.map_id}|${row.key.place_id}`)) continue
      units.push({ ...common, id: k, op: 'delete', field: null, before: db, after: null, errors, flags: ['삭제'], conflict: db ? (same(db, oldRow.values) ? null : '그 사이 DB 값이 바뀜') : '이미 DB에 없음' })
    } else {
      const errors = checkRow(newRow)
      const fields = [...new Set([...Object.keys(oldRow.values), ...Object.keys(newRow.values)])]
      const units0: [string, unknown, unknown, unknown][] = []
      for (const f of fields) if (!FOLDED.has(f) && !same(oldRow.values[f], newRow.values[f])) units0.push([f, oldRow.values[f], newRow.values[f], db?.[f]])
      for (const [g, fs] of Object.entries(IMAGE_GROUPS)) {
        if (!fs.some((f) => f in newRow.values)) continue
        const a = pick(oldRow.values, fs), b = pick(newRow.values, fs)
        if (!same(a, b)) units0.push([g, a, b, db ? pick(db, fs) : null])
      }
      for (const [f, a, b, d] of units0) {
        const flags: string[] = []
        if (f === 'evidence_level' && EVIDENCE.indexOf(b as string) > EVIDENCE.indexOf(a as string)) flags.push('근거 수준 하향')
        if (f in IMAGE_GROUPS && a && !b) flags.push('이미지 삭제')
        if (f in IMAGE_GROUPS && b && JSON.stringify(b).includes(SUBMISSION_PREFIX)) flags.push('제보 이미지 복사')
        if (row.table === 'places' && ['lat', 'lng', 'country_code', 'admin1_code'].includes(f) && linksOfPlace(row.key.id) > 1) flags.push(`연결된 맵 ${linksOfPlace(row.key.id)}개에 함께 적용`)
        units.push({
          ...common, id: `${k}#${f}`, op: 'update', field: f, before: db ? d : null, after: b, errors, flags,
          conflict: !db ? 'DB에 행이 없음' : same(d, a) ? null : '그 사이 DB 값이 바뀜',
        })
      }
    }
  }

  // 새 행끼리의 의존: 연결 → 맵·장소, 출처 → 연결, 맵 → 게임, 별칭 → 게임·맵
  const inserted = new Set(units.filter((u) => u.op === 'insert').map((u) => u.row))
  const need = (u: Unit, rowKey: string) => { if (inserted.has(rowKey)) u.requires.push(rowKey) }
  for (const u of units) {
    if (u.op !== 'insert') continue
    if (u.table === 'maps') need(u, `games:${(u.after as Row).game_id}`)
    if (u.table === 'map_places') { need(u, `maps:${u.key.map_id}`); need(u, `places:${u.key.place_id}`) }
    if (u.table === 'map_place_sources') need(u, `map_places:${u.key.map_id}|${u.key.place_id}`)
    if (u.table === 'game_aliases') need(u, `games:${u.key.game_id}`)
    if (u.table === 'map_aliases') need(u, `maps:${u.key.map_id}`)
    if (u.table === 'places' && !Object.values(atlas.games).some((g) => Object.values(g.maps).some((m) => m.places[u.key.id]))) u.errors.push('어느 맵과도 연결되지 않은 장소')
  }
  units.sort((a, b) => TABLE_ORDER.indexOf(a.table) - TABLE_ORDER.indexOf(b.table) || a.id.localeCompare(b.id))

  // 묶음: 작업 목록 항목별 → 나머지는 게임별
  const groups: Group[] = []
  for (const it of worklist?.items ?? []) {
    groups.push({ id: it.id, kind: 'item', title: it.request.split('\n')[0], item: it, units: units.filter((u) => u.items.includes(it.id)).map((u) => u.id) })
    if (it.todo.length) warnings.push(`${it.id}: 어시스턴트가 아직 끝내지 않은 일 ${it.todo.length}개`)
    const missing = it.touches.filter((t) => !changedKeys.includes(t))
    if (missing.length) warnings.push(`${it.id}: touches에 있지만 바뀌지 않은 행 ${missing.join(', ')}`)
  }
  const stray = units.filter((u) => !u.items.length).length
  if (worklist && stray) warnings.push(`제보 처리 중인데 작업 목록에 없는 변경 ${stray}건이 섞여 있음(touches 누락 또는 직접 수정) · 게임별 묶음에서 확인`)
  const byGame = new Map<string, string[]>()
  for (const u of units) if (!u.items.length) { if (!byGame.has(u.game)) byGame.set(u.game, []); byGame.get(u.game)!.push(u.id) }
  for (const [gid, ids] of [...byGame].sort(([a], [b]) => gameName(a).localeCompare(gameName(b)))) {
    groups.push({ id: `game:${gid}`, kind: 'game', title: gid ? gameName(gid) : '어느 게임에도 속하지 않은 변경', units: ids })
  }

  const out: DiffFile = {
    format: 'fps-atlas-diff/1', created_at: new Date().toISOString(),
    hashes: { atlas: sha256(FILES.atlas), names: sha256(FILES.names), worklist: worklist ? sha256(FILES.worklist) : null },
    units, groups, warnings,
    shared: [...itemOf].filter(([row, ids]) => ids.length > 1 && changedKeys.includes(row)).map(([row, items]) => ({ row, items })),
  }
  writeJson(FILES.diff, out)
  const count = (op: Unit['op']) => units.filter((u) => u.op === op).length
  console.log(`차이 ${units.length}건 (추가 ${count('insert')} · 수정 ${count('update')} · 삭제 ${count('delete')}) · 묶음 ${groups.length} → ${FILES.diff}`)
  const bad = units.filter((u) => u.errors.length).length, conflicts = units.filter((u) => u.conflict).length
  if (bad) console.log(`  오류 ${bad}건(고를 수 없음)`)
  if (conflicts) console.log(`  DB 충돌 ${conflicts}건`)
  for (const s of out.shared) console.log(`  함께 반영: ${s.row} ← ${s.items.join(', ')}`)
  for (const w of warnings) console.log(`  주의: ${w}`)
}
