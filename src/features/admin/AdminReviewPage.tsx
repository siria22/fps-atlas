import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { locationLabel, useAdminSubmissions, useAdminSuggestions } from './api.ts'
import { AdminTabs } from './AdminTabs.tsx'
import { ReviewTable, type ReviewItem } from '../../components/ReviewTable.tsx'
import { SubmissionReview } from './SubmissionReview.tsx'
import { SuggestionReview } from './SuggestionReview.tsx'
import { MobileBack } from '../../components/MobileBack.tsx'
import styles from './Admin.module.css'

/** 화면 04 · 04-b · 04-c: 검토 탭(제보 / 수정 제안) */
export function AdminReviewPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') === 'suggestions' ? 'suggestions' : 'submissions'
  const submissions = useAdminSubmissions()
  const suggestions = useAdminSuggestions()

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <div>
          <span className={styles.breadcrumb}>아카이브 / 관리자 전용</span>
          <h1>{tab === 'submissions' ? '제보 검토' : '수정 제안 검토'}</h1>
          <p>{tab === 'submissions' ? '제보자 제안값과 관리자 확정값을 분리해 검토하세요.' : '등록된 정보에 대한 수정 제안을 확인하고, 반영할 값을 확정하세요.'}</p>
        </div>
      </header>
      <AdminTabs active={tab} />
      {tab === 'submissions' ? <SubmissionsTab query={submissions} /> : <SuggestionsTab query={suggestions} />}
    </main>
  )
}

function SubmissionsTab({ query }: { query: ReturnType<typeof useAdminSubmissions> }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  if (query.isLoading) return <p className={styles.loading}>제보를 불러오고 있습니다.</p>
  if (query.isError) return <p role="alert" className={styles.error}>제보를 불러오지 못했습니다: {(query.error as Error).message}</p>
  const rows = query.data ?? []
  const items: ReviewItem[] = rows.map((s) => ({
    id: s.id,
    person: s.submitter?.display_name ?? '제보자',
    createdAt: s.created_at,
    gameName: s.game_name,
    mapName: s.map_name,
    location: locationLabel(s.country, s.region),
    linkLabel: s.source_url ? '자료 열기' : '근거 URL 없음',
    status: s.status,
    text: `${s.submitter?.display_name ?? ''} ${s.game_name} ${s.map_name} ${s.code ?? ''}`,
  }))
  const selected = rows.find((s) => s.id === selectedId) ?? null
  return (
    <div className={styles.columns} data-detail={detailOpen ? 'open' : undefined}>
      <ReviewTable
        items={items}
        headers={['제보자', '게임', '맵', '위치', '근거 링크', '상태']}
        searchLabel="제보자·맵 검색"
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpen={() => setDetailOpen(true)}
        footnote="승인하면 공개 지도에 바로 반영됩니다."
      />
      <div className={styles.detail}>
        <MobileBack label="제보 목록" onClick={() => setDetailOpen(false)} />
        {selected ? <SubmissionReview key={`${selected.id}-${selected.status}`} submission={selected} /> : <Empty text="검토할 제보가 없습니다." />}
      </div>
    </div>
  )
}

function SuggestionsTab({ query }: { query: ReturnType<typeof useAdminSuggestions> }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  if (query.isLoading) return <p className={styles.loading}>수정 제안을 불러오고 있습니다.</p>
  if (query.isError) return <p role="alert" className={styles.error}>수정 제안을 불러오지 못했습니다: {(query.error as Error).message}</p>
  const rows = query.data ?? []
  const items: ReviewItem[] = rows.map((e) => {
    const place = e.map_places?.places
    const map = e.map_places?.maps
    return {
      id: e.id,
      person: e.submitter?.display_name ?? '제안자',
      createdAt: e.created_at,
      gameName: map?.games?.name ?? '—',
      mapName: map?.name ?? '—',
      location: place ? locationLabel(place.country, place.region) : '—',
      linkLabel: e.fields.join(' · '),
      status: e.status,
      text: `${e.submitter?.display_name ?? ''} ${map?.games?.name ?? ''} ${map?.name ?? ''} ${e.code ?? ''}`,
    }
  })
  const selected = rows.find((e) => e.id === selectedId) ?? null
  return (
    <div className={styles.columns} data-detail={detailOpen ? 'open' : undefined}>
      <ReviewTable
        items={items}
        headers={['제안자', '게임', '맵', '현재 위치', '고칠 항목', '상태']}
        searchLabel="제안자·맵 검색"
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpen={() => setDetailOpen(true)}
        footnote="승인하면 공개 지도에 바로 반영됩니다."
      />
      <div className={styles.detail}>
        <MobileBack label="수정 제안 목록" onClick={() => setDetailOpen(false)} />
        {selected ? <SuggestionReview key={`${selected.id}-${selected.status}`} suggestion={selected} /> : <Empty text="검토할 수정 제안이 없습니다." />}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <aside className={styles.panel}>
      <p className={styles.help}>{text}</p>
    </aside>
  )
}
