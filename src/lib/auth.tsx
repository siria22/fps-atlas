import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'

interface Profile { display_name: string; role: 'user' | 'admin'; avatar_url: string | null }
interface AuthState { user: User | null; profile: Profile | null; loading: boolean }
const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, loading: true })
  useEffect(() => {
    let active = true
    const apply = (session: Session | null) => setState({ user: session?.user ?? null, profile: null, loading: Boolean(session?.user) })
    void supabase.auth.getSession().then(({ data }) => { if (active) apply(data.session) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (active) apply(session) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    let active = true
    if (!state.user) return
    const loadProfile = async () => {
      try {
        const { data } = await supabase.from('profiles').select('display_name, role, avatar_url').eq('id', state.user!.id).maybeSingle()
        if (active) setState((current) => current.user?.id === state.user?.id ? { ...current, profile: data, loading: false } : current)
      } catch {
        if (active) setState((current) => ({ ...current, loading: false }))
      }
    }
    void loadProfile()
    return () => { active = false }
  }, [state.user])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/**
 * Google 로그인. 클라이언트 ID가 있으면 One Tap 창으로 ID 토큰을 받아 Supabase에 넘긴다.
 * 이때 Google 화면에는 supabase.co 대신 이 사이트 주소가 보인다.
 * One Tap을 쓸 수 없으면(ID 미설정, 스크립트 실패, 사용자가 여러 번 닫아 Google이 잠시 막음) Supabase 리디렉션 로그인으로 넘어간다.
 */
export async function loginWithGoogle(next = '/report') {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (clientId && await loginWithOneTap(clientId)) return
  await loginWithRedirect(next)
}

async function loginWithRedirect(next: string) {
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/report'
  const settingsResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
  if (!settingsResponse.ok) throw new Error('로그인 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  const settings = await settingsResponse.json() as { external?: { google?: boolean } }
  if (!settings.external?.google) throw new Error('Google 로그인이 아직 설정되지 않았습니다. Supabase Authentication에서 Google 공급자를 활성화해야 합니다.')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${safeNext}` },
  })
  if (error) throw error
}

interface PromptNotification {
  isNotDisplayed?: () => boolean
  isSkippedMoment?: () => boolean
  getSkippedReason?: () => string
}
interface GoogleId {
  initialize: (config: object) => void
  prompt: (listener?: (n: PromptNotification) => void) => void
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

let gisScript: Promise<GoogleId | null> | null = null
function loadGoogleIdentity(): Promise<GoogleId | null> {
  gisScript ??= new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve(window.google?.accounts.id ?? null)
    script.onerror = () => { gisScript = null; resolve(null) }
    document.head.appendChild(script)
  })
  return gisScript
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** One Tap 창을 띄운다. 로그인했거나 사용자가 직접 닫았으면 true, 창을 띄울 수 없었으면 false. */
async function loginWithOneTap(clientId: string): Promise<boolean> {
  const id = await loadGoogleIdentity()
  if (!id) return false
  // Google에는 해시한 nonce를, Supabase에는 원래 값을 넘겨 ID 토큰을 다시 쓰지 못하게 한다.
  const nonce = crypto.randomUUID()
  const hashedNonce = await sha256Hex(nonce)
  return new Promise<boolean>((resolve, reject) => {
    let gotCredential = false
    const shownAt = Date.now()
    id.initialize({
      client_id: clientId,
      nonce: hashedNonce,
      context: 'signin',
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
      callback: ({ credential }: { credential: string }) => {
        gotCredential = true
        supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce })
          .then(({ error }) => (error ? reject(error) : resolve(true)), reject)
      },
    })
    id.prompt((n) => {
      if (gotCredential) return
      if (n.isNotDisplayed?.()) resolve(false)
      else if (n.isSkippedMoment?.()) {
        // 브라우저 FedCM 창에서는 건너뛴 이유를 알려 주지 않는다. 곧바로 건너뛰었으면 창이 막힌 것으로 본다.
        const reason = n.getSkippedReason?.()
        resolve(reason ? reason === 'user_cancel' || reason === 'tap_outside' : Date.now() - shownAt > 1500)
      }
    })
  })
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
