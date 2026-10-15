import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, Check, Info, LockKeyhole } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { Tables } from '../../lib/database.types.ts'
import { StatusBadge } from '../../components/Badge.tsx'
import { useAuth, loginWithGoogle } from '../../lib/auth.tsx'
import { supabase } from '../../lib/supabase.ts'
import { ReviewTable, type ReviewItem } from '../../components/ReviewTable.tsx'
import { MobileBack } from '../../components/MobileBack.tsx'
import { ReportForm } from './ReportForm.tsx'
import styles from './SubmissionPages.module.css'

type Submission = Tables<'submissions'>

const formatDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short' }).format(new Date(value))

export function LoginRequiredPage() {
  const { loading } = useAuth()
  const [error, setError] = useState('')
  if (loading) return <div className={styles.loading}>로그인 상태를 확인하고 있습니다.</div>
  return <main className={styles.loginPage}><section className={styles.loginCard}>
    <span className={styles.lock}><LockKeyhole size={21} /></span><span className={styles.breadcrumb}>아카이브 / 장소 제보</span>
    <h1>장소 제보는 로그인이 필요합니다</h1><p>Google 계정으로 로그인하고 맵의 현실 장소를 제보해주세요.<br />제보 내역과 검토 결과는 내 제보에서 확인할 수 있습니다.</p>
    <button className={styles.primary} onClick={() => void loginWithGoogle('/report').catch((e: Error) => setError(e.message))}>Google로 로그인</button>
    <Link className={styles.secondary} to="/">지도로 돌아가기</Link>{error && <p role="alert" className={styles.error}>{error}</p>}
    <small>로그인 후 장소 제보 화면으로 돌아갑니다.</small>
  </section><p className={styles.loginNote}>지도 탐색은 로그인 없이 이용할 수 있습니다.</p></main>
}

export function ReportPage() {
  const { user, loading: authLoading } = useAuth()
  if (authLoading) return <div className={styles.loading}>로그인 상태를 확인하고 있습니다.</div>
  if (!user) return <LoginRequiredPage />
  return <ReportForm />
}

export function CompletePage() {
  const { state: routeState } = useLocation()
  const state = (routeState ?? {}) as { code?: string; gameName?: string; mapName?: string; region?: string; country?: string }
  return <main className={styles.completePage}><header><span className={styles.breadcrumb}>아카이브 / 장소 제보 / 제출 완료</span><h1>제보가 접수되었습니다</h1><p>남겨주신 맵과 장소의 관계는 관리자 검토 후 지도에 반영됩니다.</p></header><section className={styles.completeCard}><div className={styles.completeTitle}><span><Check /></span><div><h2>제출 완료 · 관리자 검토 진행중</h2><p>아직 공개 지도에는 표시되지 않습니다. 검토 상태는 내 제보에서 확인하세요.</p></div></div><div className={styles.progress}><b>01<br />제보 작성<br /><small>게임·맵·장소 정보 접수</small></b><ArrowRight /><b className={styles.progressActive}>02<br />관리자 검토<br /><small>근거와 장소의 관계 확인</small></b><ArrowRight /><b>03<br />지도 반영<br /><small>관리자 승인 후 반영</small></b></div><hr /><h3>제보 요약 <small>제보 번호 {state.code ?? '확인 중'}</small></h3><div className={styles.summary}><span>게임</span><b>{state.gameName ?? '제출된 제보'}</b><span>맵</span><b>{state.mapName ?? '내 제보에서 확인할 수 있습니다.'}</b><span>{'국가 > 주·도'}</span><b>{state.country}{state.region ? ` > ${state.region}` : ''}</b><span>접수일</span><b>{formatDate(new Date().toISOString())}</b></div><p className={styles.notice}><Info size={14} /> 관리자가 맵과 장소 관계와 출처를 확인한 뒤 반영 여부를 결정합니다.</p><div className={styles.completeActions}><Link className={styles.primary} to="/my">내 제보 보기 <ArrowRight size={15} /></Link><Link className={styles.secondary} to="/">지도로 돌아가기</Link></div></section></main>
}

/** 화면 08: 표는 관리 화면과 같은 ReviewTable(TableRow)을 쓴다. */
export function MySubmissionsPage() {
  const { user, profile, loading } = useAuth()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const result = useQuery({
    queryKey: ['my-submissions', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('submissions').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data as Submission[]
    },
    staleTime: 30_000,
  })
  if (loading) return <div className={styles.loading}>로그인 상태를 확인하고 있습니다.</div>
  if (!user) return <Navigate to="/report" replace />
  const name = profile?.display_name ?? user.user_metadata.name ?? '제보자'
  const rows = result.data ?? []
  const items: ReviewItem[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    gameName: row.game_name,
    mapName: row.map_name,
    location: `${row.country}${row.region ? ` > ${row.region}` : ''}`,
    linkLabel: row.status === '반려' ? '반려 사유 보기' : '제보 내역 보기',
    status: row.status,
    text: `${row.game_name} ${row.map_name} ${row.region ?? ''} ${row.country}`,
  }))
  const selected = rows.find((row) => row.id === selectedId) ?? null

  return (
    <main className={styles.myPage}>
      <h1 className={styles.myTitle}>내 제보</h1>
      {result.isLoading ? (
        <p className={styles.loading}>제보 내역을 불러오고 있습니다.</p>
      ) : result.isError ? (
        <p role="alert" className={styles.error}>제보 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      ) : (
        <div className={styles.myColumns} data-detail={detailOpen ? 'open' : undefined}>
          <ReviewTable
            items={items}
            headers={['제출일', '게임', '맵', '국가 > 주·도', '내역 / 반려 사유', '상태']}
            searchLabel="게임·맵 검색"
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={() => setDetailOpen(true)}
          />
          <aside className={styles.detailCard}>
            <MobileBack label="내 제보 목록" onClick={() => setDetailOpen(false)} />
            {selected ? <SubmissionDetail submission={selected} name={name} /> : <p className={styles.empty}>아직 제출한 제보가 없습니다.</p>}
          </aside>
        </div>
      )}
    </main>
  )
}

function SubmissionDetail({ submission: s, name }: { submission: Submission; name: string }) {
  return (
    <>
      <div className={styles.detailHeading}>
        <h2>제보 내역 · {s.status === '반려' ? '반려 사유' : s.status}</h2>
        <StatusBadge status={s.status} />
      </div>
      <div className={styles.detailMeta}>
        <span>{s.code} · {name}</span>
        <span>{new Date(s.created_at).toLocaleString('ko-KR')}</span>
      </div>
      <dl>
        <dt>게임</dt><dd>{s.game_name}</dd>
        <dt>맵</dt><dd>{s.map_name}</dd>
        <dt>주·도</dt><dd>{s.region ?? '국가 단위 제보'}</dd>
        <dt>국가</dt><dd>{s.country}</dd>
        <dt>근거 링크</dt>
        <dd>{s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer">출처 열기 ↗</a> : '등록된 근거 URL 없음'}</dd>
      </dl>
      {s.status === '반려' ? (
        <section className={styles.reject}>
          <b>반려 사유</b>
          <p>{s.reject_reason ?? '안내된 반려 사유가 없습니다.'}</p>
          <small>검토일 · {s.reviewed_at ? formatDate(s.reviewed_at) : '—'}</small>
        </section>
      ) : (
        <p className={styles.notice}>
          <Info size={14} /> {s.status === '승인' ? '관리자 검토가 완료되었습니다.' : '관리자가 근거와 장소의 관계를 확인하고 있습니다.'}
        </p>
      )}
      {s.status === '반려' && (
        <Link className={styles.primary} to="/report" state={{ submission: s }}>
          자료 보완 후 다시 제보 <ArrowRight size={14} />
        </Link>
      )}
    </>
  )
}
