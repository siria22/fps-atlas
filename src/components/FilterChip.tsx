import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../lib/cx.ts'
import styles from './FilterChip.module.css'

interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  selected?: boolean
}

/** Figma: Filter Chip (기본 / 선택). "+N ▾" 더보기 칩도 기본 모양을 그대로 쓴다. */
export function FilterChip({ selected = false, className, children, ...rest }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(styles.chip, selected && styles.selected, className)}
      {...rest}
    >
      {selected && <span className={styles.dot} aria-hidden />}
      {children}
    </button>
  )
}
