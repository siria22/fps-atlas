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
import { useI18n } from '../../i18n/i18n.tsx'
import { usePlaceLabels } from '../atlas/placeLabels.ts'
import styles from './SubmissionPages.module.css'

type Submission = Tables<'submissions'>

/** 화면 언어에 맞춘 날짜 */
function useDates() {
  const { lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : 'ko-KR'
  return {
    date: (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(value)),
    dateTime: (value: string) => new Date(value).toLocaleString(locale),
  }
}

/** 로그인 오류: 한국어 화면은 자세한 안내, 영어 화면은 공통 문구 */
function useLoginError() {
  const { lang, t } = useI18n()
  return (e: Error) => (lang === 'en' ? t('auth.loginFailed') : e.message)
}

export function LoginRequiredPage() {
  const { loading } = useAuth()
  const { t } = useI18n()
  const loginError = useLoginError()
  const [error, setError] = useState('')
  if (loading) return <div className={styles.loading}>{t('auth.checking')}</div>
  return <main className={styles.loginPage}><section className={styles.loginCard}>
    <span className={styles.lock}><LockKeyhole size={21} /></span><span className={styles.breadcrumb}>{t('login.breadcrumb')}</span>
    <h1>{t('login.title')}</h1><p>{t('login.body1')}<br />{t('login.body2')}</p>
    <button className={styles.primary} onClick={() => void loginWithGoogle('/report').catch((e: Error) => setError(loginError(e)))}>{t('auth.login')}</button>
    <Link className={styles.secondary} to="/">{t('common.backToMap')}</Link>{error && <p role="alert" className={styles.error}>{error}</p>}
    <small>{t('login.after')}</small>
  </section><p className={styles.loginNote}>{t('login.note')}</p></main>
}

export function ReportPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  if (authLoading) return <div className={styles.loading}>{t('auth.checking')}</div>
  if (!user) return <LoginRequiredPage />
  return <ReportForm />
}

/** 저장된 제보 위치(한국어 이름 + Natural Earth 코드)를 화면 언어로 */
function placeNames(p: { country: string; region: string | null; countryCode: string | null; admin1Code: string | null }) {
  return { name: '', nameEn: null, ...p }
}

export function CompletePage() {
  const { state: routeState } = useLocation()
  const { t } = useI18n()
  const labels = usePlaceLabels()
  const dates = useDates()
  const state = (routeState ?? {}) as { code?: string; gameName?: string; mapName?: string; region?: string; country?: string; countryCode?: string | null; admin1Code?: string | null }
  const where = placeNames({ country: state.country ?? '', region: state.region || null, countryCode: state.countryCode ?? null, admin1Code: state.admin1Code ?? null })
  return (
    <main className={styles.completePage}>
      <header>
        <span className={styles.breadcrumb}>{t('complete.breadcrumb')}</span>
        <h1>{t('complete.title')}</h1>
        <p>{t('complete.body')}</p>
      </header>
      <section className={styles.completeCard}>
        <div className={styles.completeTitle}>
          <span><Check /></span>
          <div>
            <h2>{t('complete.cardTitle')}</h2>
            <p>{t('complete.cardBody')}</p>
          </div>
        </div>
        <div className={styles.progress}>
          <b>01<br />{t('complete.step1')}<br /><small>{t('complete.step1Hint')}</small></b>
          <ArrowRight />
          <b className={styles.progressActive}>02<br />{t('complete.step2')}<br /><small>{t('complete.step2Hint')}</small></b>
          <ArrowRight />
          <b>03<br />{t('complete.step3')}<br /><small>{t('complete.step3Hint')}</small></b>
        </div>
        <hr />
        <h3>{t('complete.summary')} <small>{t('complete.code', { code: state.code ?? t('complete.codePending') })}</small></h3>
        <div className={styles.summary}>
          <span>{t('field.game')}</span><b>{state.gameName ?? t('complete.gameFallback')}</b>
          <span>{t('field.map')}</span><b>{state.mapName ?? t('complete.mapFallback')}</b>
          <span>{t('field.location')}</span><b>{state.country ? labels.location(where) : ''}</b>
          <span>{t('field.received')}</span><b>{dates.date(new Date().toISOString())}</b>
        </div>
        <p className={styles.notice}><Info size={14} /> {t('complete.notice')}</p>
        <div className={styles.completeActions}>
          <Link className={styles.primary} to="/my">{t('complete.viewMy')} <ArrowRight size={15} /></Link>
          <Link className={styles.secondary} to="/">{t('common.backToMap')}</Link>
        </div>
      </section>
    </main>
  )
}

/** 화면 08: 표는 관리 화면과 같은 ReviewTable(TableRow)을 쓴다. */
export function MySubmissionsPage() {
  const { user, profile, loading } = useAuth()
  const { t } = useI18n()
  const labels = usePlaceLabels()
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
  if (loading) return <div className={styles.loading}>{t('auth.checking')}</div>
  if (!user) return <Navigate to="/report" replace />
  const name = profile?.display_name ?? user.user_metadata.name ?? t('my.reporterFallback')
  const rows = result.data ?? []
  const items: ReviewItem[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    gameName: row.game_name,
    mapName: row.map_name,
    location: labels.location(placeNames({ country: row.country, region: row.region, countryCode: row.country_code, admin1Code: row.admin1_code })),
    linkLabel: row.status === '반려' ? t('my.viewReason') : t('my.viewDetail'),
    status: row.status,
    text: `${row.game_name} ${row.map_name} ${row.region ?? ''} ${row.country}`,
  }))
  const selected = rows.find((row) => row.id === selectedId) ?? null

  return (
    <main className={styles.myPage}>
      <h1 className={styles.myTitle}>{t('nav.my')}</h1>
      {result.isLoading ? (
        <p className={styles.loading}>{t('my.loading')}</p>
      ) : result.isError ? (
        <p role="alert" className={styles.error}>{t('my.error')}</p>
      ) : (
        <div className={styles.myColumns} data-detail={detailOpen ? 'open' : undefined}>
          <ReviewTable
            items={items}
            headers={[t('my.headDate'), t('field.game'), t('field.map'), t('field.location'), t('my.headDetail'), t('my.headStatus')]}
            searchLabel={t('my.search')}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={() => setDetailOpen(true)}
          />
          <aside className={styles.detailCard}>
            <MobileBack label={t('my.backToList')} onClick={() => setDetailOpen(false)} />
            {selected ? <SubmissionDetail submission={selected} name={name} /> : <p className={styles.empty}>{t('my.empty')}</p>}
          </aside>
        </div>
      )}
    </main>
  )
}

function SubmissionDetail({ submission: s, name }: { submission: Submission; name: string }) {
  const { t } = useI18n()
  const labels = usePlaceLabels()
  const dates = useDates()
  const where = placeNames({ country: s.country, region: s.region, countryCode: s.country_code, admin1Code: s.admin1_code })
  return (
    <>
      <div className={styles.detailHeading}>
        <h2>{t('my.detailTitle', { status: s.status === '반려' ? t('my.rejectReason') : t(`status.${s.status}`) })}</h2>
        <StatusBadge status={s.status} />
      </div>
      <div className={styles.detailMeta}>
        <span>{s.code} · {name}</span>
        <span>{dates.dateTime(s.created_at)}</span>
      </div>
      <dl>
        <dt>{t('field.game')}</dt><dd>{s.game_name}</dd>
        <dt>{t('field.map')}</dt><dd>{s.map_name}</dd>
        <dt>{t('field.region')}</dt><dd>{labels.region(where) ?? t('my.countryLevel')}</dd>
        <dt>{t('field.country')}</dt><dd>{labels.country(where)}</dd>
        <dt>{t('field.source')}</dt>
        <dd>{s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer">{t('my.openSource')}</a> : t('my.noSource')}</dd>
      </dl>
      {s.status === '반려' ? (
        <section className={styles.reject}>
          <b>{t('my.rejectReason')}</b>
          <p>{s.reject_reason ?? t('my.noReason')}</p>
          <small>{t('my.reviewedAt', { date: s.reviewed_at ? dates.date(s.reviewed_at) : '—' })}</small>
        </section>
      ) : (
        <p className={styles.notice}>
          <Info size={14} /> {s.status === '승인' ? t('my.approvedNote') : t('my.pendingNote')}
        </p>
      )}
      {s.status === '반려' && (
        <Link className={styles.primary} to="/report" state={{ submission: s }}>
          {t('my.resubmit')} <ArrowRight size={14} />
        </Link>
      )}
    </>
  )
}
