import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown, CircleAlert } from 'lucide-react'
import { cx } from '../lib/cx.ts'
import styles from './FormField.module.css'

interface FieldProps {
  label: ReactNode
  /** 오류 문구. 있으면 입력란 테두리가 빨갛게 바뀐다. */
  error?: string | null
  hint?: ReactNode
  className?: string
  children: (id: string, invalid: boolean) => ReactNode
}

/** Figma: FormField 공통 틀 (라벨 · 입력란 · 오류 문구) */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId()
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children(id, Boolean(error))}
      {error ? (
        <p className={styles.message} role="alert">
          {error}
        </p>
      ) : (
        hint && <p className={styles.hint}>{hint}</p>
      )}
    </div>
  )
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & Omit<FieldProps, 'children'>

/** Figma: FormField (유형=텍스트 / 오류) */
export function TextField({ label, error, hint, className, ...input }: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, invalid) => (
        <div className={cx(styles.control, invalid && styles.invalid)}>
          <input id={id} className={styles.input} aria-invalid={invalid} {...input} />
          {invalid && (
            <CircleAlert className={cx(styles.trailing, styles.alert)} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          )}
        </div>
      )}
    </Field>
  )
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & Omit<FieldProps, 'children'>

/** Figma: FormField 선택형 (chevron-down) */
export function SelectField({ label, error, hint, className, children, ...select }: SelectFieldProps & { children: ReactNode }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, invalid) => (
        <div className={cx(styles.control, invalid && styles.invalid)}>
          <select id={id} className={cx(styles.input, styles.select)} aria-invalid={invalid} {...select}>
            {children}
          </select>
          <ChevronDown className={styles.trailing} size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
        </div>
      )}
    </Field>
  )
}

/** Figma: FormField (유형=관리자 입력, 192×25) */
export function AdminInput({ className, ...input }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(styles.admin, className)} {...input} />
}

/** 관리자 확정 칸의 선택형(예: '도시 ▾'). 관리자 입력과 같은 모양. */
export function AdminSelect({ className, children, ...select }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(styles.admin, className)} {...select}>
      {children}
    </select>
  )
}
