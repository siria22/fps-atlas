import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import type { InquiryCategory } from '../../lib/inquiry.ts'
import { InquiryDialog } from '../inquiry/InquiryDialog.tsx'
import {
  HOWTO, NOTICE_ACCURACY, NOTICE_COPYRIGHT, NOTICE_OPERATION, NOTICE_PRIVACY, NOTICE_RIGHTS, NOTICE_SERVICE,
  PRIVACY_POLICY, QA, SOURCES, type Bullet, type Paragraph,
} from './guideContent.ts'
import styles from './GuidePage.module.css'

type Tab = 'qa' | 'howto' | 'notice'
const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'qa', label: 'Q&A', count: QA.length },
  { id: 'howto', label: '이용 방법', count: HOWTO.length },
  { id: 'notice', label: '고지 사항' },
]
const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v)

/** 이용 안내(Figma 11-a Q&A · 11-b 이용 방법 · 11-c 고지 사항). 탭은 주소의 #qa / #howto / #notice로 기억한다. */
export function GuidePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const hash = location.hash.slice(1)
  const tab: Tab = isTab(hash) ? hash : 'qa'
  const [inquiry, setInquiry] = useState<InquiryCategory | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  // 탭을 바꾸면 맨 위로, 다른 탭의 화면 링크를 누르면 그 화면으로 스크롤한다.
  const [jump, setJump] = useState<{ target: string | null; n: number }>({ target: null, n: 0 })

  useEffect(() => {
    const el = jump.target ? document.getElementById(jump.target) : topRef.current
    el?.scrollIntoView({ block: 'start' })
  }, [tab, jump])

  const goto = (next: Tab, target?: string) => {
    navigate({ hash: next }, { replace: true })
    setJump((j) => ({ target: target ?? null, n: j.n + 1 }))
  }

  const inline = (p: Paragraph): ReactNode =>
    p.map((part, i) => {
      if (typeof part === 'string') return part
      if ('bold' in part) return <b key={i}>{part.bold}</b>
      if ('goto' in part) return <button key={i} type="button" className={styles.link} onClick={() => goto(part.goto, part.target)}>{part.text}</button>
      return <button key={i} type="button" className={styles.link} onClick={() => setInquiry(part.inquiry)}>{part.text}</button>
    })
  const bullets = (items: Bullet[]) => (
    <ul className={styles.bullets}>
      {items.map((b, i) => (
        <li key={i}>
          {inline(b.text)}
          {b.sub && <ul>{b.sub.map((s, j) => <li key={j}>{inline(s)}</li>)}</ul>}
        </li>
      ))}
    </ul>
  )

  return (
    <div className={styles.page}>
      <div ref={topRef} className={styles.intro}>
        <p className={styles.crumb}>아카이브 / 이용 안내</p>
        <h1>이용 안내</h1>
        <p>FPS Loc Atlas를 처음 쓰는 분을 위한 질문과 답, 화면별 사용법, 이용 전 알아둘 내용입니다.</p>
      </div>
      <div className={styles.tabBar}>
        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cx(styles.tab, tab === t.id && styles.tabActive)} onClick={() => goto(t.id)}>
              {t.label}
              {t.count !== undefined && <span className={styles.count}>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.body} role="tabpanel">
        {tab === 'qa' && (
          <section>
            <h2>자주 묻는 질문</h2>
            <div className={styles.grid}>
              {QA.map((item) => (
                <article key={item.q} className={styles.card}>
                  <h3>{item.q}<span className={styles.tag}>{item.tag}</span></h3>
                  {item.answer.map((a, i) => <p key={i} className={a.caption ? styles.caption : undefined}>{inline(a.text)}</p>)}
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'howto' && (
          <section>
            <h2>이용 방법</h2>
            <p className={styles.lead}>화면별로 어떤 데이터가 보이고 어떻게 쓰는지 정리했습니다.</p>
            {HOWTO.map((s) => (
              <div key={s.id} id={s.id} className={styles.howto}>
                <figure className={styles.shot}>
                  <img src={s.image} width={s.width} height={s.height} alt={s.alt} loading="lazy" />
                  <figcaption>{s.caption}</figcaption>
                </figure>
                <div className={styles.card}>
                  <p className={styles.sub}>{s.sub}</p>
                  <h3>{s.title}</h3>
                  <h4>표시되는 데이터</h4>
                  <ol className={styles.legend}>
                    {s.legend.map((l, i) => (
                      <li key={l.label}>
                        <span className={styles.marker} aria-hidden>{i + 1}</span>
                        <div>
                          <b>{l.label}</b> — {l.body}
                          {l.sub && <ul>{l.sub.map((x) => <li key={x}>{x}</li>)}</ul>}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <h4>이렇게 사용하세요</h4>
                  <ol className={styles.steps}>{s.steps.map((x) => <li key={x}>{x}</li>)}</ol>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === 'notice' && (
          <section>
            <h2>고지 사항</h2>
            <p className={styles.lead}>서비스를 이용하기 전에 확인해 주세요.</p>
            <div className={cx(styles.grid, styles.noticeGrid)}>
              <article className={styles.card}><h3>서비스의 성격</h3>{bullets(NOTICE_SERVICE)}</article>
              <article className={styles.card}><h3>게임 콘텐츠와 저작권</h3>{bullets(NOTICE_COPYRIGHT)}</article>
              <article className={cx(styles.card, styles.full)}>
                <h3>외부 자료의 출처와 라이선스</h3>
                <table className={styles.table}>
                  <thead><tr><th>항목</th><th>출처</th><th>이용 방식·표기</th></tr></thead>
                  <tbody>{SOURCES.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
                </table>
              </article>
              <article className={styles.card}><h3>데이터의 정확성</h3>{bullets(NOTICE_ACCURACY)}</article>
              <article className={styles.card}><h3>제보와 운영</h3>{bullets(NOTICE_OPERATION)}</article>
              <article className={styles.card}>
                <h3>개인정보</h3>
                {bullets(NOTICE_PRIVACY)}
                <details className={styles.policy}>
                  <summary>개인정보 처리방침 <ChevronDown size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden /></summary>
                  <ol>
                    {PRIVACY_POLICY.map((p) => (
                      <li key={p.title}>
                        <b>{p.title}</b>
                        {p.body.map((x, i) => <p key={i}>{inline(x)}</p>)}
                        {p.list && <ul>{p.list.map((x) => <li key={x}>{x}</li>)}</ul>}
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
              <article className={styles.card}>
                <h3>권리침해·정정 요청</h3>
                {bullets(NOTICE_RIGHTS)}
                <button type="button" className={styles.ask} onClick={() => setInquiry('rights')}>문의 작성 →</button>
              </article>
            </div>
          </section>
        )}
      </div>
      {inquiry && <InquiryDialog category={inquiry} onClose={() => setInquiry(null)} />}
    </div>
  )
}
