import type { ReactNode } from 'react'
import { cx } from '../lib/cx.ts'
import styles from './SectionCard.module.css'

interface SectionCardProps {
  title: ReactNode
  /** 제목 오른쪽 보조 문구 (예: '인게임 스크린샷 1장 필수 · 장소 사진 1장 선택') */
  aside?: ReactNode
  className?: string
  compact?: boolean
  children: ReactNode
}

/** Figma: SectionCard 공통 틀 (제목 17 Bold + 오른쪽 보조 문구) */
export function SectionCard({ title, aside, className, compact = false, children }: SectionCardProps) {
  return (
    <section className={cx(styles.card, compact && styles.compact, className)}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {aside && <span className={styles.aside}>{aside}</span>}
      </header>
      {children}
    </section>
  )
}
