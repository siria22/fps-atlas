// 데이터 작업 명령(로컬 전용, .env의 서비스 키·관리 API 토큰 사용). 흐름은 docs/data-workflow.md.
//   npm run atlas -- status [--json]   DB의 '검토 대기' 건수·가장 오래된 대기와 지금 작업 상태(--json은 기계용)
//   npm run atlas -- pull [--force [--discard-work]]  DB → data/atlas.json, names.json (+ 비교 기준 사본)
//   npm run atlas -- inbox             '검토 대기' 제보·수정 제안 → 작업 목록, 구조화된 칸은 파일에 반영
//   npm run atlas -- import-names [폴더]  이름 조사 결과(기본 data/.research/out) → names.json
//   npm run atlas -- diff              파일과 DB의 차이 → data/.review/diff.json (검수기 탭 2)
//   npm run atlas -- apply [--dry-run] 검수기에서 고른 것만 DB에 반영 → 다시 pull
//   npm run atlas -- wiki <주소> [--all]  Fandom 위키 문서 본문(근거 수준 확인용, *.fandom.com만)
import { existsSync } from 'node:fs'
import { FILES, MODE_LABEL, readJsonIf, sql, workState } from './atlas/lib.ts'
import { pull } from './atlas/pull.ts'
import { inbox, type Worklist } from './atlas/inbox.ts'
import { diff, type DiffFile } from './atlas/diff.ts'
import { apply } from './atlas/apply.ts'
import { importNames } from './atlas/import-names.ts'
import { wiki } from './atlas/wiki.ts'
import type { Decisions } from './atlas/apply.ts'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (f: string) => rest.includes(f)

/** 몇 분·시간·일 전 */
function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  return min < 60 ? `${min}분 전` : min < 60 * 24 ? `${Math.floor(min / 60)}시간 전` : `${Math.floor(min / 60 / 24)}일 전`
}

async function status({ json = false } = {}) {
  const [r] = await sql<{ submissions: number; suggestions: number; oldest_code: string | null; oldest_at: string | null }>(`
    with pending as (
      select code, created_at from public.submissions where status = '검토 대기'
      union all select code, created_at from public.edit_suggestions where status = '검토 대기'
    ), oldest as (select code, created_at from pending order by created_at limit 1)
    select
      (select count(*) from public.submissions where status = '검토 대기')::int as submissions,
      (select count(*) from public.edit_suggestions where status = '검토 대기')::int as suggestions,
      (select code from oldest) as oldest_code, (select created_at from oldest) as oldest_at`)
  const state = workState()
  const wl = readJsonIf<Worklist>(FILES.worklist)
  const df = readJsonIf<DiffFile>(FILES.diff)
  const dec = readJsonIf<Decisions>(FILES.decisions)
  if (json) {
    console.log(JSON.stringify({
      pending: { submissions: r.submissions, suggestions: r.suggestions, oldest_at: r.oldest_at, oldest_code: r.oldest_code },
      state: { mode: state.mode, changed: state.changed, pulled_at: state.pulledAt },
      worklist: wl ? { items: wl.items.length, todo_left: wl.items.filter((i) => i.todo.length).length } : null,
      diff: df ? { units: df.units.length, created_at: df.created_at, warnings: df.warnings.length } : null,
      decisions: dec ? { decided_at: dec.decided_at, diff_created_at: dec.diff_created_at, matches_diff: !!df && dec.diff_created_at === df.created_at } : null,
    }, null, 2))
    return
  }
  console.log(`DB '검토 대기': 제보 ${r.submissions} · 수정 제안 ${r.suggestions}`)
  if (r.oldest_at) console.log(`가장 오래된 대기: ${r.oldest_code} · ${ago(r.oldest_at)} (${new Date(r.oldest_at).toLocaleString('ko-KR')})`)
  if (state.mode === 'none') return console.log('작업 파일 없음 → pull부터')
  console.log(`작업 상태: ${MODE_LABEL[state.mode]}${state.changed ? ` (바뀐 행 ${state.changed}개)` : ''} · DB를 뽑은 시각 ${new Date(state.pulledAt!).toLocaleString('ko-KR')}`)
  console.log(`작업 목록: ${wl ? `${wl.items.length}건 (어시스턴트 할 일 남음 ${wl.items.filter((i) => i.todo.length).length}건)` : '없음'}`)
  console.log(`차이: ${df ? `${df.units.length}건 (${df.created_at})` : '없음'} · 결정: ${dec ? (df && dec.diff_created_at === df.created_at ? '있음' : '있음(다른 diff 기준 · 검수기에서 저장)') : existsSync(FILES.decisions) ? '있음' : '없음'}`)
}

try {
  switch (cmd) {
    case 'status': await status({ json: flag('--json') }); break
    case 'pull': await pull({ force: flag('--force'), discardWork: flag('--discard-work') }); break
    case 'inbox': await inbox(); break
    case 'import-names': importNames(rest.find((a) => !a.startsWith('--')) ?? 'data/.research/out'); break
    case 'diff': await diff(); break
    case 'apply': await apply({ dryRun: flag('--dry-run') }); break
    case 'wiki': await wiki(rest.find((a) => !a.startsWith('--')), { all: flag('--all') }); break
    default:
      console.error('사용법: npm run atlas -- <status [--json] | pull [--force [--discard-work]] | inbox | import-names [폴더] | diff | apply [--dry-run] | wiki <주소> [--all]>')
      process.exit(1)
  }
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
