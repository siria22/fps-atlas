import styles from './MobileBack.module.css'

/** 모바일에서 목록 → 상세로 들어갔을 때 목록으로 돌아가는 버튼(데스크톱에서는 숨김) */
export function MobileBack({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.back} onClick={onClick}>
      ← {label}
    </button>
  )
}
