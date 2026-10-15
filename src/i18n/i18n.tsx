import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, ko, type MessageKey } from './messages.ts'

export type Lang = 'ko' | 'en'

const STORAGE_KEY = 'lang'
const MESSAGES: Record<Lang, Record<MessageKey, string>> = { ko, en }

/** 저장해 둔 선택 → 없으면 브라우저 언어(한국어가 아니면 영어) */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ko' || saved === 'en') return saved
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 브라우저 언어로
  }
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Translate
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 기억하지 못해도 이번 방문 동안은 바뀐 언어로 보인다
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = MESSAGES[lang]['brand.name']
  }, [lang])

  const value = useMemo<I18n>(() => {
    const messages = MESSAGES[lang]
    const t: Translate = (key, vars) =>
      vars ? messages[key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : messages[key]
    return { lang, setLang, t }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n은 I18nProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
