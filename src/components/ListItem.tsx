import type { Era } from '../lib/domain.ts'
import { cx } from '../lib/cx.ts'
import { Thumbnail } from './Thumbnail.tsx'
import { useI18n } from '../i18n/i18n.tsx'
import styles from './ListItem.module.css'

export interface LinkRef {
  label: string
  url: string
}

interface MapLinkItemProps {
  gameName: string
  mapName: string
  era: Era
  /** 스크린샷 썸네일 URL. 없으면 아이콘 자리표시 */
  thumbnailSrc?: string | null
  sources: LinkRef[]
  /** 맵 단위 팬덤 위키. 없거나 근거 출처와 같은 주소면 줄을 그리지 않는다 */
  wiki: LinkRef | null
}

/** Figma: 장소 상세_User Mod · 목록 아이템. 근거 출처·위키를 접지 않고 항상 보여 준다. */
export function MapLinkItem(props: MapLinkItemProps) {
  const { gameName, mapName, era, thumbnailSrc, sources, wiki } = props
  const { t } = useI18n()
  return (
    <div className={styles.mapLink}>
      <Thumbnail size="large" src={thumbnailSrc ?? undefined} alt={t('item.screenshot', { name: `${gameName} ${mapName}` })} />
      <div className={styles.mapBody}>
        <div className={styles.mapInfo}>
          <span className={styles.gameName}>{gameName}</span>
          <span className={styles.mapMeta}>
            {mapName} · {t(`era.${era}`)}
          </span>
        </div>
        <div className={styles.mapDetail}>
          {sources.map((s) => (
            <a key={s.url} className={styles.detailLink} href={s.url} target="_blank" rel="noreferrer">
              {t('item.source')} · {s.label}
            </a>
          ))}
          {wiki && !sources.some((s) => s.url === wiki.url) && (
            <a className={styles.detailLink} href={wiki.url} target="_blank" rel="noreferrer">
              {t('item.wiki')} · {wiki.label}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

interface ClusterPlaceItemProps {
  placeName: string
  /** "국가 > 주·도" */
  location: string
  mapCount: number
  onClick: () => void
}

/** 클러스터 패널의 장소 행. 누르면 그 장소 상세(작품별 맵 목록)를 연다. */
export function ClusterPlaceItem({ placeName, location, mapCount, onClick }: ClusterPlaceItemProps) {
  const { t } = useI18n()
  return (
    <button type="button" className={cx(styles.cluster, styles.clusterPlace)} onClick={onClick}>
      <span className={styles.clusterInfo}>
        <span className={styles.clusterGame}>{placeName}</span>
        <span className={styles.clusterMap}>{location}</span>
      </span>
      <span className={styles.clusterCount}>{t('item.mapCount', { n: mapCount })}</span>
    </button>
  )
}

interface ClusterItemProps {
  gameName: string
  era: Era
  mapName: string
  placeName: string
  thumbnailSrc?: string | null
  selected?: boolean
  onClick: () => void
}

/** 인접 장소 묶음 목록 아이템. 장소 상세 목록과 같은 썸네일(68×70)을 쓰고, 누르면 그 장소 상세를 연다. */
export function ClusterItem(props: ClusterItemProps) {
  const { gameName, era, mapName, placeName, thumbnailSrc, selected = false, onClick } = props
  return (
    <button type="button" className={cx(styles.cluster, selected && styles.clusterSelected)} onClick={onClick}>
      <Thumbnail size="large" src={thumbnailSrc ?? undefined} alt={`${gameName} ${mapName} 스크린샷`} />
      <span className={styles.clusterInfo}>
        <span className={styles.clusterGame}>{gameName}</span>
        <span className={styles.clusterMap}>
          {mapName} · {placeName}
        </span>
        <span className={styles.clusterEra}>{era}</span>
      </span>
    </button>
  )
}
