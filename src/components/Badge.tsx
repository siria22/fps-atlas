import type { EvidenceLevel, SubmissionStatus } from '../lib/domain.ts'
import { cx } from '../lib/cx.ts'
import styles from './Badge.module.css'

const EVIDENCE: Record<EvidenceLevel, { icon: string; className: string | undefined }> = {
  공식: { icon: '✓', className: styles.official },
  '커뮤니티 추정': { icon: '≈', className: styles.likely },
  기타: { icon: '?', className: styles.community },
}

/** Figma: Evidence Badge */
export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const { icon, className } = EVIDENCE[level]
  return (
    <span className={cx(styles.badge, className)}>
      <span aria-hidden>{icon}</span>
      {level}
    </span>
  )
}

const STATUS: Record<SubmissionStatus, string | undefined> = {
  '검토 대기': styles.pending,
  승인: styles.approved,
  반려: styles.rejected,
}

/** Figma: StatusBadge */
export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <span className={cx(styles.badge, styles.status, STATUS[status])}>{status}</span>
}
