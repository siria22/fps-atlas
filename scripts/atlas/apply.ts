// 검수기에서 고른 변경을 DB에 반영한다.
// 읽는 파일: .review/diff.json(바뀐 행·DB 값), .review/decisions.json(고른 것), .review/worklist.json(제보·수정 제안)
// - diff를 만든 뒤 작업 파일이 바뀌었으면 멈춘다(diff부터 다시).
// - 하나의 DO 블록(한 트랜잭션)으로 실행한다. 각 문장은 DB 값이 diff 때 읽은 값과 같을 때만 바꾸고,
//   하나라도 맞지 않으면 전부 되돌린다.
// - 제보·수정 제안: 하나라도 채택하면 승인, 전부 제외하면 반려(사유 필수). 그 사이 관리 화면에서 처리된 것은 건너뛴다.
// - 지도에 안 보이는 결과는 막는다: 미결정이 남음, 연결 없이 승인하는 제보, 채택한 연결이 없는 새 맵·새 장소.
// - 제보 이미지는 DB 반영 전에 공개 버킷으로 복사하고, 실패하면 지운다. 바뀌거나 비운 기존 공개 이미지는 반영 뒤 지운다.
// - 성공하면 data/.history/<시각>/에 실행 SQL·결정·작업 목록·반영 전 DB 사본·요약을 남기고,
//   .review/를 지운 뒤 DB에서 다시 뽑는다(제외한 내용은 파일에서도 사라진다).
// - 제보 이미지는 관리 화면과 같은 경로(submissions/<제보 번호>/screenshot.webp 등)로 복사한다.
//   탈퇴 익명화(user_credit_targets)가 이 경로로 그 제보의 이미지를 찾는다.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DO_TAG, FILES, HISTORY, SUBMISSION_PREFIX, adminClient, lit, readJson, readJsonIf, sha256, sql,
  type Row, type Table,
} from './lib.ts'
import type { DiffFile, Unit } from './diff.ts'
import type { Worklist } from './inbox.ts'
import { pull } from './pull.ts'

export interface Decisions {
  format: 'fps-atlas-decisions/1'
  diff_created_at: string
  decided_at: string
  /** 단위 id → 고름 여부와 직접 고친 값(새 행이면 고친 필드만, 수정이면 값 전체) */
  units: Record<string, { pick?: boolean; value?: unknown }>
  /** 항목 id → 전부 제외할 때 반려 사유(없으면 작업 목록의 초안) */
  items: Record<string, { reject_reason?: string }>
}

const IMAGE_COLS: Record<string, string[]> = {
  screenshot: ['screenshot_path', 'screenshot_thumb_path', 'screenshot_credit'],
  photo: ['photo_path', 'photo_thumb_path', 'photo_credit'],
  commons: ['commons_file', 'commons_author', 'commons_license'],
}
const KEY_COLS: Record<Table, string[]> = {
  games: ['id'], maps: ['id'], places: ['id'], map_places: ['map_id', 'place_id'],
  map_place_sources: ['map_id', 'place_id', 'url'], game_aliases: ['game_id', 'alias'], map_aliases: ['map_id', 'alias'],
}
const where = (u: Unit) => KEY_COLS[u.table].map((c) => `${c} = ${lit(u.key[c])}`).join(' and ')
const expectOne = (label: string) => `  get diagnostics n = row_count;\n  if n <> 1 then raise exception 'conflict: %', ${lit(label)}; end if;`

export async function apply({ dryRun = false } = {}) {
  const diff = readJson<DiffFile>(FILES.diff)
  const decisions = readJsonIf<Decisions>(FILES.decisions)
  if (!decisions) throw new Error('결정 파일이 없습니다. 검수기 탭 2에서 고르세요.')
  if (decisions.diff_created_at !== diff.created_at) throw new Error('결정이 다른 diff 기준입니다. 검수기에서 다시 불러와 확인하세요.')
  const worklist = readJsonIf<Worklist>(FILES.worklist)
  const changed = [
    sha256(FILES.atlas) !== diff.hashes.atlas && 'atlas.json',
    sha256(FILES.names) !== diff.hashes.names && 'names.json',
    (worklist ? sha256(FILES.worklist) : null) !== diff.hashes.worklist && 'worklist.json',
  ].filter(Boolean)
  if (changed.length) throw new Error(`diff를 만든 뒤 ${changed.join(', ')}이(가) 바뀌었습니다. diff부터 다시 하세요.`)

  const picked = diff.units.filter((u) => decisions.units[u.id]?.pick === true)
  const problems: string[] = []
  // 미결정은 제외와 같지 않다. 검수기 화면과 파일이 어긋난 채 반영되지 않게 전부 고르게 한다(오류 단위는 고를 수 없어 뺀다).
  const undecided = diff.units.filter((u) => !u.errors.length && typeof decisions.units[u.id]?.pick !== 'boolean')
  if (undecided.length) {
    problems.push(`미결정 ${undecided.length}건 · 검수기에서 채택이나 제외를 고르고 저장하세요(${undecided.slice(0, 5).map((u) => u.id).join(', ')}${undecided.length > 5 ? ' …' : ''})`)
  }
  const pickedLinks = picked.filter((u) => u.table === 'map_places' && u.op === 'insert')
  for (const u of picked) {
    if (u.errors.length) problems.push(`${u.id}: 오류가 있어 반영할 수 없음(${u.errors.join(' / ')})`)
    for (const r of u.requires) if (decisions.units[r]?.pick !== true) problems.push(`${u.id}: 함께 골라야 하는 ${r}를 고르지 않음`)
    // 새 맵·새 장소는 지울 수 없으므로, 연결 없이 들어가 지도에 보이지 않는 행이 남지 않게 한다
    if (u.op === 'insert' && u.table === 'places' && !pickedLinks.some((l) => l.key.place_id === u.key.id)) {
      problems.push(`${u.id}: 이 장소를 가리키는 연결을 채택하지 않음 · 연결도 채택하거나 장소를 제외`)
    }
    if (u.op === 'insert' && u.table === 'maps' && !pickedLinks.some((l) => l.key.map_id === u.key.id)) {
      problems.push(`${u.id}: 이 맵의 연결을 채택하지 않음(지도에 보이지 않는 맵이 됨) · 연결도 채택하거나 맵을 제외`)
    }
  }

  // 제보·수정 제안 처리 결과
  const items = (worklist?.items ?? []).map((it) => {
    const mine = diff.units.filter((u) => u.items.includes(it.id))
    const accepted = mine.some((u) => decisions.units[u.id]?.pick === true)
    const reason = (decisions.items[it.id]?.reject_reason ?? it.reject_reason ?? '').trim()
    if (!accepted && !reason) problems.push(`${it.id}: 전부 제외했는데 반려 사유가 없음`)
    // 제보가 붙는 연결: 채택한 연결 행, 없으면 채택한 근거 출처의 연결(이미 있는 연결에 출처만 더하는 경우)
    const pickedOf = (t: Table) => mine.find((u) => u.table === t && decisions.units[u.id]?.pick === true)
    const link = pickedOf('map_places') ?? pickedOf('map_place_sources')
    // 승인은 제보자에게 보이는 결과다. 지도에 맵↔장소 연결로 반영되지 않는 승인은 막는다(수정 제안은 장소 칸만 고칠 수 있어 제외).
    if (accepted && it.kind === 'submission' && !link) problems.push(`${it.id}: 연결을 채택하지 않아 승인할 수 없음 · 연결을 채택하거나 전부 제외(반려)`)
    return { it, accepted, reason, link }
  })
  if (problems.length) throw new Error(`반영할 수 없습니다:\n- ${problems.join('\n- ')}`)

  // 제보 이미지 → 공개 버킷 경로. 비공개 경로로 어느 제보의 이미지인지 찾아 submissions/<제보 번호>/에 둔다.
  const privatePaths = picked.flatMap((u) => [u.after, decisions.units[u.id]?.value].flatMap((v) => (v && typeof v === 'object' ? Object.values(v as Row) : [])))
    .filter((v): v is string => typeof v === 'string' && v.startsWith(SUBMISSION_PREFIX)).map((v) => v.slice(SUBMISSION_PREFIX.length))
  const ownerOf = new Map<string, number>()
  if (privatePaths.length) {
    const list = [...new Set(privatePaths)].map(lit).join(', ')
    for (const r of await sql<{ id: number; screenshot_path: string | null; screenshot_thumb_path: string | null; place_photo_path: string | null; place_photo_thumb_path: string | null }>(
      `select id, screenshot_path, screenshot_thumb_path, place_photo_path, place_photo_thumb_path from public.submissions
       where screenshot_path in (${list}) or screenshot_thumb_path in (${list}) or place_photo_path in (${list}) or place_photo_thumb_path in (${list})`)) {
      for (const p of [r.screenshot_path, r.screenshot_thumb_path, r.place_photo_path, r.place_photo_thumb_path]) if (p) ownerOf.set(p, r.id)
    }
  }
  const FILE_NAME: Record<string, string> = { screenshot_path: 'screenshot', screenshot_thumb_path: 'screenshot-thumb', photo_path: 'place-photo', photo_thumb_path: 'place-photo-thumb' }
  const copies: { from: string; to: string }[] = []
  function resolveImages(values: Row) {
    const out = { ...values }
    for (const [col, v] of Object.entries(out)) {
      if (typeof v !== 'string' || !v.startsWith(SUBMISSION_PREFIX)) continue
      const from = v.slice(SUBMISSION_PREFIX.length)
      const owner = ownerOf.get(from)
      if (!owner || !FILE_NAME[col]) throw new Error(`제보 이미지의 원래 제보를 찾지 못함: ${from}`)
      const to = `submissions/${owner}/${FILE_NAME[col]}.webp`
      if (!copies.some((c) => c.to === to)) copies.push({ from, to })
      out[col] = to
    }
    return out
  }
  const oldPublic: string[] = []

  const stmts: string[] = []
  const summary: string[] = []
  for (const u of picked) {
    const d = decisions.units[u.id]
    const label = u.id
    if (u.op === 'insert') {
      const values = resolveImages({ ...(u.after as Row), ...((d.value as Row | undefined) ?? {}) })
      let s: string
      if (u.table === 'map_place_sources') {
        // submission_id는 한 칸뿐이라, 이 행을 가리키는 제보 중 가장 먼저 접수된 것(번호가 작은 것)을 넣는다
        const owner = (worklist?.items ?? []).filter((i) => i.kind === 'submission' && u.items.includes(i.id))
          .sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')))[0]
        const sub = owner ? `(select id from public.submissions where code = ${lit(owner.id)})` : 'null'
        s = `  insert into public.map_place_sources (map_place_id, url, submission_id)\n    select id, ${lit(u.key.url)}, ${sub} from public.map_places where map_id = ${lit(u.key.map_id)} and place_id = ${lit(u.key.place_id)};`
      } else {
        const cols = { ...u.key, ...values }
        s = `  insert into public.${u.table} (${Object.keys(cols).join(', ')})\n    values (${Object.values(cols).map(lit).join(', ')});`
      }
      stmts.push(`  -- ${label}\n${s}\n${expectOne(label)}`)
      summary.push(`추가 ${u.row}`)
    } else if (u.op === 'update') {
      const value = d.value !== undefined ? d.value : u.after
      const cols = IMAGE_COLS[u.field!] ?? [u.field!]
      const before = (IMAGE_COLS[u.field!] ? u.before : { [u.field!]: u.before }) as Row | null
      let after = (IMAGE_COLS[u.field!] ? value : { [u.field!]: value }) as Row | null
      if (after) after = resolveImages(after)
      const sets = cols.map((c) => `${c} = ${lit(after?.[c] ?? null)}`).join(', ')
      const guard = cols.map((c) => `${c} is not distinct from ${lit(before?.[c] ?? null)}`).join(' and ')
      stmts.push(`  -- ${label}\n  update public.${u.table} set ${sets}\n    where ${where(u)} and ${guard};\n${expectOne(label)}`)
      if (IMAGE_COLS[u.field!] && u.field !== 'commons') for (const c of cols.slice(0, 2)) if (typeof before?.[c] === 'string' && before[c] !== after?.[c]) oldPublic.push(before[c] as string)
      summary.push(`수정 ${u.row}: ${u.field}`)
    } else {
      const s = u.table === 'map_place_sources'
        ? `  delete from public.map_place_sources s using public.map_places m\n    where s.map_place_id = m.id and m.map_id = ${lit(u.key.map_id)} and m.place_id = ${lit(u.key.place_id)} and s.url = ${lit(u.key.url)};`
        : `  delete from public.${u.table} where ${where(u)};`
      stmts.push(`  -- ${label}\n${s}\n${expectOne(label)}`)
      if (u.table === 'map_places') for (const c of ['screenshot_path', 'screenshot_thumb_path']) { const v = (u.before as Row | null)?.[c]; if (typeof v === 'string') oldPublic.push(v) }
      summary.push(`삭제 ${u.row}`)
    }
  }

  for (const { it, accepted, reason, link } of items) {
    const table = it.kind === 'submission' ? 'submissions' : 'edit_suggestions'
    let set = accepted ? `status = '승인', reject_reason = null, reviewed_at = now()` : `status = '반려', reject_reason = ${lit(reason)}, reviewed_at = now()`
    if (accepted && it.kind === 'submission' && link) {
      const mp = `(select id from public.map_places where map_id = ${lit(link.key.map_id)} and place_id = ${lit(link.key.place_id)})`
      const pl = (c: string) => `(select ${c} from public.places where id = ${lit(link.key.place_id)})`
      set += `, map_place_id = ${mp}, confirmed_region = ${pl('region')}, confirmed_country_code = ${pl('country_code')},
      confirmed_admin1_code = ${pl('admin1_code')}, confirmed_location_precision = ${pl('location_precision')},
      confirmed_lat = ${pl('lat')}, confirmed_lng = ${pl('lng')},
      confirmed_evidence_level = (select evidence_level from public.map_places where id = ${mp}),
      confirmed_era = (select era from public.maps where id = ${lit(link.key.map_id)})`
    }
    // 그 사이 관리 화면에서 처리됐으면 건너뛴다(오류로 멈추지 않음)
    stmts.push(`  -- ${it.id} ${accepted ? '승인' : '반려'}\n  update public.${table} set ${set}\n    where code = ${lit(it.id)} and status = '검토 대기';\n  get diagnostics n = row_count;\n  if n = 0 then raise notice 'skipped: %', ${lit(it.id)}; end if;`)
    summary.push(`${it.id} → ${accepted ? '승인' : `반려 (${reason})`}`)
  }

  if (!stmts.length) { console.log('반영할 것이 없습니다.'); return }
  // 그 사이 관리 화면에서 처리된 항목은 상태를 바꾸지 않고 건너뛴다 → 요약에 남긴다
  const codes = items.map(({ it }) => lit(it.id)).join(', ')
  const handled = items.length
    ? await sql<{ code: string; status: string }>(`select code, status from public.submissions where code in (${codes}) and status <> '검토 대기'
        union all select code, status from public.edit_suggestions where code in (${codes}) and status <> '검토 대기'`)
    : []
  for (const h of handled) summary.push(`${h.code}: 이미 ${h.status} · 상태를 바꾸지 않고 건너뜀`)
  const text = [`-- ${new Date().toISOString()} · 변경 ${picked.length}건 · 처리 ${items.length}건`, `do ${DO_TAG}`, 'declare n integer;', 'begin', ...stmts, `end ${DO_TAG};`].join('\n')
  writeFileSync(FILES.apply, text + '\n')
  console.log(`반영할 변경 ${picked.length}건 · 제보·수정 제안 ${items.length}건 → ${FILES.apply}`)
  for (const s of summary) console.log(`  ${s}`)
  if (copies.length) console.log(`  복사할 제보 이미지 ${copies.length}개`)
  if (dryRun) return

  const storage = adminClient().storage
  const done: string[] = []
  try {
    for (const { from, to } of copies) {
      const { data, error } = await storage.from('submission-images').download(from)
      if (error) throw new Error(`제보 이미지를 받지 못함(${from}): ${error.message}`)
      const up = await storage.from('public-images').upload(to, data, { contentType: 'image/webp', upsert: false })
      if (up.error) throw new Error(`공개 버킷에 올리지 못함(${to}): ${up.error.message}`)
      done.push(to)
    }
    await sql(text)
  } catch (e) {
    if (done.length) await storage.from('public-images').remove(done)
    throw new Error(`반영 실패(아무것도 바뀌지 않음): ${(e as Error).message}`)
  }
  console.log('DB 반영 완료.')
  if (oldPublic.length) {
    const { error } = await storage.from('public-images').remove(oldPublic)
    console.log(error ? `기존 이미지 삭제 실패(직접 지울 파일: ${oldPublic.join(', ')}): ${error.message}` : `기존 이미지 ${oldPublic.length}개 삭제.`)
  }
  // 작업 로그·백업 보관(반영 전 DB 사본 포함). diff.json·썸네일은 다시 만들 수 있고 비공개 이미지 사본이라 남기지 않는다.
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const dir = join(HISTORY, stamp)
  mkdirSync(dir, { recursive: true })
  copyFileSync(FILES.apply, join(dir, 'apply.sql'))
  copyFileSync(FILES.decisions, join(dir, 'decisions.json'))
  if (existsSync(FILES.worklist)) copyFileSync(FILES.worklist, join(dir, 'worklist.json'))
  copyFileSync(FILES.base, join(dir, 'db-before.json'))
  writeFileSync(join(dir, 'summary.txt'), [
    `반영 ${new Date().toISOString()} · 변경 ${picked.length}건 · 제보·수정 제안 ${items.length}건`,
    ...summary,
    ...copies.map((c) => `이미지 복사 ${c.from} → ${c.to}`),
    ...oldPublic.map((p) => `이미지 삭제 ${p}`),
  ].join('\n') + '\n')
  console.log(`작업 로그 보관 → ${dir}`)
  // 반영한 것은 DB에 들어갔고, 제외한 것은 버린다
  await pull({ force: true, afterApply: true })
}
