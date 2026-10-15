import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { geoDistance, geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import countriesUrl from 'world-atlas/countries-50m.json?url'
import { ClusterBadge, Pin } from '../../components/Pin.tsx'
import { clusterPoints, type MapMarker } from './cluster.ts'
import type { VisiblePlace } from './filters.ts'
import { useI18n } from '../../i18n/i18n.tsx'
import { usePlaceLabels } from './placeLabels.ts'
import { useIsMobile } from '../../lib/useMediaQuery.ts'
import styles from './WorldMap.module.css'

const CLUSTER_RADIUS = 36
/** 최대 배율. 축척 막대가 적도 근처 100km, 중위도 50km 안팎까지 내려간다. */
const MAX_ZOOM = 24
/** 딥링크로 장소를 열 때의 확대 배율. 인접 장소가 클러스터로 묶이지 않을 만큼 확대한다. */
const FOCUS_ZOOM = 6
/** 지도 가장자리 여백 (위쪽은 검색창 아래부터 땅이 보이도록 넉넉히) */
const PAD = { top: 72, right: 24, bottom: 40, left: 24 }
/** 모바일 첫 화면: 세계 지도가 폭에 맞춰 작게 그려지므로 유럽·아프리카 쪽을 이만큼 확대해서 보여 준다 */
const MOBILE_HOME = { zoom: 2.6, center: [15, 30] as [number, number] }

type WorldTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>

function useWorldTopology(): WorldTopology | null {
  const [topo, setTopo] = useState<WorldTopology | null>(null)
  useEffect(() => {
    let alive = true
    fetch(countriesUrl)
      .then((r) => r.json() as Promise<WorldTopology>)
      .then((t) => alive && setTopo(t))
    return () => {
      alive = false
    }
  }, [])
  return topo
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** 남위 58° ~ 북위 82°, 경도 전체가 여백 안에 들어가도록 맞춘 메르카토르 */
function makeProjection(width: number, height: number): GeoProjection {
  return geoMercator().fitExtent(
    [
      [PAD.left, PAD.top],
      [Math.max(PAD.left + 1, width - PAD.right), Math.max(PAD.top + 1, height - PAD.bottom)],
    ],
    {
      type: 'MultiPoint',
      coordinates: [
        [-180, -58],
        [180, 82],
      ],
    },
  )
}

/**
 * 경위선: 메르카토르에서 위선은 수평선, 경선은 수직선이다.
 * 지도 바깥 여백까지 끊기지 않게 화면 전체 폭·높이로 그린다.
 */
function graticule(projection: GeoProjection, width: number, height: number): string {
  const [x0] = projection([-180, 0]) ?? [0, 0]
  const [x1] = projection([180, 0]) ?? [width, 0]
  const step = ((x1 - x0) / 360) * 30
  const lines: string[] = []
  for (let lat = -80; lat <= 80; lat += 20) {
    const p = projection([0, lat])
    if (p) lines.push(`M${-width},${p[1]}H${width * 2}`)
  }
  for (let x = x0 - Math.ceil(x0 / step) * step; x <= width; x += step) {
    lines.push(`M${x},${-height}V${height * 2}`)
  }
  return lines.join('')
}

const NICE = [1, 2, 5]

/** 현재 화면 중앙 위도 기준 축척 막대(최대 100px) */
function scaleBar(projection: GeoProjection, t: ZoomTransform, width: number, height: number) {
  const y = height / 2
  const a = projection.invert?.(t.invert([width / 2 - 50, y]))
  const b = projection.invert?.(t.invert([width / 2 + 50, y]))
  if (!a || !b) return { px: 0, km: 0 }
  const kmPerPx = (geoDistance(a, b) * 6371) / 100
  const raw = kmPerPx * 100
  const pow = 10 ** Math.floor(Math.log10(raw))
  const km = NICE.map((n) => n * pow)
    .filter((n) => n <= raw)
    .pop() ?? pow
  return { px: km / kmPerPx, km }
}

export type MapSelection = { kind: 'place'; id: string } | { kind: 'cluster'; id: string; placeIds: string[] } | null

interface WorldMapProps {
  places: VisiblePlace[]
  selection: MapSelection
  onSelectPlace: (place: VisiblePlace) => void
  onSelectCluster: (id: string, places: VisiblePlace[]) => void
  /** 핀·클러스터가 아닌 빈 지도를 클릭했을 때(끌어서 이동한 경우는 제외) */
  onClearSelection?: () => void
  /** 우측 패널이 지도 위에 열려 있을 때 그 폭만큼 오른쪽 조작부를 비켜 둔다 */
  rightInset?: number
  /** 이 장소로 한 번 확대·이동한다(딥링크 `/?place=`) */
  focusPlaceId?: string | null
  /** 지도 위에 겹치는 요소(검색, 집계, 범례 등) */
  children?: ReactNode
}

export function WorldMap({ places, selection, onSelectPlace, onSelectCluster, onClearSelection, rightInset = 0, focusPlaceId = null, children }: WorldMapProps) {
  const topo = useWorldTopology()
  const { t } = useI18n()
  const labels = usePlaceLabels()
  const isMobile = useIsMobile()
  const [mapRef, { width, height }] = useElementSize<HTMLDivElement>()
  const surfaceRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)

  const projection = useMemo(() => makeProjection(width, height), [width, height])

  const shapes = useMemo(() => {
    if (!topo || width === 0) return null
    const path = geoPath(projection)
    return {
      land: path(feature(topo, topo.objects.land)) ?? '',
      borders: path(mesh(topo, topo.objects.countries, (a, b) => a !== b)) ?? '',
    }
  }, [topo, projection, width])

  const gridPath = useMemo(() => (width ? graticule(projection, width, height) : ''), [projection, width, height])

  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const behavior = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .on('zoom', (e: { transform: ZoomTransform }) => setTransform(e.transform))
    zoomRef.current = behavior
    const sel = select(el).call(behavior).on('dblclick.zoom', null)
    return () => {
      sel.on('.zoom', null)
    }
  }, [])

  // 이동 범위는 현재 지도 크기 안으로 제한한다.
  useEffect(() => {
    zoomRef.current?.translateExtent([
      [0, 0],
      [width, height],
    ])
  }, [width, height])

  const zoomBy = (k: number) => {
    const el = surfaceRef.current
    if (el && zoomRef.current) select(el).call(zoomRef.current.scaleBy, k)
  }
  // 처음 위치: 데스크톱은 세계 전체, 모바일은 MOBILE_HOME
  const homeTransform = () => {
    if (!isMobile) return zoomIdentity
    const p = projection(MOBILE_HOME.center)
    if (!p) return zoomIdentity
    const k = MOBILE_HOME.zoom
    return zoomIdentity.translate(width / 2 - k * p[0], height * 0.45 - k * p[1]).scale(k)
  }
  const resetView = () => {
    const el = surfaceRef.current
    if (el && zoomRef.current) select(el).call(zoomRef.current.transform, homeTransform())
  }
  // 크기가 처음 정해졌을 때(딥링크로 장소를 여는 경우 제외) 한 번 처음 위치로 맞춘다.
  const homedRef = useRef(false)
  useEffect(() => {
    if (homedRef.current || width === 0 || focusPlaceId) return
    homedRef.current = true
    if (isMobile) resetView()
  }, [width, height, isMobile, focusPlaceId])

  const projected = useMemo(
    () =>
      places.flatMap((place) => {
        const p = projection([place.lng, place.lat])
        return p ? [{ place, base: p }] : []
      }),
    [places, projection],
  )

  const selectedPlaceId = selection?.kind === 'place' ? selection.id : null

  // 같은 장소로는 한 번만 이동한다. 이후 사용자가 움직인 지도를 되돌리지 않는다.
  const focusedRef = useRef<string | null>(null)
  useEffect(() => {
    const el = surfaceRef.current
    if (!focusPlaceId || focusedRef.current === focusPlaceId || !el || !zoomRef.current || width === 0) return
    const target = projected.find((p) => p.place.id === focusPlaceId)
    if (!target) return
    focusedRef.current = focusPlaceId
    const [x, y] = target.base
    const cx = (width - rightInset) / 2
    // 모바일은 아래 절반을 바텀시트가 가리므로 위쪽에 놓는다.
    const cy = isMobile ? height * 0.25 : height / 2
    select(el).call(zoomRef.current.transform, zoomIdentity.translate(cx - FOCUS_ZOOM * x, cy - FOCUS_ZOOM * y).scale(FOCUS_ZOOM))
  }, [focusPlaceId, projected, width, height, rightInset, isMobile])

  const markers: MapMarker[] = useMemo(
    () =>
      clusterPoints(
        projected.map(({ place, base }) => {
          const [x, y] = transform.apply(base)
          return { place, x, y }
        }),
        CLUSTER_RADIUS,
        selectedPlaceId,
      ),
    [projected, transform, selectedPlaceId],
  )

  const selectedPlaceMarker =
    selection?.kind === 'place'
      ? markers.find((m): m is Extract<MapMarker, { kind: 'place' }> => m.kind === 'place' && m.id === selection.id)
      : undefined

  const scale = width ? scaleBar(projection, transform, width, height) : { px: 0, km: 0 }

  return (
    <div ref={mapRef} className={styles.map}>
      <div
        ref={surfaceRef}
        className={styles.surface}
        onClick={(e) => {
          if (!(e.target as Element).closest(`.${styles.marker}, .${styles.callout}`)) onClearSelection?.()
        }}
      >
        {width > 0 && (
          <svg className={styles.svg} width={width} height={height} aria-hidden>
            <g transform={transform.toString()}>
              <path className={styles.graticule} d={gridPath} />
              {shapes && (
                <>
                  <path className={styles.land} d={shapes.land} />
                  <path className={styles.borders} d={shapes.borders} />
                </>
              )}
            </g>
          </svg>
        )}

        {markers.map((m) =>
          m.kind === 'place' ? (
            <div key={m.id} className={styles.marker} style={{ left: m.x, top: m.y }}>
              <Pin
                selected={selection?.kind === 'place' && selection.id === m.id}
                aria-label={`${labels.name(m.place)} · ${labels.country(m.place)}`}
                onClick={() => onSelectPlace(m.place)}
              />
            </div>
          ) : (
            <div key={m.id} className={styles.marker} style={{ left: m.x, top: m.y }}>
              <ClusterBadge
                count={m.linkCount}
                active={selection?.kind === 'cluster' && selection.id === m.id}
                aria-label={t('map.cluster', { n: m.places.length, m: m.linkCount })}
                onClick={() => onSelectCluster(m.id, m.places)}
              />
            </div>
          ),
        )}

        {selectedPlaceMarker && (
          <div className={styles.callout} style={{ left: selectedPlaceMarker.x, top: selectedPlaceMarker.y }}>
            <div className={styles.calloutBox}>
              <strong className={styles.calloutTitle}>
                {labels.name(selectedPlaceMarker.place)}
                {labels.region(selectedPlaceMarker.place) && ` · ${labels.region(selectedPlaceMarker.place)}`}
              </strong>
              <span className={styles.calloutMeta}>
                {labels.country(selectedPlaceMarker.place)}
              </span>
            </div>
            <span className={styles.calloutLine} />
          </div>
        )}
      </div>

      <div className={styles.controls} style={{ right: (isMobile ? 16 : 26) + rightInset }}>
        <button type="button" className={styles.control} aria-label={t('map.zoomIn')} onClick={() => zoomBy(1.6)}>
          <Plus size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
        <button type="button" className={styles.control} aria-label={t('map.zoomOut')} onClick={() => zoomBy(1 / 1.6)}>
          <Minus size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
        <button type="button" className={styles.control} aria-label={t('map.reset')} onClick={resetView}>
          <LocateFixed size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>

      <div className={styles.meta} style={{ right: (isMobile ? 16 : 24) + rightInset }}>
        <span className={styles.scale}>
          0
          <span className={styles.scaleBar} style={{ width: scale.px }} />
          {scale.km.toLocaleString('ko-KR')} km
        </span>
      </div>

      {children}
    </div>
  )
}
