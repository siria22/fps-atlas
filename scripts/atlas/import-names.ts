// 이름 조사 결과(data/.research/out/<게임 id>.json, 형식 fps-atlas-research-names/1)를 data/names.json에 더한다.
// 조사 형식과 프롬프트는 data/.research/PROMPT.md. 기존 별칭은 지우지 않고, 같은 글자(공백 차이 포함)는 한 번만 넣는다.
// 넣은 뒤 diff로 확인한다. 출처 URL은 names.json에 남지 않으므로, 확인이 필요하면 조사 파일을 본다.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FILES, readJson, workState, writeJson, type AtlasFile, type NamesFile } from './lib.ts'

interface Research {
  format: 'fps-atlas-research-names/1'
  game_id: string
  game: { name: string; kind: string; source: string }[]
  maps: Record<string, { ko: { name: string; kind: string; source: string }[]; note: string | null }>
}

const tidy = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()

export function importNames(dir: string, lang = 'ko') {
  const state = workState()
  if (state.mode === 'none') throw new Error('먼저 pull로 데이터를 뽑으세요.')
  if (state.mode === 'inbox') throw new Error('제보 처리 중입니다. 반영(apply)한 뒤에 하세요.')
  const atlas = readJson<AtlasFile>(FILES.atlas)
  const names = readJson<NamesFile>(FILES.names)
  const problems: string[] = []
  let added = 0, skipped = 0

  const addTo = (bucket: Record<string, string[]>, name: string, english: string) => {
    const n = tidy(name)
    const taken = Object.values(bucket).flat().map((x) => x.replace(/\s/g, ''))
    if (!n || n.toLowerCase() === english.toLowerCase() || taken.includes(n.replace(/\s/g, ''))) { skipped++; return }
    ;(bucket[lang] ??= []).push(n)
    added++
  }

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const r = readJson<Research>(join(dir, file))
    const gid = file.replace(/\.json$/, '')
    if (r.format !== 'fps-atlas-research-names/1' || r.game_id !== gid) { problems.push(`${file}: 형식 또는 game_id가 다름`); continue }
    const game = atlas.games[gid]
    if (!game) { problems.push(`${file}: 없는 게임`); continue }
    const entry = (names.games[gid] ??= { aliases: {}, maps: {} })
    for (const g of r.game ?? []) addTo(entry.aliases, g.name, game.name)
    for (const [mid, m] of Object.entries(r.maps ?? {})) {
      if (!game.maps[mid]) { problems.push(`${file}: 없는 맵 ${mid}`); continue }
      for (const n of m.ko ?? []) addTo((entry.maps[mid] ??= {}), n.name, game.maps[mid].name)
    }
  }
  writeJson(FILES.names, names)
  console.log(`별칭 ${added}개 추가 (이미 있거나 영문과 같아 건너뜀 ${skipped}) → ${FILES.names}`)
  for (const p of problems) console.log(`  문제: ${p}`)
}
