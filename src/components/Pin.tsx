import type { ButtonHTMLAttributes } from 'react'
import { MapPin } from 'lucide-react'
import { cx } from '../lib/cx.ts'
import styles from './Pin.module.css'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'>

interface PinProps extends ButtonProps {
  selected?: boolean
  /** 선택 상태의 소형(25px) 변형 */
  small?: boolean
}

/** Figma: Pin (상태=기본 / 선택, 크기=기본 / 소형) */
export function Pin({ selected = false, small = false, className, ...rest }: PinProps) {
  if (!selected) {
    return <button type="button" className={cx(styles.pin, styles.default, className)} {...rest} />
  }
  return (
    <button type="button" className={cx(styles.pin, styles.selected, small && styles.selectedSmall, className)} {...rest}>
      <MapPin size={small ? 15 : 16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
    </button>
  )
}

interface ClusterBadgeProps extends ButtonProps {
  /** 묶인 장소들의 맵 연결 총수 (= 클러스터 패널 목록 개수) */
  count: number
  active?: boolean
}

/** Figma: Pin (상태=클러스터, 강조=기본 / 선택) */
export function ClusterBadge({ count, active = false, className, ...rest }: ClusterBadgeProps) {
  return (
    <button type="button" className={cx(styles.pin, styles.cluster, active && styles.clusterActive, className)} {...rest}>
      {count}
    </button>
  )
}
