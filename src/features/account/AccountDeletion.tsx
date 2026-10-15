import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/Dialog.tsx'
import { useI18n } from '../../i18n/i18n.tsx'
import { supabase } from '../../lib/supabase.ts'
import styles from './AccountDeletion.module.css'

/** my_account_summary() 결과 */
export interface AccountSummary {
  pending: number
  rejected: number
  suggestions: number
  publishedImages: number
  isAdmin: boolean
}

const GOOGLE_CONNECTIONS_URL = 'https://myaccount.google.com/connections'

interface ConfirmProps {
  summary: AccountSummary
  /** 지금 이미지 출처에 쓰이는 이름 */
  name: string
  busy?: boolean
  error?: string
  onCancel: () => void
  onConfirm: (keepName: boolean) => void
  inline?: boolean
  /** 개발용 미리보기에서 선택된 상태를 보여 줄 때만 */
  defaultKeepName?: boolean
}

/**
 * 연동 해제 확인. 상황에 따라 내용이 달라진다.
 * - 관리자: 해제 불가 안내만
 * - 반영되지 않은 제보가 있으면: 삭제 경고
 * - 공개된 이미지에 이름이 걸려 있으면: 이름 유지 / "사용자" 선택
 */
export function DeleteAccountDialog({ summary, name, busy = false, error, onCancel, onConfirm, inline, defaultKeepName }: ConfirmProps) {
  const { t } = useI18n()
  const [keepName, setKeepName] = useState<boolean | null>(defaultKeepName ?? null)
  const radioName = useId()

  if (summary.isAdmin) {
    return (
      <Dialog inline={inline} title={t('account.adminTitle')} onDismiss={onCancel}
        actions={<button type="button" className={styles.secondary} onClick={onCancel}>{t('account.close')}</button>}>
        <p>{t('account.adminBody')}</p>
      </Dialog>
    )
  }

  const unpublished = summary.pending + summary.rejected + summary.suggestions
  const asksName = summary.publishedImages > 0
  const ready = !asksName || keepName !== null
  return (
    <Dialog inline={inline} tone="danger" title={t('account.dialogTitle')} onDismiss={busy ? undefined : onCancel}
      actions={<>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>{t('account.cancel')}</button>
        <button type="button" className={styles.danger} disabled={busy || !ready} onClick={() => onConfirm(keepName ?? false)}>
          {busy ? t('account.working') : t('account.confirm')}
        </button>
      </>}>
      <p>{t('account.dialogBody')}</p>
      {unpublished > 0 && <p className={styles.warning}>{t('account.pendingWarning', { n: unpublished })}</p>}
      {asksName && (
        <fieldset className={styles.choice} disabled={busy}>
          <legend>{t('account.nameQuestion', { n: summary.publishedImages })}</legend>
          <label className={styles.option}>
            <input type="radio" name={radioName} checked={keepName === true} onChange={() => setKeepName(true)} />
            <span><b>{t('account.keepName')}</b><small>{t('account.keepNameHint', { name })}</small></span>
          </label>
          <label className={styles.option}>
            <input type="radio" name={radioName} checked={keepName === false} onChange={() => setKeepName(false)} />
            <span><b>{t('account.anonymize')}</b><small>{t('account.anonymizeHint')}</small></span>
          </label>
        </fieldset>
      )}
      {error && <p role="alert" className={styles.error}>{t('account.error', { message: error })}</p>}
    </Dialog>
  )
}

/** 연동 해제 완료. Google "연결된 앱" 정리는 여기서만 안내한다. */
export function DeleteAccountDoneDialog({ onClose, inline }: { onClose: () => void; inline?: boolean }) {
  const { t } = useI18n()
  return (
    <Dialog inline={inline} title={t('account.doneTitle')} onDismiss={onClose}
      actions={<button type="button" className={styles.primary} onClick={onClose}>{t('account.doneOk')}</button>}>
      <p>{t('account.doneBody')}</p>
      <p className={styles.note}>{t('account.doneGoogle')}</p>
      <a className={styles.link} href={GOOGLE_CONNECTIONS_URL} target="_blank" rel="noreferrer">{t('account.doneGoogleLink')}</a>
    </Dialog>
  )
}

type Step = { kind: 'idle' } | { kind: 'loading' } | { kind: 'confirm'; summary: AccountSummary } | { kind: 'done' }

/**
 * 로그인 상태 푸터의 "계정 연동 해제" 버튼과 그 흐름.
 * 해제하면 로그아웃되어 버튼이 사라지지만, 완료 다이얼로그는 남아야 하므로 이 컴포넌트는 항상 그려 두고 버튼만 숨긴다.
 */
export function DeleteAccountButton({ name, showButton, className }: { name: string; showButton: boolean; className?: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const open = async () => {
    setError('')
    setStep({ kind: 'loading' })
    const { data, error: rpcError } = await supabase.rpc('my_account_summary').single()
    if (rpcError || !data) {
      setStep({ kind: 'idle' })
      setError(rpcError?.message ?? 'unknown')
      return
    }
    setStep({ kind: 'confirm', summary: {
      pending: data.pending, rejected: data.rejected, suggestions: data.suggestions,
      publishedImages: data.published_images, isAdmin: data.is_admin,
    } })
  }

  const confirm = async (keepName: boolean) => {
    setBusy(true)
    setError('')
    const { error: fnError } = await supabase.functions.invoke('delete-account', { body: { keepName } })
    setBusy(false)
    if (fnError) {
      // 함수가 돌려준 안내 문구가 있으면 그것을 보여 준다
      const detail = await (fnError as { context?: Response }).context?.json?.().catch(() => null)
      setError((detail as { error?: string } | null)?.error ?? fnError.message)
      return
    }
    // 서버에서 계정이 지워졌으므로 이 브라우저의 로그인 정보만 지운다
    await supabase.auth.signOut({ scope: 'local' })
    setStep({ kind: 'done' })
  }

  return (
    <>
      {showButton && (
        <button type="button" className={className} disabled={step.kind === 'loading'} onClick={() => void open()}>
          {step.kind === 'loading' ? t('account.checking') : t('account.unlink')}
        </button>
      )}
      {showButton && step.kind === 'idle' && error && <span role="alert" className={styles.error}>{t('account.error', { message: error })}</span>}
      {step.kind === 'confirm' && (
        <DeleteAccountDialog summary={step.summary} name={name} busy={busy} error={error}
          onCancel={() => { setStep({ kind: 'idle' }); setError('') }} onConfirm={(keep) => void confirm(keep)} />
      )}
      {step.kind === 'done' && <DeleteAccountDoneDialog onClose={() => { setStep({ kind: 'idle' }); navigate('/', { replace: true }) }} />}
    </>
  )
}
