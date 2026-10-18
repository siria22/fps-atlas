import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { geoArea, geoContains, geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { select } from 'd3-selection'
import { Info, MapPin, Minus, Plus, Undo2 } from 'lucide-react'
import { SearchCombo } from '../../components/SearchCombo.tsx'
import { useI18n } from '../../i18n/i18n.tsx'
import styles from './LocationPicker.module.css'

/** public/geo/countries.json (scripts/build-geo.ts) */
export interface GeoCountry {
  code: string
  name: string
  nameEn: string
  /** 수도 좌표, 수도가 없는 지역은 표시점 [lng, lat] */
  point: [number, number]
  pointIsCapital: boolean
  hasAdmin1: boolean
}
export interface Admin1Feature {
  type: 'Feature'
  properties: { code: string; name: string; nameEn: string; point: [number, number] }
  geometry: GeoPermissibleObjects
}

/** 제보 위치. 주·도를 비우면 국가 단위다. */
export interface LocationValue {
  countryCode: string | null
  country: string
  admin1Code: string | null
  region: string
}

/** 공개 좌표 (관리자 확정) */
export interface Coords {
  lat: number
  lng: number
}

/** 관리자 위치 카드(04 · 10)에서만 쓰는 공개 핀 */
export interface PinControl {
  coords: Coords | null
  onChange: (coords: Coords | null) => void
  /** 기존 장소를 고른 경우처럼 위치를 바꿀 수 없을 때 */
  readOnly?: boolean
}

const MAP_W = 496
const MAP_H = 260
const MAX_ZOOM = 8
/** 수도에서 이만큼(도) 넘게 떨어진 해외 영토 등은 처음 화면 맞춤에서 뺀다. 단, 너무 많이 빠지면(러시아 등) 전부 쓴다. */
const FIT_RADIUS = 25

const round = (value: number) => Math.round(value * 10000) / 10000

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json() as Promise<T>
}

export function useCountries() {
  return useQuery({ queryKey: ['geo-countries'], queryFn: () => fetchJson<GeoCountry[]>('/geo/countries.json'), staleTime: Infinity })
}

export function useAdmin1(countryCode: string | null) {
  return useQuery({
    queryKey: ['geo-admin1', countryCode],
    enabled: Boolean(countryCode),
    staleTime: Infinity,
    queryFn: () => fetchJson<{ features: Admin1Feature[] }>(`/geo/admin1/${countryCode}.json`).then((d) => d.features),
  })
}

export function findCountry(countries: GeoCountry[] | undefined, text: string) {
  const q = text.trim().toLocaleLowerCase()
  if (!q) return null
  return countries?.find((c) => c.name.toLocaleLowerCase() === q || c.nameEn.toLocaleLowerCase() === q) ?? null
}

/** 공개 좌표 기본값: 주·도 대표 지점, 국가만 있으면 수도 */
export function defaultCoords(country: GeoCountry | null, region: Admin1Feature | null): Coords | null {
  const point = region?.properties.point ?? country?.point
  return point ? { lng: round(point[0]), lat: round(point[1]) } : null
}

/**
 * Figma `SectionCard / 위치 선택 · 주·도` (88:2139).
 * 제보자 유형(03): 국가·주·도만 고른다.
 * 관리자 유형(04 · 10, `pin`을 넘김): 지도 클릭으로 공개 핀을 옮기고 위도·경도를 확정한다.
 */
export function LocationPicker(props: {
  value: LocationValue
  onChange: (next: LocationValue) => void
  pin?: PinControl
  title?: string
  caption?: string
  /** 04 검토 패널 안처럼 카드 테두리 없이 넣을 때 */
  embedded?: boolean
}) {
  const { value, onChange, pin } = props
  const countries = useCountries()
  const admin1 = useAdmin1(value.countryCode)
  const regions = admin1.data ?? []
  const readOnly = pin?.readOnly ?? false
  const country = countries.data?.find((c) => c.code === value.countryCode) ?? null
  const regionFeature = regions.find((r) => r.properties.code === value.admin1Code) ?? null
  const { lang, t } = useI18n()
  // 화면 언어 이름과 다른 언어 이름(검색용)
  const shown = (x: { name: string; nameEn: string }) => (lang === 'en' ? x.nameEn || x.name : x.name)
  const other = (x: { name: string; nameEn: string }) => (lang === 'en' ? x.name : x.nameEn)
  // 입력 중인 글자. 칸을 벗어나거나 목록에서 고르면 비우고, 고른 곳을 화면 언어 이름으로 보여 준다.
  const [countryDraft, setCountryDraft] = useState<string | null>(null)
  const [regionDraft, setRegionDraft] = useState<string | null>(null)
  const countryText = countryDraft ?? (country ? shown(country) : value.country)
  const regionText = regionDraft ?? (regionFeature ? shown(regionFeature.properties) : value.region)

  // 저장값은 목록과 맞으면 표준(한국어) 이름, 아니면 친 글자 그대로
  const setCountry = (text: string) => {
    const match = findCountry(countries.data, text)
    const code = match?.code ?? null
    const name = match?.name ?? text
    // 나라가 바뀌면 주·도는 비운다. 관리자 핀은 그 나라 수도로 옮긴다.
    if (code !== value.countryCode) {
      onChange({ countryCode: code, country: name, admin1Code: null, region: '' })
      setRegionDraft(null)
      pin?.onChange(defaultCoords(match, null))
    } else onChange({ ...value, country: name })
  }
  const setRegionText = (text: string) => {
    const q = text.trim().toLocaleLowerCase()
    const match = regions.find((r) => r.properties.name.toLocaleLowerCase() === q || r.properties.nameEn.toLocaleLowerCase() === q) ?? null
    onChange({ ...value, region: match?.properties.name ?? text, admin1Code: match?.properties.code ?? null })
    if ((match?.properties.code ?? null) !== value.admin1Code) pin?.onChange(defaultCoords(country, match))
  }
  const pickRegion = (feature: Admin1Feature, at?: Coords) => {
    setRegionDraft(null)
    onChange({ ...value, region: feature.properties.name, admin1Code: feature.properties.code })
    pin?.onChange(at ?? defaultCoords(country, feature))
  }

  const summary = country
    ? regionFeature
      ? `${shown(country)} > ${shown(regionFeature.properties)}`
      : value.admin1Code
        ? `${shown(country)} > ${value.region}`
        : t('loc.countryLevel', { country: shown(country) })
    : null

  return (
    <section className={props.embedded ? styles.embedded : styles.card}>
      {!props.embedded && (
        <div className={styles.title}>
          <div>
            <h2>{props.title ?? t('loc.title')}</h2>
            <p className={styles.caption}>{props.caption ?? t('loc.caption')}</p>
          </div>
          <MapPin size={18} strokeWidth={2} absoluteStrokeWidth className={styles.titleIcon} />
        </div>
      )}

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('loc.country')}</span>
          <SearchCombo
            id="geo-country"
            value={countryText}
            onChange={(text) => { setCountryDraft(text); setCountry(text) }}
            onPick={(o) => { setCountryDraft(null); setCountry(countries.data?.find((c) => c.code === o.id)?.name ?? o.label) }}
            onBlur={() => setCountryDraft(null)}
            options={(countries.data ?? []).map((c) => ({ id: c.code, label: shown(c), terms: [other(c)] }))}
            placeholder={t('loc.countryPlaceholder')}
            disabled={readOnly}
            classNames={{ combo: styles.combo, input: styles.input }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('loc.region')}</span>
          <SearchCombo
            id="geo-admin1"
            value={regionText}
            onChange={(text) => { setRegionDraft(text); setRegionText(text) }}
            onPick={(o) => { const f = regions.find((r) => r.properties.code === o.id); if (f) pickRegion(f) }}
            onBlur={() => setRegionDraft(null)}
            options={regions.map((r) => ({ id: r.properties.code, label: shown(r.properties), terms: [other(r.properties)] }))}
            placeholder={value.countryCode ? t('loc.regionPlaceholder') : t('loc.countryFirst')}
            disabled={!value.countryCode || readOnly}
            classNames={{ combo: styles.combo, input: styles.input }}
          />
        </label>
      </div>
      <small className={styles.help}>{t('loc.help')}</small>

      <RegionMap regions={regions} country={country} selected={value.admin1Code} loading={admin1.isLoading} onPick={pickRegion} pin={pin} />

      {pin ? (
        <>
          <div className={styles.coords}>
            <CoordField
              label={t('loc.lat')}
              value={pin.coords?.lat}
              disabled={readOnly}
              onChange={(lat) => pin.onChange({ lat, lng: pin.coords?.lng ?? 0 })}
            />
            <CoordField
              label={t('loc.lng')}
              value={pin.coords?.lng}
              disabled={readOnly}
              onChange={(lng) => pin.onChange({ lat: pin.coords?.lat ?? 0, lng })}
            />
            <button type="button" className={styles.reset} disabled={readOnly || !country} onClick={() => pin.onChange(defaultCoords(country, regionFeature))}>
              <Undo2 size={14} /> {t('loc.reset')}
            </button>
          </div>
          <div className={styles.callout}>
            <Info size={14} />
            <span>
              <b>{t('loc.defaultTitle')}</b>
              <br />
              {readOnly ? t('loc.existingHint') : t('loc.pinHint')}
            </span>
          </div>
        </>
      ) : (
        <div className={styles.callout}>
          <Info size={14} />
          <span>
            <b>{summary ? t('loc.selected', { summary }) : t('loc.countryFirst')}</b>
            <br />
            {t('loc.emptyRegionNote')}
          </span>
        </div>
      )}
    </section>
  )
}

/** 위도·경도 입력. 지도 클릭·대표 지점처럼 바깥에서 값이 바뀌면 입력란도 따라간다. */
function CoordField(props: { label: string; value: number | undefined; disabled: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState(props.value?.toString() ?? '')
  const [lastValue, setLastValue] = useState(props.value)
  if (props.value !== lastValue) {
    setLastValue(props.value)
    setText(props.value?.toString() ?? '')
  }
  return (
    <label className={styles.field}>
      <span className={styles.label}>{props.label}</span>
      <input
        className={styles.coordInput}
        inputMode="decimal"
        value={text}
        disabled={props.disabled}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() && Number.isFinite(n)) props.onChange(n)
        }}
      />
    </label>
  )
}

function RegionMap(props: {
  regions: Admin1Feature[]
  country: { point: [number, number] } | null
  selected: string | null
  loading: boolean
  onPick: (feature: Admin1Feature, at?: Coords) => void
  pin?: PinControl
}) {
  const { regions, country, selected, loading, onPick, pin } = props
  const { lang, t } = useI18n()
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)

  const { paths, projection } = useMemo(() => {
    if (!regions.length) return { paths: [], projection: null }
    const [cx, cy] = country?.point ?? regions[0]?.properties.point ?? [0, 0]
    const near = regions.filter((r) => Math.hypot(r.properties.point[0] - cx, r.properties.point[1] - cy) <= FIT_RADIUS)
    const fitTo = near.length >= regions.length * 0.7 ? near : regions
    const projection = geoMercator().fitExtent(
      [
        [12, 12],
        [MAP_W - 12, MAP_H - 12],
      ],
      { type: 'FeatureCollection', features: fitTo } as GeoPermissibleObjects,
    )
    const path = geoPath(projection)
    // Natural Earth에는 큰 구역이 안쪽 도시를 구멍 없이 덮는 경우가 있다(경기도⊃서울, 중앙보헤미아⊃프라하).
    // 큰 구역부터 그려 작은 구역이 위에 오게 한다.
    const bySize = [...regions].sort((a, b) => geoArea(b.geometry) - geoArea(a.geometry))
    return { paths: bySize.map((r) => ({ feature: r, d: path(r.geometry) ?? '' })), projection }
  }, [regions, country])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .on('zoom', (e: { transform: ZoomTransform }) => setTransform(e.transform))
    zoomRef.current = behavior
    const sel = select(el).call(behavior).on('dblclick.zoom', null)
    return () => {
      sel.on('.zoom', null)
    }
  }, [])

  // 나라가 바뀌면 처음 배율로 되돌린다
  useEffect(() => {
    const el = svgRef.current
    if (el && zoomRef.current) select(el).call(zoomRef.current.transform, zoomIdentity)
  }, [paths])

  const zoomBy = (k: number) => {
    const el = svgRef.current
    if (el && zoomRef.current) select(el).call(zoomRef.current.scaleBy, k)
  }

  // 관리자: 클릭한 지점에 공개 핀을 두고, 그 지점이 속한 주·도를 고른다
  const placePin = (event: MouseEvent<SVGSVGElement>) => {
    if (!pin || pin.readOnly || !projection || !svgRef.current) return
    const box = svgRef.current.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * MAP_W
    const y = ((event.clientY - box.top) / box.height) * MAP_H
    const lngLat = projection.invert?.(transform.invert([x, y]))
    if (!lngLat) return
    const at = { lng: round(lngLat[0]), lat: round(lngLat[1]) }
    // 겹치는 구역이 여럿이면 가장 작은 쪽(서울 vs 경기도)
    const hit = regions.filter((r) => geoContains(r.geometry, lngLat)).sort((a, b) => geoArea(a.geometry) - geoArea(b.geometry))[0]
    if (hit) onPick(hit, at)
    else pin.onChange(at)
  }
  const pinPoint = pin?.coords && projection ? projection([pin.coords.lng, pin.coords.lat]) : null

  return (
    <div className={styles.map}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        role="img"
        aria-label={pin ? t('loc.mapPin') : t('loc.mapRegion')}
        onClick={pin ? placePin : undefined}
      >
        <g transform={transform.toString()}>
          {paths.map(({ feature, d }) => (
            <path
              key={feature.properties.code}
              d={d}
              className={feature.properties.code === selected ? styles.regionSelected : styles.region}
              style={{ strokeWidth: (feature.properties.code === selected ? 1.5 : 0.6) / transform.k }}
              onClick={pin ? undefined : () => onPick(feature)}
            >
              <title>{lang === 'en' ? feature.properties.nameEn || feature.properties.name : feature.properties.name}</title>
            </path>
          ))}
          {pinPoint && (
            <g transform={`translate(${pinPoint[0]} ${pinPoint[1]}) scale(${1 / transform.k})`} className={styles.pin} data-testid="public-pin">
              <circle r={6} />
              <circle r={2} className={styles.pinDot} />
            </g>
          )}
        </g>
      </svg>
      <span className={styles.mapHint}>
        {loading
          ? t('loc.loading')
          : !regions.length
            ? t('loc.pickCountry')
            : pin
              ? pin.readOnly
                ? t('loc.readonlyHint')
                : t('loc.pinMapHint')
              : t('loc.regionMapHint')}
      </span>
      <div className={styles.zoom}>
        <button type="button" aria-label={t('loc.zoomIn')} onClick={() => zoomBy(1.6)}>
          <Plus size={14} />
        </button>
        <button type="button" aria-label={t('loc.zoomOut')} onClick={() => zoomBy(1 / 1.6)}>
          <Minus size={14} />
        </button>
      </div>
    </div>
  )
}
