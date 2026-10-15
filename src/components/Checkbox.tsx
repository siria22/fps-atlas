import type { InputHTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cx } from '../lib/cx.ts'
import styles from './Checkbox.module.css'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children?: ReactNode
}

/** Figma: Checkbox (선택 / 해제). 라벨은 children으로 받는다. */
export function Checkbox({ children, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(styles.label, className)}>
      <input type="checkbox" className={styles.input} {...rest} />
      <span className={styles.box} aria-hidden>
        <Check className={styles.check} size={10} strokeWidth={2} absoluteStrokeWidth />
      </span>
      {children}
    </label>
  )
}
