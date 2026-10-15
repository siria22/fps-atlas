import { ExternalLink } from 'lucide-react'
import type { SubmissionStatus } from '../lib/domain.ts'
import { cx } from '../lib/cx.ts'
import { StatusBadge } from './Badge.tsx'
import styles from './TableRow.module.css'

interface SubmissionRowProps {
  /** 제보자 이름. 없으면(내 제보) 첫 칸에 날짜만 보인다. */
  person?: string
  date: string
  gameName: string
  mapName: string
  location: string
  /** 근거 링크 열(관리: '자료 열기', 내 제보: '제보 내역 보기' / '반려 사유 보기') */
  linkLabel: string
  status: SubmissionStatus
  selected?: boolean
  onClick: () => void
}

/** Figma: TableRow (기본 / 선택). 제보 관리·내 제보 표의 한 행. 행 전체가 선택 버튼이다. */
export function SubmissionRow(props: SubmissionRowProps) {
  const { person, date, gameName, mapName, location, linkLabel, status, selected = false, onClick } = props
  return (
    <button type="button" className={cx(styles.row, selected && styles.selected)} aria-pressed={selected} onClick={onClick}>
      <span className={styles.person}>
        {person ? (
          <>
            <span className={styles.name}>{person}</span>
            <span className={styles.date}>{date}</span>
          </>
        ) : (
          <span className={styles.dateOnly}>{date}</span>
        )}
      </span>
      <span className={cx(styles.cell, styles.game)}>{gameName}</span>
      <span className={cx(styles.cell, styles.map)}>{mapName}</span>
      <span className={cx(styles.cell, styles.location)}>{location}</span>
      <span className={styles.link}>
        <ExternalLink className={styles.linkIcon} size={12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
        {linkLabel}
      </span>
      <span className={styles.status}>
        <StatusBadge status={status} />
      </span>
    </button>
  )
}
