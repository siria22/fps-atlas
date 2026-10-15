import { useState } from 'react'
import { Info, Search, X } from 'lucide-react'
import { Checkbox } from '../../components/Checkbox.tsx'
import { FilterChip } from '../../components/FilterChip.tsx'
import type { Era, EvidenceLevel } from '../../lib/domain.ts'
import type { Game } from './data.ts'
import { ERAS, EVIDENCE_LEVELS, toggle, type Filters } from './filters.ts'
import { useI18n } from '../../i18n/i18n.tsx'
import styles from './FilterPanel.module.css'

/** 게임이 이보다 많으면 게임 목록 위에 게임 검색을 보여 준다. */
const GAME_SEARCH_MIN = 10

interface FilterPanelProps {
  games: Game[]
  filters: Filters
  onChange: (next: Filters) => void
  onReset: () => void
  onClose: () => void
}

/** 지도 왼쪽 필터 패널: 근거 수준 · 시대 · 검색 · 게임 */
export function FilterPanel({ games, filters, onChange, onReset, onClose }: FilterPanelProps) {
  const [gameQuery, setGameQuery] = useState('')
  const { t } = useI18n()
  const q = gameQuery.trim().toLowerCase()
  const listedGames = q ? games.filter((g) => [g.name, ...g.aliases].some((n) => n.toLowerCase().includes(q))) : games
  const selectedCount = games.filter((g) => filters.games.has(g.id)).length
  const setGames = (ids: Iterable<string>) => onChange({ ...filters, games: new Set(ids) })

  return (
    <aside className={styles.panel} aria-label={t('filter.panel')}>
      <div className={styles.head}>
        <strong className={styles.title}>{t('filter.title')}</strong>
        <button type="button" className={styles.reset} onClick={onReset}>
          {t('filter.reset')}
        </button>
        <button type="button" className={styles.close} aria-label={t('filter.close')} onClick={onClose}>
          <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>

      <section className={styles.section}>
        <h3 className={styles.label}>
          {t('filter.evidence')} <Info size={13} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
        </h3>
        <div className={styles.chips}>
          {EVIDENCE_LEVELS.map((level: EvidenceLevel) => (
            <span key={level} className={styles.tip}>
              <FilterChip
                selected={filters.evidence.has(level)}
                aria-describedby={`evidence-help-${level}`}
                onClick={() => onChange({ ...filters, evidence: toggle(filters.evidence, level) })}
              >
                {t(`evidence.${level}`)}
              </FilterChip>
              <span id={`evidence-help-${level}`} role="tooltip" className={styles.tipText}>
                {t(`filter.help.${level}`)}
              </span>
            </span>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.label}>{t('filter.era')}</h3>
        <div className={styles.chips}>
          {ERAS.map((era: Era) => (
            <FilterChip
              key={era}
              selected={filters.eras.has(era)}
              onClick={() => onChange({ ...filters, eras: toggle(filters.eras, era) })}
            >
              {t(`era.${era}`)}
            </FilterChip>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.label}>{t('filter.search')}</h3>
        <label className={styles.search}>
          <Search size={16} strokeWidth={2} absoluteStrokeWidth aria-hidden />
          <input
            className={styles.searchInput}
            type="search"
            placeholder={t('filter.searchPlaceholder')}
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
          />
        </label>
      </section>

      <section className={styles.section}>
        <div className={styles.labelRow}>
          <h3 className={styles.label}>
            {t('filter.games')} <span className={styles.count}>{selectedCount}/{games.length}</span>
          </h3>
          <span className={styles.bulk}>
            <button type="button" onClick={() => setGames(games.map((g) => g.id))}>{t('filter.selectAll')}</button>
            <button type="button" onClick={() => setGames([])}>{t('filter.clearAll')}</button>
          </span>
        </div>
        {games.length > GAME_SEARCH_MIN && (
          <label className={styles.search}>
            <Search size={14} strokeWidth={2} absoluteStrokeWidth aria-hidden />
            <input
              className={styles.searchInput}
              type="search"
              placeholder={t('filter.gameSearch')}
              value={gameQuery}
              onChange={(e) => setGameQuery(e.target.value)}
            />
          </label>
        )}
        <div className={styles.gameList}>
          {listedGames.map((g) => (
            <Checkbox
              key={g.id}
              className={styles.gameOption}
              checked={filters.games.has(g.id)}
              onChange={() => onChange({ ...filters, games: toggle(filters.games, g.id) })}
            >
              {g.name}
            </Checkbox>
          ))}
          {listedGames.length === 0 && <p className={styles.empty}>{t('filter.noGames')}</p>}
        </div>
      </section>

    </aside>
  )
}
