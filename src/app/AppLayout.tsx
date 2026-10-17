import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { cx } from '../lib/cx.ts'
import { BrandMark } from '../components/BrandMark.tsx'
import { useAuth, loginWithGoogle, signOut } from '../lib/auth.tsx'
import { useI18n, type Lang } from '../i18n/i18n.tsx'
import { DeleteAccountButton } from '../features/account/AccountDeletion.tsx'
import styles from './AppLayout.module.css'

const LANGS: { value: Lang; label: string }[] = [
  { value: 'ko', label: 'KO' },
  { value: 'en', label: 'EN' },
]

/** 화면 언어 전환(로그인 버튼 왼쪽) */
function LanguageSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className={styles.lang} role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button key={l.value} type="button" className={cx(styles.langOption, lang === l.value && styles.langActive)}
          aria-pressed={lang === l.value} onClick={() => setLang(l.value)}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** 헤더(서비스 탐색) · 본문 · 푸터(서비스 안내). 모바일(760 이하)은 헤더의 ☰로 여는 메뉴 드로어에 탐색·언어·계정·안내를 모은다. */
export function AppLayout() {
  const { user, profile, loading } = useAuth()
  const [authError, setAuthError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const { t } = useI18n()

  // 다른 화면으로 이동하면 메뉴를 닫는다.
  useEffect(() => setMenuOpen(false), [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const name = profile?.display_name ?? user?.user_metadata.name ?? ''
  // 탈퇴 창은 공개 이미지 출처에 남는 이름을 보여 준다(실명이 아닌 닉네임)
  const creditName = profile?.nickname ?? ''
  const login = () => { setAuthError(''); void loginWithGoogle(window.location.pathname).catch((e: Error) => setAuthError(e.message)) }
  const logout = () => { setAuthError(''); void signOut().catch((e: Error) => setAuthError(e.message)) }
  const navItems = (className?: string, activeClass?: string) => (
    <>
      <NavLink to="/" end className={({ isActive }) => cx(className, isActive && activeClass)}>{t('nav.map')}</NavLink>
      <NavLink to="/report" className={({ isActive }) => cx(className, isActive && activeClass)}>{t('nav.report')}</NavLink>
      {user && <NavLink to="/my" className={({ isActive }) => cx(className, isActive && activeClass)}>{t('nav.my')}</NavLink>}
      {profile?.role === 'admin' && <NavLink to="/admin" className={({ isActive }) => cx(className, isActive && activeClass)}>{t('nav.admin')}</NavLink>}
    </>
  )
  const loginButton = user
    ? <button type="button" className={styles.login} onClick={logout}>{name || t('auth.logout')} · {t('auth.logout')}</button>
    : <button type="button" className={styles.login} disabled={loading} onClick={login}>
      {t('auth.login')} <ArrowUpRight size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
    </button>

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand}>
          <span className={styles.symbol}>
            <BrandMark />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>{t('brand.name')}</span>
            <span className={styles.brandTagline}>{t('brand.tagline')}</span>
          </span>
        </NavLink>
        <nav className={styles.nav}>{navItems(styles.navItem, styles.navActive)}</nav>
        <div className={styles.account}>
          <LanguageSwitch />
          {loginButton}
          {authError && <span role="alert" className={styles.notice}>{authError}</span>}
        </div>
        <button type="button" className={styles.menuButton} aria-label={t('nav.menu')} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Menu size={22} strokeWidth={1.6} absoluteStrokeWidth aria-hidden />
        </button>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerAccount}>
          <NavLink to="/guide" className={styles.footerLeft}>{t('footer.guide')}</NavLink>
          {user && (
            <>
              <span className={styles.footerDivider} aria-hidden />
              <span className={styles.footerEmail}>{t('footer.account', { email: user.email ?? '' })}</span>
            </>
          )}
          {/* 해제 후 로그아웃돼도 완료 다이얼로그가 남도록 항상 그린다 */}
          <DeleteAccountButton name={creditName} showButton={Boolean(user)} className={styles.footerUnlink} />
        </div>
        <span className={styles.footerRight}>{t('footer.borders')}</span>
      </footer>

      {/* 모바일 메뉴 드로어. 연동 해제 다이얼로그가 닫힐 때까지 살아 있도록 항상 그리고 열림 상태만 바꾼다. */}
      <div className={cx(styles.drawerLayer, menuOpen && styles.drawerOpen)}>
        <div className={styles.drawerBackdrop} onClick={() => setMenuOpen(false)} />
        <aside className={styles.drawer} aria-label={t('nav.menu')} inert={!menuOpen}>
          <div className={styles.drawerTop}>
            <button type="button" className={styles.menuButton} aria-label={t('nav.menuClose')} onClick={() => setMenuOpen(false)}>
              <X size={22} strokeWidth={1.6} absoluteStrokeWidth aria-hidden />
            </button>
          </div>
          <nav className={styles.drawerNav}>{navItems(styles.drawerItem, styles.drawerActive)}</nav>
          <div className={styles.drawerSection}>
            <div className={styles.drawerRow}>
              <span>{t('lang.short')}</span>
              <LanguageSwitch />
            </div>
            {user && (
              <div className={styles.drawerAccount}>
                <strong>{name}</strong>
                <span>{t('footer.account', { email: user.email ?? '' })}</span>
              </div>
            )}
            {user ? <button type="button" className={styles.login} onClick={logout}>{t('auth.logout')}</button> : loginButton}
            {authError && <span role="alert" className={styles.drawerNotice}>{authError}</span>}
          </div>
          <div className={styles.drawerSection}>
            <NavLink to="/guide" className={styles.drawerLink}>{t('footer.guide')}</NavLink>
            <DeleteAccountButton name={creditName} showButton={Boolean(user)} className={styles.drawerUnlink} />
          </div>
          <span className={styles.drawerFoot}>{t('footer.borders')}</span>
        </aside>
      </div>
    </div>
  )
}
