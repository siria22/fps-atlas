import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx.ts'
import styles from './Dialog.module.css'

interface DialogProps {
  title: string
  children: ReactNode
  /** 아래 버튼 줄 */
  actions: ReactNode
  /** Esc·배경 클릭으로 닫기. 처리 중에는 넘기지 않는다. */
  onDismiss?: () => void
  tone?: 'default' | 'danger'
  /** 화면 위에 띄우지 않고 제자리에 그린다(개발용 미리보기). */
  inline?: boolean
}

/** 확인 다이얼로그. 배경을 어둡게 덮고 가운데에 띄운다. */
export function Dialog({ title, children, actions, onDismiss, tone = 'default', inline = false }: DialogProps) {
  const titleId = useId()
  useEffect(() => {
    if (inline || !onDismiss) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inline, onDismiss])

  const box = (
    <div className={cx(styles.dialog, tone === 'danger' && styles.danger)} role="dialog" aria-modal={!inline} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>{title}</h2>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>{actions}</div>
    </div>
  )
  if (inline) return box
  // body 바로 아래에 띄운다. 연 자리(푸터 등)의 글자 스타일·줄바꿈 설정을 물려받지 않게 한다.
  return createPortal(
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onDismiss?.()}>
      {box}
    </div>,
    document.body,
  )
}
