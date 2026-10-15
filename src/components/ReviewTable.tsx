import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Info, Search } from 'lucide-react'
import { FilterChip } from './FilterChip.tsx'
import { SubmissionRow } from './TableRow.tsx'
import type { SubmissionStatus } from '../lib/domain.ts'
import styles from './ReviewTable.module.css'

const PAGE_SIZE = 7
const formatDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short' }).format(new Date(value))

export interface ReviewItem {
  id: number
  person?: string
  createdAt: string
  gameName: string
  mapName: string
  location: string
  linkLabel: string
  status: SubmissionStatus
  /** 검색 대상 문자열 */
  text: string
}

type Filter = '전체' | SubmissionStatus
const FILTERS: Filter[] = ['전체', '검토 대기', '승인', '반려']

/** Figma `SectionCard / 관리자 제보 표`: 상태 필터 · 검색 · 정렬 · 7개씩 페이지. 04(제보)·04-c(수정 제안)·08(내 제보)이 함께 쓴다. */
export function ReviewTable(props: {
  items: ReviewItem[]
  headers: string[]
  searchLabel: string
  selectedId: number | null
  onSelect: (id: number | null) => void
  /** 사용자가 행을 눌렀을 때(모바일에서 상세 화면으로 넘어갈 때 쓴다. 자동 선택에는 부르지 않는다) */
  onOpen?: (id: number) => void
  /** 표 아래 안내 문구(없으면 숨김) */
  footnote?: ReactNode
}) {
  const { items, headers, searchLabel, selectedId, onSelect, onOpen, footnote } = props
  const [filter, setFilter] = useState<Filter>('전체')
  const [query, setQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [page, setPage] = useState(0)

  const q = query.trim().toLocaleLowerCase()
  const rows = items
    .filter((item) => (filter === '전체' || item.status === filter) && item.text.toLocaleLowerCase().includes(q))
    .sort((a, b) => (newestFirst ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)))
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const count = (f: Filter) => (f === '전체' ? items.length : items.filter((i) => i.status === f).length)

  // 선택이 목록에서 사라지면(필터·검색·페이지 변경) 보이는 첫 행을 고른다
  const fallbackId = visible.some((row) => row.id === selectedId) ? selectedId : (visible[0]?.id ?? null)
  useEffect(() => {
    if (fallbackId !== selectedId) onSelect(fallbackId)
  }, [fallbackId, selectedId, onSelect])

  const reset = () => setPage(0)
  return (
    <section className={styles.tableCard}>
      <div className={styles.tools}>
        <div className={styles.chips}>
          {FILTERS.map((f) => (
            <FilterChip key={f} selected={filter === f} onClick={() => { setFilter(f); reset() }}>
              {f} {count(f)}
            </FilterChip>
          ))}
        </div>
        <span className={styles.search}>
          <Search size={14} aria-hidden />
          <input aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={(e) => { setQuery(e.target.value); reset() }} />
          <button type="button" className={styles.sort} onClick={() => { setNewestFirst((v) => !v); reset() }}>
            {newestFirst ? '최신순 ↓' : '오래된순 ↑'}
          </button>
        </span>
      </div>
      <div className={styles.head}>
        {headers.map((h) => <span key={h}>{h}</span>)}
      </div>
      {visible.map((row) => (
        <SubmissionRow
          key={row.id}
          person={row.person}
          date={formatDate(row.createdAt)}
          gameName={row.gameName}
          mapName={row.mapName}
          location={row.location}
          linkLabel={row.linkLabel}
          status={row.status}
          selected={row.id === selectedId}
          onClick={() => { onSelect(row.id); onOpen?.(row.id) }}
        />
      ))}
      {!rows.length && <p className={styles.empty}>조건에 맞는 항목이 없습니다.</p>}
      <div className={styles.footer}>
        <span>
          총 {rows.length}개 · {rows.length ? current * PAGE_SIZE + 1 : 0}–{Math.min(current * PAGE_SIZE + PAGE_SIZE, rows.length)} 표시
        </span>
        <span className={styles.pager}>
          <button type="button" className={styles.pagerArrow} aria-label="이전 페이지" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft size={16} />
          </button>
          <FilterChip selected>{current + 1}</FilterChip>
          <button type="button" className={styles.pagerArrow} aria-label="다음 페이지" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>
            <ChevronRight size={16} />
          </button>
        </span>
      </div>
      {footnote && (
        <p className={styles.footnote}>
          <Info size={13} /> {footnote}
        </p>
      )}
    </section>
  )
}
