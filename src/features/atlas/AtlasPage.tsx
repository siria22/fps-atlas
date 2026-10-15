import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { useAtlasData } from './data.ts'
import { FilterPanel } from './FilterPanel.tsx'
import { applyFilters, defaultFilters, type Filters } from './filters.ts'
import { DetailPanel } from './DetailPanel.tsx'
import { WorldMap, type MapSelection } from './WorldMap.tsx'
import { useI18n } from '../../i18n/i18n.tsx'
import { useIsMobile } from '../../lib/useMediaQuery.ts'
import { cx } from '../../lib/cx.ts'
import styles from './AtlasPage.module.css'

/** 우측 패널 폭(--layout-panel-width) */
const PANEL_WIDTH = 420
/** 필터 패널 폭(--layout-filter-width) + 지도 여백 24 */
const FILTER_OFFSET = 360 + 24

/**
 * 화면 01 · 메인 지도 (결과가 없으면 화면 09). 우측 패널은 선택했을 때만 열린다.
 * 모바일(M-01-b/c, M-02): 패널은 바텀시트(처음엔 절반, 손잡이를 끌어올리거나 누르면 펼침), 필터는 전체 화면 시트.
 */
export function AtlasPage() {
  const { data, error, isPending } = useAtlasData()
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const dragStart = useRef<number | null>(null)
  const dragged = useRef(false)
  const games = useMemo(() => data?.games ?? [], [data])
  // 사용자가 필터를 건드리기 전까지는 '전체 선택' 기본값을 쓴다(데이터가 늦게 와도 새 게임이 빠지지 않게).
  const [touched, setTouched] = useState<Filters | null>(null)
  const defaults = useMemo(() => defaultFilters(games.map((g) => g.id)), [games])
  const filters = touched ?? defaults
  const [filterOpen, setFilterOpen] = useState(false)
  const [picked, setPicked] = useState<MapSelection>(null)
  // `/?place=<id>`(제보 화면의 "지도에서 보기")로 들어오면 그 장소를 선택한 상태로 연다.
  const [params, setParams] = useSearchParams()
  const linkedPlaceId = params.get('place')
  const selection: MapSelection = picked ?? (linkedPlaceId ? { kind: 'place', id: linkedPlaceId } : null)
  const setSelection = (next: MapSelection) => {
    setPicked(next)
    setSheetExpanded(false)
    if (linkedPlaceId) setParams({}, { replace: true })
  }

  const visible = useMemo(() => applyFilters(data?.places ?? [], filters), [data, filters])
  const countryCount = new Set(visible.map((p) => p.country)).size
  const noResults = !isPending && !error && visible.length === 0

  // 필터로 선택 대상이 사라지면 선택을 해제한다(패널도 닫힘).
  const selectedPlace = selection?.kind === 'place' ? visible.find((p) => p.id === selection.id) : undefined
  const clusterPlaces =
    selection?.kind === 'cluster' ? visible.filter((p) => selection.placeIds.includes(p.id)) : []
  const activeSelection: MapSelection =
    selectedPlace || clusterPlaces.length > 0 ? selection : null
  const panelOpen = activeSelection !== null

  const update = (next: Filters) => setTouched(next)
  const reset = () => {
    setTouched(null)
    setSelection(null)
  }
  const close = () => setSelection(null)

  return (
    <>
      <div className={styles.body}>
        <WorldMap
          places={visible}
          selection={activeSelection}
          onSelectPlace={(p) => setSelection({ kind: 'place', id: p.id })}
          onSelectCluster={(id, places) => setSelection({ kind: 'cluster', id, placeIds: places.map((p) => p.id) })}
          onClearSelection={() => activeSelection && close()}
          rightInset={panelOpen && !isMobile ? PANEL_WIDTH : 0}
          focusPlaceId={linkedPlaceId}
        >
          {!filterOpen && (
            <button type="button" className={styles.filterButton} aria-expanded={false} onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
              {t('atlas.filter')}
              {touched && <span className={styles.filterDot} aria-label={t('atlas.filterActive')} />}
            </button>
          )}

          <div className={styles.stats} style={isMobile ? undefined : { left: filterOpen ? FILTER_OFFSET : 136 }} aria-live="polite">
            <span className={styles.statsLabel}>{t('atlas.results')}</span>
            <strong className={styles.statsValue}>{t('atlas.places', { n: visible.length })}</strong>
            <span className={styles.statsSub}>{t('atlas.countries', { n: countryCount })}</span>
          </div>

          <div className={styles.legend} style={isMobile ? undefined : { left: filterOpen ? FILTER_OFFSET : 24 }}>
            <span className={styles.legendItems}>
              <span className={styles.legendDot} aria-hidden />
              {t('atlas.legendPlace')}
              <span className={styles.legendCluster}>{t('atlas.legendCluster')}</span>
            </span>
          </div>

          {error && (
            <div className={styles.emptyCard} role="alert">
              <strong className={styles.emptyTitle}>{t('atlas.loadErrorTitle')}</strong>
              <span className={styles.emptyBody}>{t('atlas.loadErrorBody')}</span>
            </div>
          )}

          {noResults && (
            <div className={styles.emptyCard}>
              <strong className={styles.emptyTitle}>{t('atlas.emptyTitle')}</strong>
              <span className={styles.emptyBody}>
                {t('atlas.emptyBody')}
              </span>
              <button type="button" className={styles.emptyButton} onClick={reset}>
                {t('atlas.emptyReset')}
              </button>
            </div>
          )}
        </WorldMap>

        {filterOpen && <FilterPanel games={games} filters={filters} onChange={update} onReset={reset} onClose={() => setFilterOpen(false)} />}

        {panelOpen && (
          <aside className={cx(styles.panel, sheetExpanded && styles.panelExpanded)} aria-label={t('atlas.panel')}>
            {/* 모바일 바텀시트 손잡이: 누르면 펼치기/접기, 위·아래로 끌어도 된다(아래로 끌면 접힌 상태에서는 닫힘) */}
            <button type="button" className={styles.sheetHandle} aria-label={t(sheetExpanded ? 'atlas.sheetCollapse' : 'atlas.sheetExpand')}
              onClick={() => { if (dragged.current) dragged.current = false; else setSheetExpanded((v) => !v) }}
              onPointerDown={(e) => { dragStart.current = e.clientY }}
              onPointerUp={(e) => {
                const start = dragStart.current
                dragStart.current = null
                if (start === null) return
                const dy = e.clientY - start
                if (dy < -24) setSheetExpanded(true)
                else if (dy > 24) { if (sheetExpanded) setSheetExpanded(false); else close() }
                else return
                dragged.current = true
              }}>
              <span aria-hidden />
            </button>
            {selectedPlace ? (
              <DetailPanel key={selectedPlace.id} kind="place" place={selectedPlace} onClose={close} />
            ) : (
              <DetailPanel key={clusterPlaces.map((p) => `${p.id}:${p.visibleLinks.map((l) => l.id).join(',')}`).join('|')} kind="cluster" places={clusterPlaces} onSelectPlace={(place) => setSelection({ kind: 'place', id: place.id })} onClose={close} />
            )}
          </aside>
        )}
      </div>
    </>
  )
}
