import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx.ts'
import { useAdminSubmissions, useAdminSuggestions } from './api.ts'
import styles from './Admin.module.css'

export type AdminTab = 'submissions' | 'suggestions' | 'register'

/** 관리 화면 공통 탭: 제보 / 수정 제안 / 직접 등록 */
export function AdminTabs({ active }: { active: AdminTab }) {
  const submissions = useAdminSubmissions()
  const suggestions = useAdminSuggestions()
  const tabs = [
    ['submissions', '제보', '/admin', submissions.data?.length ?? 0],
    ['suggestions', '수정 제안', '/admin?tab=suggestions', suggestions.data?.length ?? 0],
    ['register', '직접 등록', '/admin/new', null],
  ] as const
  return (
    <nav className={styles.tabs} aria-label="관리 탭">
      {tabs.map(([key, label, to, count]) => (
        <Link
          key={key}
          to={to}
          replace={key !== 'register' && active !== 'register'}
          className={cx(active === key ? styles.tabActive : styles.tab)}
          aria-current={active === key ? 'page' : undefined}
        >
          {label}
          {count !== null && <span className={styles.count}>{count}</span>}
        </Link>
      ))}
    </nav>
  )
}
