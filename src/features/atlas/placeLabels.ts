import { useQuery } from '@tanstack/react-query'
import { useI18n } from '../../i18n/i18n.tsx'
import type { Place } from './data.ts'

interface GeoNamesEn {
  countries: Record<string, string>
  admin1: Record<string, string>
}

/** 국가·주·도 영어 이름(Natural Earth). 영어 화면일 때만 내려받는다. */
function useGeoNamesEn(enabled: boolean) {
  return useQuery({
    queryKey: ['geo-names-en'],
    enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<GeoNamesEn> => {
      const [countries, admin1] = await Promise.all([
        fetch('/geo/countries.json').then((r) => r.json() as Promise<{ code: string; nameEn: string }[]>),
        fetch('/geo/admin1-names-en.json').then((r) => r.json() as Promise<Record<string, string>>),
      ])
      return { countries: Object.fromEntries(countries.map((c) => [c.code, c.nameEn])), admin1 }
    },
  })
}

type PlaceNames = Pick<Place, 'name' | 'nameEn' | 'country' | 'region' | 'countryCode' | 'admin1Code'>

/**
 * 화면 언어에 맞춘 장소 표시 이름. 영어 이름을 아직 못 불러왔거나 없으면 저장된(한국어) 이름을 쓴다.
 */
export function usePlaceLabels() {
  const { lang } = useI18n()
  const geo = useGeoNamesEn(lang === 'en').data
  const english = lang === 'en' && geo
  const name = (p: PlaceNames) => (lang === 'en' && p.nameEn) || p.name
  const country = (p: PlaceNames) => (english && p.countryCode && geo.countries[p.countryCode]) || p.country
  const region = (p: PlaceNames) => (english && p.admin1Code && geo.admin1[p.admin1Code]) || p.region
  const location = (p: PlaceNames) => {
    const r = region(p)
    return r ? `${country(p)} > ${r}` : country(p)
  }
  return { name, country, region, location }
}
