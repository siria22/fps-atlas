import { useState, type ButtonHTMLAttributes, type HTMLAttributes } from 'react'
import { Search } from 'lucide-react'
import { cx } from '../lib/cx.ts'
import { Checkbox } from './Checkbox.tsx'
import styles from './Menu.module.css'

/** 드롭다운 패널 (Figma: 게임 드롭다운 · 게임 더보기 드롭다운의 바탕) */
export function Menu({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div role="listbox" className={cx(styles.menu, className)} {...rest} />
}

/** Figma: 드롭다운 옵션 (높이 29) */
export function MenuOption({ className, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  return <button type="button" role="option" className={cx(styles.option, className)} {...rest} />
}

interface GameOption {
  id: string
  name: string
}

interface GameMoreMenuProps {
  games: GameOption[]
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}

/** Figma: 게임 더보기 드롭다운. "+N ▾" 칩을 누르면 열린다. */
export function GameMoreMenu({ games, selected, onToggle, onSelectAll, onClearAll }: GameMoreMenuProps) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visible = q ? games.filter((g) => g.name.toLowerCase().includes(q)) : games

  return (
    <div className={cx(styles.menu, styles.gameMenu)}>
      <label className={styles.search}>
        <Search size={13} strokeWidth={2} absoluteStrokeWidth aria-hidden />
        <input
          className={styles.searchInput}
          type="search"
          placeholder="게임 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className={styles.gameList}>
        {visible.map((g) => {
          const checked = selected.has(g.id)
          return (
            <Checkbox
              key={g.id}
              className={cx(styles.gameOption, checked && styles.gameChecked)}
              checked={checked}
              onChange={() => onToggle(g.id)}
            >
              {g.name}
            </Checkbox>
          )
        })}
        {visible.length === 0 && <p className={styles.empty}>일치하는 게임이 없습니다.</p>}
      </div>
      <div className={styles.footer}>
        <button type="button" className={cx(styles.footerButton, styles.selectAll)} onClick={onSelectAll}>
          전체 선택
        </button>
        <button type="button" className={cx(styles.footerButton, styles.clearAll)} onClick={onClearAll}>
          선택 해제
        </button>
      </div>
    </div>
  )
}
