import { useId, useRef, useState, type DragEvent } from 'react'
import { Image, Upload } from 'lucide-react'
import { cx } from '../lib/cx.ts'
import styles from './ImageUploadField.module.css'

/** 브라우저에서 WebP로 줄인 뒤의 첨부 정보 */
export interface AttachedImage {
  fileName: string
  width: number
  height: number
  bytes: number
  previewUrl: string
}

interface ImageUploadFieldProps {
  label: string
  value: AttachedImage | null
  error?: string | null
  disabled?: boolean
  onSelect: (file: File) => void
  onRemove: () => void
}

const ACCEPT = 'image/jpeg,image/png,image/webp'

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`
}

/** Figma: FormField · 이미지 업로드 (비어 있음 / 첨부됨 / 오류). 항목당 1장. */
export function ImageUploadField({ label, value, error, disabled = false, onSelect, onRemove }: ImageUploadFieldProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onSelect(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) pick(e.dataTransfer.files)
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
      {value ? (
        <div className={styles.attached}>
          <div className={styles.preview}>
            {value.previewUrl ? (
              <img className={styles.previewImg} src={value.previewUrl} alt={`${label} 미리보기`} />
            ) : (
              <Image size={22} strokeWidth={2} absoluteStrokeWidth aria-hidden />
            )}
          </div>
          <div className={styles.info}>
            <span className={styles.fileName}>{value.fileName}</span>
            <span className={styles.fileMeta}>
              {value.width} × {value.height} · WebP 변환 · {formatBytes(value.bytes)}
            </span>
            <span className={styles.actions}>
              <button type="button" className={cx(styles.action, styles.replace)} disabled={disabled} onClick={() => inputRef.current?.click()}>
                교체
              </button>
              <button type="button" className={cx(styles.action, styles.remove)} disabled={disabled} onClick={onRemove}>
                삭제
              </button>
            </span>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-controls={id}
          className={cx(styles.drop, dragging && styles.dragging, error && styles.invalid)}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Upload size={18} strokeWidth={2} absoluteStrokeWidth aria-hidden />
          <span className={styles.dropTitle}>이미지를 끌어 놓거나 클릭해 선택</span>
          <span className={styles.dropHint}>JPG·PNG·WebP · 최대 10MB · 긴 변 1600px로 줄여 저장</span>
        </div>
      )}
      {error && (
        <p className={styles.message} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
