// 데이터 작업 명령(로컬 전용, .env의 서비스 키·관리 API 토큰 사용). 흐름은 docs/data-workflow.md.
//   npm run atlas -- status            DB의 '검토 대기' 건수와 지금 작업 상태
//   npm run atlas -- pull [--force]    DB → data/atlas.json, names.json (+ 비교 기준 사본)
//   npm run atlas -- inbox             '검토 대기' 제보·수정 제안 → 작업 목록, 구조화된 칸은 파일에 반영
//   npm run atlas -- import-names [폴더]  이름 조사 결과(기본 data/.research/out) → names.json
//   npm run atlas -- diff              파일과 DB의 차이 → data/.review/diff.json (검수기 탭 2)
//   npm run atlas -- apply [--dry-run] 검수기에서 고른 것만 DB에 반영 → 다시 pull
import { existsSync } from 'node:fs'
import { FILES, MODE_LABEL, readJsonIf, sql, workState } from './atlas/lib.ts'
import { pull } from './atlas/pull.ts'
import { inbox, type Worklist } from './atlas/inbox.ts'
import { diff, type DiffFile } from './atlas/diff.ts'
import { apply } from './atlas/apply.ts'
import { importNames } from './atlas/import-names.ts'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (f: string) => rest.includes(f)

async function status() {
  const [r] = await sql<{ submissions: number; suggestions: number }>(`select
    (select count(*) from public.submissions where status = '검토 대기')::int as submissions,
    (select count(*) from public.edit_suggestions where status = '검토 대기')::int as suggestions`)
  console.log(`DB '검토 대기': 제보 ${r.submissions} · 수정 제안 ${r.suggestions}`)
  const state = workState()
  if (state.mode === 'none') return console.log('작업 파일 없음 → pull부터')
  console.log(`작업 상태: ${MODE_LABEL[state.mode]}${state.changed ? ` (바뀐 행 ${state.changed}개)` : ''} · DB를 뽑은 시각 ${new Date(state.pulledAt!).toLocaleString('ko-KR')}`)
  const wl = readJsonIf<Worklist>(FILES.worklist)
  const df = readJsonIf<DiffFile>(FILES.diff)
  console.log(`작업 목록: ${wl ? `${wl.items.length}건 (어시스턴트 할 일 남음 ${wl.items.filter((i) => i.todo.length).length}건)` : '없음'}`)
  console.log(`차이: ${df ? `${df.units.length}건 (${df.created_at})` : '없음'} · 결정: ${existsSync(FILES.decisions) ? '있음' : '없음'}`)
}

try {
  switch (cmd) {
    case 'status': await status(); break
    case 'pull': await pull({ force: flag('--force') }); break
    case 'inbox': await inbox(); break
    case 'import-names': importNames(rest.find((a) => !a.startsWith('--')) ?? 'data/.research/out'); break
    case 'diff': await diff(); break
    case 'apply': await apply({ dryRun: flag('--dry-run') }); break
    default:
      console.error('사용법: npm run atlas -- <status | pull [--force] | inbox | import-names [폴더] | diff | apply [--dry-run]>')
      process.exit(1)
  }
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
