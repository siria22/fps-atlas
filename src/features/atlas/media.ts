import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase.ts'
import type { Place } from './data.ts'

/** 외부 자료와 DB의 URL은 HTTP(S)만 링크로 사용한다. */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export function publicImageUrl(path: string | null): string | null {
  return path ? supabase.storage.from('public-images').getPublicUrl(path).data.publicUrl : null
}

interface Article {
  language: 'en'
  title: string
}

export interface HistorySummary extends Article {
  extract: string
  url: string
}

/**
 * 사건 문서를 먼저, 없으면 장소 문서를 조회한다. 화면 언어와 관계없이 영어 위키백과만 쓴다
 * (한국어 문서가 없는 장소가 많아서, 2026-10-14 결정). 한국어 제목 칸은 읽지 않는다.
 */
export function historyArticles(place: Place): Article[] {
  const titles = [...place.events.map((event) => event.wikipediaTitleEn), place.wikipediaTitleEn]
    .map((title) => title?.trim())
    .filter((title): title is string => Boolean(title))
  return [...new Set(titles)].map((title) => ({ language: 'en', title }))
}

// Wikimedia API 이용 정책: 브라우저는 User-Agent를 못 바꾸므로 Api-User-Agent로 서비스와 연락처를 밝힌다.
const WIKIMEDIA_HEADERS = { 'Api-User-Agent': 'FpsAtlas/0.1 (https://fps-atlas.pages.dev; https://github.com/siria22/fps-atlas)' }

export async function fetchHistory(articles: Article[], signal: AbortSignal): Promise<HistorySummary | null> {
  let failed = false
  for (const article of articles) {
    try {
      const response = await fetch(`https://${article.language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article.title)}`, {
        headers: WIKIMEDIA_HEADERS,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      })
      if (response.status === 404) continue
      if (!response.ok) throw new Error(`Wikipedia: ${response.status}`)
      const body = await response.json() as {
        type?: string; title?: string; extract?: string
        content_urls?: { desktop?: { page?: string } }
      }
      if (body.type === 'disambiguation' || !body.extract?.trim()) continue
      return {
        ...article,
        title: body.title ?? article.title,
        extract: body.extract,
        url: safeExternalUrl(body.content_urls?.desktop?.page) ?? `https://${article.language}.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
      }
    } catch (error) {
      if (signal.aborted) throw error
      failed = true
    }
  }
  if (failed) throw new Error('위키백과 요약을 불러오지 못했습니다.')
  return null
}

export function useHistorySummary(place: Place) {
  const articles = historyArticles(place)
  return useQuery({
    queryKey: ['history-summary', articles],
    queryFn: ({ signal }) => fetchHistory(articles, signal),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  })
}

export function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/^(File|Image):/i, ''))}`
}

export function useCommonsPhoto(file: string | null) {
  return useQuery({
    queryKey: ['commons-photo', file],
    enabled: Boolean(file),
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        action: 'query', format: 'json', origin: '*', prop: 'imageinfo',
        titles: `File:${file!.replace(/^(File|Image):/i, '')}`, iiprop: 'url', iiurlwidth: '688',
      })
      const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        headers: WIKIMEDIA_HEADERS,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      })
      if (!response.ok) throw new Error('지역 사진을 불러오지 못했습니다.')
      const body = await response.json() as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }> } }
      const info = Object.values(body.query?.pages ?? {}).flatMap((p) => p.imageinfo ?? [])[0]
      const url = safeExternalUrl(info?.thumburl ?? info?.url)
      if (!url) throw new Error('등록된 Commons 사진을 찾을 수 없습니다.')
      return url
    },
  })
}
