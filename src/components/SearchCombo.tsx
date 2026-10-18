import { useState, type KeyboardEvent } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Menu, MenuOption } from './Menu.tsx'
import styles from './SearchCombo.module.css'

export interface ComboOption {
  id: string
  /** 목록에 보이는 이름 */
  label: string
  /** 이 글자들로도 찾는다(다른 언어 이름·별칭). label은 넣지 않아도 된다. */
  terms?: string[]
}

const normalize = (s: string) => s.trim().toLocaleLowerCase()

/**
 * 검색 입력 + 드롭다운(Figma 게임 드롭다운). 목록에는 label만 한 번씩 보이고, terms로도 찾는다.
 * 예: 게임은 영문 공식명을 보여 주고 한국어 이름으로 찾기, 국가는 한국어 이름을 보여 주고 영어 이름으로 찾기.
 * 직접 입력도 그대로 된다(목록에 없는 값).
 */
export function SearchCombo(props: {
  id: string
  value: string
  onChange: (text: string) => void
  onPick: (option: ComboOption) => void
  /** 입력칸을 벗어날 때(친 글자를 표준 이름으로 맞출 때) */
  onBlur?: () => void
  options: ComboOption[]
  placeholder: string
  disabled?: boolean
  required?: boolean
  /** 부르는 쪽 화면의 입력칸 모양 */
  classNames: { combo?: string; input?: string }
}) {
  const { id, value, options } = props
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const q = normalize(value)
  const visible = q ? options.filter((o) => [o.label, ...(o.terms ?? [])].some((t) => normalize(t).includes(q))) : options
  const shown = open && visible.length > 0
  const pick = (o: ComboOption) => { props.onPick(o); setOpen(false) }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (visible.length ? (i + step + visible.length) % visible.length : 0))
    } else if (e.key === 'Enter' && shown && visible[active]) {
      e.preventDefault()
      pick(visible[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className={styles.wrap}>
      <span className={props.classNames.combo}>
        <Search size={14} aria-hidden />
        <input
          className={props.classNames.input}
          role="combobox"
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={shown && visible[active] ? `${id}-${visible[active].id}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(e) => { props.onChange(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setOpen(false); props.onBlur?.() }}
          onKeyDown={onKey}
          placeholder={props.placeholder}
          disabled={props.disabled}
          required={props.required}
        />
        <ChevronDown size={14} aria-hidden />
      </span>
      {shown && (
        <Menu id={`${id}-list`} className={styles.menu}>
          {visible.map((o, i) => (
            <MenuOption
              key={o.id}
              id={`${id}-${o.id}`}
              aria-selected={i === active}
              className={i === active ? styles.active : undefined}
              // 입력칸 포커스를 잃기 전에 고른다
              onMouseDown={(e) => { e.preventDefault(); pick(o) }}
            >
              {o.label}
            </MenuOption>
          ))}
        </Menu>
      )}
    </div>
  )
}
