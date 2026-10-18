// '검토 대기' 제보·수정 제안을 가져와 작업 목록(data/.review/worklist.json)에 올리고,
// 구조화된 칸(맵·국가·주·도·좌표·근거 수준·근거 URL·이미지)은 data/atlas.json에 바로 반영한다.
// 문장으로 된 부분(새 장소 이름, 기존 장소와 같은지, 시대, 수정 제안의 "어떻게")은 각 항목의 todo로 남긴다
// → 어시스턴트가 채운다. 이미 작업 목록에 있는 항목은 건너뛴다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FILES, SUBMISSION_PREFIX, adminClient, admin1, country, lit, readJson, readJsonIf, sql, workState, writeJson,
  type AtlasFile, type Image, type NamesFile,
} from './lib.ts'

export interface WorkItem {
  id: string
  kind: 'submission' | 'suggestion'
  created_at: string
  /** 요청 내용 요약(검수기 Note에 보인다) */
  request: string
  /** 요청 이유·설명(제보 설명, 수정 제안의 "왜") */
  why: string | null
  /** 어시스턴트 판단 메모(무엇을 왜 그렇게 고쳤는지) */
  memo: string | null
  /** 이 항목 때문에 바뀌는 행 키. 어시스턴트가 id를 바꾸거나 행을 더하면 함께 고친다. */
  touches: string[]
  /** 어시스턴트가 할 일. 끝나면 비운다. */
  todo: string[]
  /** 전부 반려할 때 제보자에게 보일 사유 초안 */
  reject_reason: string | null
  /** 같은 주·도(또는 국가)의 기존 장소 */
  candidates?: { id: string; name: string | null; region: string | null }[]
  /** 검수기에서 볼 제보 이미지(받아 둔 썸네일, data/ 기준 경로) */
  images: { role: 'screenshot' | 'place_photo'; local: string }[]
  /** 제보자가 폼에 입력한 값 그대로(읽기 전용 · 어시스턴트가 고치지 않는다). 개인정보는 넣지 않는다. */
  original: SubmissionOriginal | SuggestionOriginal
  /** inbox 때 original의 해시. diff가 지금 값(파일·DB)과 비교해 다르면 경고한다. */
  original_hash: string
}
export interface SubmissionOriginal {
  game_name: string; map_name: string; wiki_url: string | null; country: string; region: string | null
  lat: number | null; lng: number | null; evidence_level: string; source_url: string | null; description: string | null
  screenshot: boolean; place_photo: boolean
}
export interface SuggestionOriginal {
  fields: string[]; proposal: string; reason: string; reference_url: string | null
  country: string | null; region: string | null; location_precision: string | null
}
export interface Worklist { format: 'fps-atlas-worklist/1'; created_at: string; items: WorkItem[] }

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

interface SubmissionRow {
  id: number; code: string; created_at: string
  game_id: string | null; game_name: string; map_id: string | null; map_name: string; wiki_url: string | null
  country: string; country_code: string; region: string | null; admin1_code: string | null; lat: number | null; lng: number | null
  evidence_level: string; source_url: string | null; description: string | null
  screenshot_path: string | null; screenshot_thumb_path: string | null; place_photo_path: string | null; place_photo_thumb_path: string | null
}
interface SuggestionRow {
  id: number; code: string; created_at: string; map_id: string; place_id: string
  fields: string[]; proposal: string; reason: string; reference_url: string | null
  country: string | null; country_code: string | null; region: string | null; admin1_code: string | null; location_precision: string | null
}

// 원문: DB 행의 사용자 입력 칸을 가공 없이(trim도 하지 않음). 칸 순서가 해시에 들어가므로 여기서만 만든다.
const submissionOriginal = (s: SubmissionRow): SubmissionOriginal => ({
  game_name: s.game_name, map_name: s.map_name, wiki_url: s.wiki_url, country: s.country, region: s.region,
  lat: s.lat, lng: s.lng, evidence_level: s.evidence_level, source_url: s.source_url, description: s.description,
  screenshot: !!s.screenshot_path, place_photo: !!s.place_photo_path,
})
const suggestionOriginal = (e: SuggestionRow): SuggestionOriginal => ({
  fields: e.fields, proposal: e.proposal, reason: e.reason, reference_url: e.reference_url,
  country: e.country, region: e.region, location_precision: e.location_precision,
})
export const originalHash = (o: WorkItem['original']) => createHash('sha256').update(JSON.stringify(o)).digest('hex')

const SUBMISSION_SELECT = `s.id, s.code, s.created_at, s.game_id, s.game_name, s.map_id, s.map_name, s.wiki_url,
  s.country, s.country_code, s.region, s.admin1_code, s.lat, s.lng, s.evidence_level, s.source_url, s.description,
  s.screenshot_path, s.screenshot_thumb_path, s.place_photo_path, s.place_photo_thumb_path`
const SUGGESTION_SELECT = `e.id, e.code, e.created_at, mp.map_id, mp.place_id, e.fields, e.proposal, e.reason, e.reference_url,
  e.country, e.country_code, e.region, e.admin1_code, e.location_precision`

/** 작업 목록 항목들의 지금 DB 원문(diff가 inbox 때와 비교한다). 행이 없으면 빠진다. */
export async function readOriginals(codes: string[]): Promise<Map<string, WorkItem['original']>> {
  const out = new Map<string, WorkItem['original']>()
  if (!codes.length) return out
  const list = codes.map(lit).join(', ')
  for (const s of await sql<SubmissionRow>(`select ${SUBMISSION_SELECT} from public.submissions s where s.code in (${list})`)) out.set(s.code, submissionOriginal(s))
  for (const e of await sql<SuggestionRow>(`select ${SUGGESTION_SELECT} from public.edit_suggestions e
    join public.map_places mp on mp.id = e.map_place_id where e.code in (${list})`)) out.set(e.code, suggestionOriginal(e))
  return out
}

export async function inbox() {
  if (!existsSync(FILES.base)) throw new Error('먼저 pull로 데이터를 뽑으세요.')
  const state = workState()
  if (state.mode === 'manual') throw new Error(`직접 수정 중인 내용이 있습니다(바뀐 행 ${state.changed}개). 제보 처리와 섞이지 않게 먼저 diff → apply로 반영하거나 pull --force로 버리세요.`)
  const atlas = readJson<AtlasFile>(FILES.atlas)
  const names = readJson<NamesFile>(FILES.names)
  const list: Worklist = readJsonIf<Worklist>(FILES.worklist) ?? { format: 'fps-atlas-worklist/1', created_at: new Date().toISOString(), items: [] }
  const known = new Set(list.items.map((i) => i.id))

  const subs = await sql<SubmissionRow & { nickname: string | null }>(`
    select ${SUBMISSION_SELECT}, p.nickname
    from public.submissions s left join public.profiles p on p.id = s.user_id
    where s.status = '검토 대기' order by s.id`)
  const sugs = await sql<SuggestionRow>(`
    select ${SUGGESTION_SELECT}
    from public.edit_suggestions e join public.map_places mp on mp.id = e.map_place_id
    where e.status = '검토 대기' order by e.id`)

  const storage = adminClient().storage.from('submission-images')
  async function thumb(code: string, role: WorkItem['images'][number]['role'], path: string | null) {
    if (!path) return []
    const { data, error } = await storage.download(path)
    if (error) { console.warn(`  ${code} ${role} 썸네일을 받지 못함: ${error.message}`); return [] }
    mkdirSync(FILES.images, { recursive: true })
    const local = join('.review', 'images', `${code.toLowerCase()}-${role}.webp`).replace(/\\/g, '/')
    writeFileSync(join('data', local), Buffer.from(await data.arrayBuffer()))
    return [{ role, local }]
  }
  /** 국가·주·도 표준 이름과 기본 좌표(주·도 대표 지점, 없으면 수도) */
  function location(countryCode: string, admin1Code: string | null, fallbackCountry: string) {
    const c = country(countryCode)
    const a = admin1Code ? admin1(countryCode, admin1Code) : null
    const point = a?.point ?? c?.point ?? null
    return {
      country: c?.name ?? fallbackCountry, country_code: countryCode,
      region: a?.name ?? null, admin1_code: a ? admin1Code : null,
      location_precision: a ? '주·도' : '국가',
      lat: point ? point[1] : 0, lng: point ? point[0] : 0, pointKnown: !!point,
    }
  }

  let added = 0
  for (const s of subs) {
    if (known.has(s.code)) continue
    // 공개 출처는 닉네임(실명을 쓰지 않는다)
    const credit = `제보자 직접 촬영 · ${s.nickname ?? '사용자'}`
    const touches: string[] = []
    const todo: string[] = []

    // 게임·맵: 목록에서 고른 맵이면 그대로, 아니면 새로 만든다(같은 게임에 같은 이름의 맵이 있으면 그 맵)
    let gid = s.game_id && atlas.games[s.game_id] ? s.game_id : null
    if (!gid) {
      gid = Object.entries(atlas.games).find(([, g]) => g.name.toLowerCase() === s.game_name.trim().toLowerCase())?.[0] ?? slug(s.game_name)
      if (!atlas.games[gid]) {
        atlas.games[gid] = { name: s.game_name.trim(), series: null, release_year: null, maps: {} }
        names.games[gid] = { aliases: {}, maps: {} }
        touches.push(`games:${gid}`)
        todo.push(`새 게임 ${gid}: id·이름·시리즈·출시 연도 확인`)
      }
    }
    const game = atlas.games[gid]
    let mid = s.map_id && game.maps[s.map_id] ? s.map_id : null
    mid ??= Object.entries(game.maps).find(([, m]) => m.name.toLowerCase() === s.map_name.trim().toLowerCase())?.[0] ?? null
    if (!mid) {
      mid = `${gid}--${slug(s.map_name) || s.code.toLowerCase()}`
      game.maps[mid] = { name: s.map_name.trim(), era: null, wiki_url: s.wiki_url, verified: true, places: {} }
      names.games[gid].maps[mid] = {}
      touches.push(`maps:${mid}`)
      todo.push(`새 맵 ${mid}: 시대(era) 정하기, id·영문 공식명 확인`)
    }

    // 장소: 새 장소 자리를 만든다. 이름·id는 어시스턴트가 정하거나, 기존 장소(candidates)로 바꾼다.
    const pid = `new-${s.code.toLowerCase()}`
    const loc = location(s.country_code, s.admin1_code, s.country)
    const photo: Image | null = s.place_photo_path && s.place_photo_thumb_path
      ? { path: SUBMISSION_PREFIX + s.place_photo_path, thumb_path: SUBMISSION_PREFIX + s.place_photo_thumb_path, credit } : null
    atlas.places[pid] = {
      name: null, name_en: null, country: loc.country, country_code: loc.country_code, region: loc.region, admin1_code: loc.admin1_code,
      location_precision: loc.location_precision, lat: s.lat ?? loc.lat, lng: s.lng ?? loc.lng, wikipedia_title_en: null, photo, commons: null, verified: true,
    }
    game.maps[mid].places[pid] = {
      evidence_level: s.evidence_level, sources: s.source_url ? [s.source_url.trim()] : [], note: s.description?.trim() || null,
      screenshot: s.screenshot_path && s.screenshot_thumb_path
        ? { path: SUBMISSION_PREFIX + s.screenshot_path, thumb_path: SUBMISSION_PREFIX + s.screenshot_thumb_path, credit } : null,
      verified: true,
    }
    touches.push(`places:${pid}`, `map_places:${mid}|${pid}`, ...(s.source_url ? [`map_place_sources:${mid}|${pid}|${s.source_url.trim()}`] : []))
    todo.push(`장소 ${pid}: 기존 장소(candidates)와 같으면 연결을 그 장소로 옮기고 이 자리는 지우기, 새 장소면 이름(name)·id 정하기(id를 바꾸면 touches도)`)
    todo.push('좌표: 주·도 대표 지점 또는 수도로 들어가 있음 · 실제 위치로 고치기')
    if (!loc.pointKnown) todo.push('국가·주·도 대표 지점을 찾지 못해 좌표가 0,0 · 반드시 고치기')
    const candidates = Object.entries(atlas.places)
      .filter(([id, p]) => id !== pid && p.country_code === s.country_code && (!s.admin1_code || p.admin1_code === s.admin1_code))
      .map(([id, p]) => ({ id, name: p.name, region: p.region }))

    list.items.push({
      id: s.code, kind: 'submission', created_at: s.created_at,
      request: `장소 제보 · ${s.game_name} / ${s.map_name} → ${[loc.country, loc.region].filter(Boolean).join(' > ')} · 근거 ${s.evidence_level}${s.source_url ? ` (${s.source_url})` : ''}`,
      why: s.description?.trim() || null, memo: null, touches, todo, reject_reason: null, candidates,
      images: [...await thumb(s.code, 'screenshot', s.screenshot_thumb_path), ...await thumb(s.code, 'place_photo', s.place_photo_thumb_path)],
      original: submissionOriginal(s), original_hash: originalHash(submissionOriginal(s)),
    })
    added++
  }

  for (const e of sugs) {
    if (known.has(e.code)) continue
    const gid = Object.entries(atlas.games).find(([, g]) => g.maps[e.map_id])?.[0]
    const link = gid ? atlas.games[gid].maps[e.map_id].places[e.place_id] : undefined
    const touches = [`map_places:${e.map_id}|${e.place_id}`]
    const todo: string[] = []
    if (!link) todo.push(`대상 연결 ${e.map_id}|${e.place_id}가 파일에 없음 · 이미 지워졌는지 확인`)
    if (e.fields.includes('위치') && e.country_code && !atlas.places[e.place_id]) {
      todo.push('대상 장소가 파일에 없음 · 위치 제안을 반영할 수 없음')
    } else if (e.fields.includes('위치') && e.country_code) {
      const loc = location(e.country_code, e.admin1_code, e.country ?? '')
      Object.assign(atlas.places[e.place_id], {
        country: loc.country, country_code: loc.country_code, region: loc.region, admin1_code: loc.admin1_code,
        location_precision: loc.location_precision, lat: loc.lat, lng: loc.lng,
      })
      touches.push(`places:${e.place_id}`)
      todo.push('위치: 제안한 국가·주·도로 바꾸고 좌표를 대표 지점으로 넣어 둠 · 실제 위치로 고치기(이 장소에 연결된 다른 맵도 함께 바뀜)')
    }
    const others = e.fields.filter((f) => f !== '위치')
    if (others.length) todo.push(`제안 내용대로 고치기: ${others.join(', ')}${e.reference_url ? ` (참고 URL ${e.reference_url})` : ''}`)
    list.items.push({
      id: e.code, kind: 'suggestion', created_at: e.created_at,
      request: `수정 제안 · ${e.map_id} ↔ ${e.place_id} · 고칠 항목 ${e.fields.join(', ')}\n어떻게: ${e.proposal}${e.reference_url ? `\n참고 URL: ${e.reference_url}` : ''}`,
      why: e.reason, memo: null, touches, todo, reject_reason: null, images: [],
      original: suggestionOriginal(e), original_hash: originalHash(suggestionOriginal(e)),
    })
    added++
  }

  writeJson(FILES.atlas, atlas)
  writeJson(FILES.names, names)
  writeJson(FILES.worklist, list)
  const pending = list.items.filter((i) => i.todo.length).length
  console.log(`새 항목 ${added}건 (제보 ${subs.length} · 수정 제안 ${sugs.length} 대기 중) → ${FILES.worklist}`)
  if (pending) console.log(`어시스턴트가 채울 항목 ${pending}건 · 각 항목의 todo를 보고 data/atlas.json을 고친 뒤 todo를 비우세요.`)
}
