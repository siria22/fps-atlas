import { cx } from '../lib/cx.ts'
import { BrandMark } from './BrandMark.tsx'
import styles from './Thumbnail.module.css'

interface ThumbnailProps {
  /** 공개된 스크린샷 썸네일 URL. null이면 '없음', undefined면 서비스 로고 자리표시. */
  src?: string | null
  alt?: string
  size?: 'regular' | 'small' | 'large'
}

/** Figma: Thumbnail · 인게임 스크린샷 (기본 48×34 / 소형 36×26 / 장소 상세 목록 68×70 × 있음 / 없음) */
export function Thumbnail({ src, alt = '', size = 'regular' }: ThumbnailProps) {
  if (src === null) {
    return <span className={cx(styles.thumb, styles[size], styles.empty)}>없음</span>
  }
  return (
    <span className={cx(styles.thumb, styles[size])}>
      {src ? (
        <img className={styles.img} src={src} alt={alt} loading="lazy" />
      ) : (
        <span className={styles.mark}>
          <BrandMark size={size === 'small' ? 14 : size === 'large' ? 30 : 20} />
        </span>
      )}
    </span>
  )
}
