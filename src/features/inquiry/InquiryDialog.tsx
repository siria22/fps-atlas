import { useEffect, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog.tsx'
import { Field, TextField } from '../../components/FormField.tsx'
import { Checkbox } from '../../components/Checkbox.tsx'
import { loginWithGoogle, useAuth } from '../../lib/auth.tsx'
import { useI18n } from '../../i18n/i18n.tsx'
import { sendInquiry, type InquiryCategory } from '../../lib/inquiry.ts'
import buttons from '../account/AccountDeletion.module.css'
import styles from './InquiryDialog.module.css'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 문의 작성(Figma 11-d). 로그인한 사용자만 보낼 수 있고, 회신 이메일은 Google 계정 이메일로 채운다. */
export function InquiryDialog({ category, onClose }: { category: InquiryCategory; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { user, loading } = useAuth()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState(user?.email ?? '')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loginError, setLoginError] = useState('')

  // 다이얼로그 안에서 로그인(One Tap)하면 그 계정 이메일을 채운다.
  useEffect(() => {
    if (user?.email) setReplyTo((current) => current || user.email!)
  }, [user])

  const emailInvalid = replyTo.trim() !== '' && !EMAIL.test(replyTo.trim())
  const ready = subject.trim() !== '' && body.trim() !== '' && EMAIL.test(replyTo.trim()) && consent

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    const result = await sendInquiry({
      category, subject: subject.trim(), body: body.trim(), replyTo: replyTo.trim(),
      consent: true, pageUrl: window.location.href, locale: lang,
    })
    setBusy(false)
    if (result.ok) setSent(true)
    else setError(t(`inquiry.error.${result.code}`))
  }

  if (!user) {
    const login = () => { setLoginError(''); void loginWithGoogle(window.location.pathname).catch((e: Error) => setLoginError(e.message)) }
    return (
      <Dialog title={t('inquiry.title')} onDismiss={onClose}
        actions={<>
          <button type="button" className={buttons.secondary} onClick={onClose}>{t('inquiry.cancel')}</button>
          <button type="button" className={buttons.primary} disabled={loading} onClick={login}>{t('auth.login')}</button>
        </>}>
        <p>{t('inquiry.loginRequired')}</p>
        {loginError && <p role="alert" className={styles.error}>{loginError}</p>}
      </Dialog>
    )
  }

  if (sent) {
    return (
      <Dialog title={t('inquiry.sentTitle')} onDismiss={onClose}
        actions={<button type="button" className={buttons.primary} onClick={onClose}>{t('inquiry.ok')}</button>}>
        <p>{t('inquiry.sentBody', { email: replyTo.trim() })}</p>
      </Dialog>
    )
  }

  return (
    <Dialog title={t('inquiry.title')} onDismiss={busy ? undefined : onClose}
      actions={<>
        <button type="button" className={buttons.secondary} disabled={busy} onClick={onClose}>{t('inquiry.cancel')}</button>
        <button type="submit" form="inquiry-form" className={buttons.primary} disabled={busy || !ready}>
          {busy ? t('inquiry.sending') : t('inquiry.send')}
        </button>
      </>}>
      <form id="inquiry-form" className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>{t('inquiry.intro')}</p>
        <TextField label={t('inquiry.subject')} value={subject} maxLength={200} required disabled={busy}
          placeholder={t('inquiry.subjectPlaceholder')} onChange={(e) => setSubject(e.target.value)} />
        <Field label={t('inquiry.body')}>
          {(id) => (
            <textarea id={id} className={styles.textarea} rows={6} maxLength={5000} required disabled={busy}
              placeholder={t('inquiry.bodyPlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
          )}
        </Field>
        <TextField label={t('inquiry.replyTo')} type="email" value={replyTo} maxLength={320} required disabled={busy}
          error={emailInvalid ? t('inquiry.emailInvalid') : null} hint={t('inquiry.replyToHint')}
          onChange={(e) => setReplyTo(e.target.value)} />
        <Checkbox checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} className={styles.consent}>
          <span>{t('inquiry.consent')}</span>
        </Checkbox>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </form>
    </Dialog>
  )
}
