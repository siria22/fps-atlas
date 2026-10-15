import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react'
import { ClusterPlaceItem, MapLinkItem } from '../../components/ListItem.tsx'
import { SectionCard } from '../../components/SectionCard.tsx'
import type { Place } from './data.ts'
import { commonsPageUrl, publicImageUrl, safeExternalUrl, useCommonsPhoto, useHistorySummary } from './media.ts'
import type { VisiblePlace } from './filters.ts'
import { useI18n } from '../../i18n/i18n.tsx'
import { usePlaceLabels } from './placeLabels.ts'
import styles from './DetailPanel.module.css'

type DetailPanelProps =
  | { kind: 'place'; place: VisiblePlace; onClose: () => void }
  | { kind: 'cluster'; places: VisiblePlace[]; onSelectPlace: (place: VisiblePlace) => void; onClose: () => void }

/**
 * 우측 패널. 핀·클러스터를 선택했을 때만 지도 위에 열리고 X로 닫는다.
 * Figma: Page1 01/01-b · 장소 상세, 02 · 클러스터 목록. v2 이미지 정책 반영.
 */
export function DetailPanel(props: DetailPanelProps) {
  const { t } = useI18n()
  const labels = usePlaceLabels()
  const close = (
    <button type="button" className={styles.close} aria-label={t('detail.close')} onClick={props.onClose}>
      <X size={15} strokeWidth={1.5} absoluteStrokeWidth />
    </button>
  )
  return (
    <>
      <div className={styles.intro}>
        {props.kind === 'place' ? (
          <>
            <div className={styles.crumbRow}>
              <span className={styles.crumb}>{t('detail.crumb')}</span>
              {close}
            </div>
            <h2 className={styles.title}>{labels.name(props.place)}</h2>
            <span className={styles.meta}>{labels.location(props.place)}</span>
          </>
        ) : (
          <div className={styles.crumbRow}>
            <h2 className={styles.title}>{t('detail.clusterTitle', { n: props.places.length })}</h2>
            {close}
          </div>
        )}
      </div>
      {props.kind === 'place' ? <PlaceDetail place={props.place} /> : <ClusterDetail places={props.places} onSelectPlace={props.onSelectPlace} />}
    </>
  )
}

function PlacePhoto({ place }: { place: Place }) {
  const { t } = useI18n()
  const labels = usePlaceLabels()
  const uploaded = publicImageUrl(place.photoPath)
  const commons = useCommonsPhoto(uploaded ? null : place.commonsFile)
  const [failed, setFailed] = useState(false)
  const src = uploaded ?? commons.data
  if ((!uploaded && !place.commonsFile) || failed) return null
  return <figure className={styles.photo}>
    {src ? <img className={styles.photoImage} src={src} alt={t('detail.photoAlt', { name: labels.name(place) })} onError={() => setFailed(true)} />
      : <div className={styles.photoState} role="status">{commons.isError ? t('detail.photoError') : t('detail.photoLoading')}</div>}
    <figcaption className={styles.credit}>{uploaded
      ? `${t('detail.photoCredit')}${place.photoCredit ? ` · ${place.photoCredit}` : ''}`
      : <><a href={commonsPageUrl(place.commonsFile!)} target="_blank" rel="noreferrer">{place.commonsFile}</a>{` · ${place.commonsAuthor ?? ''} · ${place.commonsLicense ?? ''}`}</>}</figcaption>
  </figure>
}

/** 긴 요약은 처음 몇 줄만 보여 주고 아래를 흐리게 한 뒤, 가운데 아이콘으로 전문을 펼친다. 넘치지 않으면 아이콘 없음. */
function ClampedText({ text }: { text: string }) {
  const { t } = useI18n()
  const ref = useRef<HTMLParagraphElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, open])
  return <div className={styles.clamp}>
    <p ref={ref} className={open ? undefined : overflows ? styles.clampedFade : styles.clamped}>{text}</p>
    {overflows && <button type="button" className={styles.clampToggle} aria-expanded={open}
      aria-label={open ? t('detail.summaryCollapse') : t('detail.summaryExpand')} onClick={() => setOpen((v) => !v)}>
      {open ? <ChevronUp size={18} strokeWidth={1.5} absoluteStrokeWidth /> : <ChevronDown size={18} strokeWidth={1.5} absoluteStrokeWidth />}
    </button>}
  </div>
}

/** Figma: 장소 상세_User Mod — 요약 → 지역 사진(있을 때만) → 목록 */
function PlaceDetail({ place }: { place: VisiblePlace }) {
  const history = useHistorySummary(place)
  const { lang, t } = useI18n()
  return <>
    <SectionCard compact title={t('detail.summary')}>
      <div aria-live="polite">
        {history.isPending ? <p>{t('detail.summaryLoading')}</p>
          : history.isError ? <p>{t('detail.summaryError')}</p>
          : !history.data ? <p>{t('detail.summaryNone')}</p>
          : <><ClampedText text={history.data.extract} /><div className={styles.historySource}>
            <a href={history.data.url} target="_blank" rel="noreferrer">{t('detail.summarySource')}</a>
            <span>{t('detail.summaryLicense')}</span>
          </div></>}
      </div>
    </SectionCard>
    <PlacePhoto key={place.id} place={place} />
    <SectionCard compact title={t('detail.list')}>
      <div className={styles.groupList}>
        {groupByGame(place.visibleLinks.map((link) => ({ link })), lang).map(([gameName, rows]) => (
          <GameGroup key={gameName} gameName={gameName} count={rows.length}>
            <div className={styles.linkList}>
              {rows.map(({ link }) => {
                const wiki = safeExternalUrl(link.wikiUrl)
                return <MapLinkItem key={link.id} gameName={link.gameName} mapName={link.mapName} era={link.era}
                  thumbnailSrc={publicImageUrl(link.screenshotThumbPath)}
                  sources={link.sources.flatMap((source) => {
                    const url = safeExternalUrl(source.url)
                    return url ? [{ url, label: new URL(url).hostname }] : []
                  })}
                  wiki={wiki ? { url: wiki, label: `${link.gameName} / ${link.mapName}` } : null} />
              })}
            </div>
          </GameGroup>
        ))}
      </div>
    </SectionCard>
  </>
}

/** 작품별로 묶는다. 작품은 이름순, 안의 맵도 이름순. */
function groupByGame<T extends { link: VisiblePlace['visibleLinks'][number] }>(rows: T[], locale: string): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const row of rows) groups.set(row.link.gameName, [...(groups.get(row.link.gameName) ?? []), row])
  return [...groups].sort(([a], [b]) => a.localeCompare(b, locale))
    .map(([game, list]) => [game, list.sort((a, b) => a.link.mapName.localeCompare(b.link.mapName, locale) || a.link.id.localeCompare(b.link.id))])
}

/** 작품 그룹. 처음엔 접혀 있고 머리글을 눌러 펼친다. */
function GameGroup({ gameName, count, children }: { gameName: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <section className={styles.group}>
    <button type="button" className={styles.groupHeader} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      {open ? <ChevronDown size={16} strokeWidth={1.5} absoluteStrokeWidth /> : <ChevronRight size={16} strokeWidth={1.5} absoluteStrokeWidth />}
      <span className={styles.groupName}>{gameName}</span>
      <span className={styles.groupCount}>{count}</span>
    </button>
    {open && <div className={styles.groupBody}>{children}</div>}
  </section>
}

const PAGE = 8

/** 클러스터: 묶인 장소와 각 장소의 맵 수(많은 순). 장소를 누르면 장소 상세로 넘어간다. */
function ClusterDetail({ places, onSelectPlace }: { places: VisiblePlace[]; onSelectPlace: (place: VisiblePlace) => void }) {
  const [page, setPage] = useState(0)
  const { lang, t } = useI18n()
  const labels = usePlaceLabels()
  const sorted = [...places].sort((a, b) => b.visibleLinks.length - a.visibleLinks.length || labels.name(a).localeCompare(labels.name(b), lang))
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const current = Math.min(page, pages - 1)
  return <>
    <p className={styles.meta}>{t('detail.clusterHint')}</p>
    <div className={styles.clusterList}>
      {sorted.slice(current * PAGE, current * PAGE + PAGE).map((place) => <ClusterPlaceItem key={place.id}
        placeName={labels.name(place)} location={labels.location(place)}
        mapCount={place.visibleLinks.length} onClick={() => onSelectPlace(place)} />)}
    </div>
    {pages > 1 && <nav className={styles.pagination} aria-label={t('detail.pages')}>
      <button className={styles.control} disabled={current === 0} onClick={() => setPage(current - 1)}>{t('detail.prev')}</button>
      <span className={styles.currentPage} aria-current="page">{current + 1}</span>
      <button className={styles.control} disabled={current === pages - 1} onClick={() => setPage(current + 1)}>{t('detail.next')}</button>
    </nav>}
  </>
}
