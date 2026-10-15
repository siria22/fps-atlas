import { useSyncExternalStore } from 'react'

/** 모바일 레이아웃 기준(CSS의 `@media (max-width: 760px)`와 같은 값) */
export const MOBILE_QUERY = '(max-width: 760px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)
