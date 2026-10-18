import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, ChevronUp, CirclePlus, Info, LockKeyhole, Map as MapIcon, TriangleAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { Tables } from '../../lib/database.types.ts'
import { useAuth } from '../../lib/auth.tsx'
import { supabase } from '../../lib/supabase.ts'
import type { Era, EvidenceLevel } from '../../lib/domain.ts'
import { ImageError, prepareImage, type PreparedImage } from './images.ts'
import { LocationPicker, type LocationValue } from './LocationPicker.tsx'
import { EditSuggestion, type SuggestionTarget } from './EditSuggestion.tsx'
import { useI18n } from '../../i18n/i18n.tsx'
import { usePlaceLabels } from '../atlas/placeLabels.ts'
import { SearchCombo } from '../../components/SearchCombo.tsx'
import styles from './ReportForm.module.css'

type Submission = Tables<'submissions'>
type CatalogGame = { id: string; name: string; aliases: string[] }
type CatalogPlace = {
  mapPlaceId: string
  placeId: string
  placeName: string
  placeNameEn: string | null
  region: string | null
  country: string
  countryCode: string | null
  admin1Code: string | null
  evidence: EvidenceLevel
  sourceCount: number
}
type CatalogMap = { id: string; gameId: string; name: string; aliases: string[]; era: Era; wikiUrl: string | null; places: CatalogPlace[] }

const evidenceLevels: EvidenceLevel[] = ['공식', '커뮤니티 추정', '기타']
/** 맵 이름이 이 길이 이상일 때 등록된 맵을 찾는다. */
const MIN_MATCH_LENGTH = 2
const MAX_MATCHES = 3

const normalize = (value: string) => value.trim().toLocaleLowerCase()

// 등록된 게임·맵과 각 맵에 연결된 장소. "지도에서 보기" 링크에 장소 id가 필요하다.
function useCatalog() {
  return useQuery({
    queryKey: ['submission-catalog'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [games, maps] = await Promise.all([
        supabase.from('games').select('id, name, game_aliases ( alias )').order('name'),
        supabase
          .from('maps')
          .select('id, game_id, name, era, wiki_url, map_aliases ( alias ), map_places ( id, evidence_level, map_place_sources ( url ), places ( id, name, name_en, region, country, country_code, admin1_code ) )')
          .order('name'),
      ])
      if (games.error) throw games.error
      if (maps.error) throw maps.error
      return {
        games: games.data.map((g): CatalogGame => ({ id: g.id, name: g.name, aliases: g.game_aliases.map((a) => a.alias) })),
        maps: maps.data.map(
          (m): CatalogMap => ({
            id: m.id,
            gameId: m.game_id,
            name: m.name,
            aliases: m.map_aliases.map((a) => a.alias),
            era: m.era,
            wikiUrl: m.wiki_url,
            places: m.map_places.flatMap((mp) =>
              mp.places
                ? [
                    {
                      mapPlaceId: mp.id,
                      placeId: mp.places.id,
                      placeName: mp.places.name,
                      placeNameEn: mp.places.name_en,
                      region: mp.places.region,
                      country: mp.places.country,
                      countryCode: mp.places.country_code,
                      admin1Code: mp.places.admin1_code,
                      evidence: mp.evidence_level,
                      sourceCount: mp.map_place_sources.length,
                    },
                  ]
                : [],
            ),
          }),
        ),
      }
    },
  })
}

/** 화면 03-a·03-b(맵 찾기) → 03-c(제보 내용). 위치 카드는 두 단계 모두 오른쪽에 유지한다. */
export function ReportForm() {
  const { user } = useAuth()
  const { t } = useI18n()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const route = useLocation()
  const resubmit = route.state?.submission as Submission | undefined
  const [step, setStep] = useState<1 | 2>(resubmit ? 2 : 1)
  const [gameName, setGameName] = useState(resubmit?.game_name ?? '')
  const [mapName, setMapName] = useState(resubmit?.map_name ?? '')
  const [evidence, setEvidence] = useState<EvidenceLevel>(resubmit?.evidence_level ?? '커뮤니티 추정')
  const [sourceUrl, setSourceUrl] = useState(resubmit?.source_url ?? '')
  const [wikiUrl, setWikiUrl] = useState(resubmit?.wiki_url ?? '')
  const [description, setDescription] = useState(resubmit?.description ?? '')
  const [location, setLocation] = useState<LocationValue>({
    countryCode: resubmit?.country_code ?? null,
    country: resubmit?.country ?? '',
    admin1Code: resubmit?.admin1_code ?? null,
    region: resubmit?.region ?? '',
  })
  const [screenshot, setScreenshot] = useState<PreparedImage | null>(null)
  const [photo, setPhoto] = useState<PreparedImage | null>(null)
  const [screenshotRights, setScreenshotRights] = useState(false)
  const [photoRights, setPhotoRights] = useState(false)
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState<SuggestionTarget | null>(null)
  const [suggestionCode, setSuggestionCode] = useState<string | null>(null)
  const [error, setError] = useState('')

  // 게임·맵은 영문 공식명과 검색용 별칭(한국어 이름 등) 모두로 찾는다.
  const names = (x: { name: string; aliases: string[] }) => [x.name, ...x.aliases].map(normalize)
  const game = catalog.data?.games.find((g) => names(g).includes(normalize(gameName))) ?? null
  const typedMap = normalize(mapName)
  const matches =
    game && typedMap.length >= MIN_MATCH_LENGTH
      ? (catalog.data?.maps ?? []).filter((m) => m.gameId === game.id && names(m).some((n) => n.includes(typedMap))).slice(0, MAX_MATCHES)
      : []
  // 이름(또는 별칭)이 정확히 같은 등록된 맵이 있으면 그 맵에 새 장소를 제보하는 것으로 본다.
  const existingMap = matches.find((m) => names(m).includes(typedMap)) ?? null
  const needsSource = evidence !== '기타'

  useEffect(() => () => { if (screenshot) URL.revokeObjectURL(screenshot.attached.previewUrl) }, [screenshot])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.attached.previewUrl) }, [photo])

  const attach = async (file: File, target: 'screenshot' | 'photo') => {
    setError('')
    try {
      const prepared = await prepareImage(file)
      if (target === 'screenshot') setScreenshot(prepared)
      else setPhoto(prepared)
    } catch (e) {
      setError(e instanceof ImageError ? t(e.key) : (e as Error).message)
    }
  }

  const continueToDetails = () => {
    setError('')
    if (!gameName.trim() || !mapName.trim()) {
      setError(t('report.err.names'))
      return
    }
    // 한국어 이름(별칭)으로 찾았어도 다음 화면·제출 확인에는 영문 공식명으로 보이게 맞춘다
    if (game) setGameName(game.name)
    if (existingMap) setMapName(existingMap.name)
    setStep(2)
  }

  const backToSearch = () => {
    setError('')
    setStep(1)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!user) return setError(t('report.err.login'))
    if (!location.countryCode) return setError(t('report.err.country'))
    if (location.region.trim() && !location.admin1Code) return setError(t('report.err.region'))
    if (needsSource && !sourceUrl.trim()) return setError(t('report.err.sourceRequired'))
    if (sourceUrl.trim() && !isHttpUrl(sourceUrl)) return setError(t('report.err.sourceUrl'))
    if (wikiUrl.trim() && !isHttpUrl(wikiUrl)) return setError(t('report.err.wikiUrl'))

    setBusy(true)
    const folder = `${user.id}/${crypto.randomUUID()}`
    const uploaded: string[] = []
    const uploadPair = async (image: PreparedImage, key: string) => {
      const full = `${folder}/${key}.webp`
      const thumb = `${folder}/${key}-thumb.webp`
      for (const [path, body] of [[full, image.image], [thumb, image.thumb]] as const) {
        const { error: uploadError } = await supabase.storage.from('submission-images').upload(path, body, { contentType: 'image/webp', upsert: false })
        if (uploadError) throw uploadError
        uploaded.push(path)
      }
      return { full, thumb }
    }
    try {
      const shot = screenshot ? await uploadPair(screenshot, 'screenshot') : null
      const place = photo ? await uploadPair(photo, 'place-photo') : null
      const { data, error: insertError } = await supabase
        .from('submissions')
        .insert({
          game_id: game?.id ?? null,
          game_name: game?.name ?? gameName.trim(),
          map_id: existingMap?.id ?? null,
          map_name: existingMap?.name ?? mapName.trim(),
          evidence_level: evidence,
          source_url: sourceUrl.trim() || null,
          wiki_url: wikiUrl.trim() || null,
          description: description.trim() || null,
          country: location.country.trim(),
          country_code: location.countryCode,
          region: location.admin1Code ? location.region : null,
          admin1_code: location.admin1Code,
          location_precision: location.admin1Code ? '주·도' : '국가',
          screenshot_path: shot?.full ?? null,
          screenshot_thumb_path: shot?.thumb ?? null,
          place_photo_path: place?.full ?? null,
          place_photo_thumb_path: place?.thumb ?? null,
          // 이미지 칸은 권리 확인에 체크해야 열리므로, 첨부가 있으면 확인된 것이다.
          image_rights_confirmed: shot || place ? true : null,
        })
        .select('id, code')
        .single()
      if (insertError) throw insertError
      navigate('/report/complete', {
        state: {
          code: data.code,
          gameName,
          mapName,
          region: location.admin1Code ? location.region : '',
          country: location.country,
          countryCode: location.countryCode,
          admin1Code: location.admin1Code,
        },
      })
    } catch (e) {
      if (uploaded.length) await supabase.storage.from('submission-images').remove(uploaded)
      setError(t('report.err.submit', { message: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  const locationCard = <LocationPicker value={location} onChange={setLocation} />

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('report.title')}</h1>
      </header>

      {resubmit && (
        <p className={styles.notice}>
          <Info size={14} /> {t('report.resubmitNotice')}
        </p>
      )}

      <form onSubmit={(event) => void submit(event)}>
        {step === 2 && (
          <section className={`${styles.card} ${styles.selectedMap}`}>
            <div>
              <h2>
                {gameName} · {mapName} <span className={styles.badge}>{existingMap ? t('report.mapRegistered') : t('report.mapNew')}</span>
              </h2>
              <p className={styles.caption}>
                {existingMap ? t('report.mapRegisteredHint') : t('report.mapNewHint')}
              </p>
            </div>
            <button type="button" className={styles.secondary} onClick={backToSearch}>
              {t('report.changeMap')}
            </button>
          </section>
        )}

        <div className={styles.columns}>
          <div className={styles.main}>
            {step === 1 ? (
              <section className={styles.card}>
                <CardTitle title={t('report.gameMapTitle')} caption={[t('report.gameMapCaption1'), t('report.gameMapCaption2')]} />
                <div className={styles.twoFields}>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('report.gameName')}</span>
                    <SearchCombo
                      id="report-game"
                      value={gameName}
                      onChange={setGameName}
                      onPick={(o) => setGameName(o.label)}
                      // 목록에는 영문 공식명만, 한국어 이름 등 별칭으로도 찾는다(예: "배틀" → Battlefield …)
                      options={(catalog.data?.games ?? []).map((g) => ({ id: g.id, label: g.name, terms: g.aliases }))}
                      placeholder={t('report.gamePlaceholder')}
                      required
                      classNames={{ combo: styles.combo, input: styles.input }}
                    />
                    <small className={styles.help}>{t('report.gameHelp')}</small>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('report.mapName')}</span>
                    <input className={styles.input} value={mapName} onChange={(e) => setMapName(e.target.value)} placeholder={t('report.mapPlaceholder')} required />
                    <small className={styles.help}>{t('report.mapHelp')}</small>
                  </label>
                </div>

                {gameName.trim() && typedMap.length >= MIN_MATCH_LENGTH && (
                  matches.length > 0 ? (
                    <div className={styles.matchBox}>
                      <strong className={styles.matchTitle}>
                        <TriangleAlert size={14} /> {t('report.matchTitle')}
                      </strong>
                      {matches.map((m) => (
                        <MatchRow
                          key={m.id}
                          gameName={game?.name ?? gameName}
                          map={m}
                          activeId={suggesting?.mapPlaceId ?? null}
                          onSuggest={(target) => {
                            setSuggestionCode(null)
                            setSuggesting((current) => (current?.mapPlaceId === target.mapPlaceId ? null : target))
                          }}
                        />
                      ))}
                      <small className={styles.help}>{t('report.matchHelp')}</small>
                    </div>
                  ) : (
                    <Callout icon={<CirclePlus size={14} />} title={t('report.noMatchTitle')}>
                      {t('report.noMatchBody')}
                    </Callout>
                  )
                )}

                {error && <p role="alert" className={styles.error}>{error}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.primary} disabled={catalog.isLoading} onClick={continueToDetails}>
                    {t('common.next')} <ArrowRight size={14} />
                  </button>
                </div>
              </section>
            ) : null}
            {step === 1 && suggesting && (
              <EditSuggestion
                key={suggesting.mapPlaceId}
                target={suggesting}
                location={location}
                onCancel={() => setSuggesting(null)}
                onDone={(code) => {
                  setSuggesting(null)
                  setSuggestionCode(code)
                }}
              />
            )}
            {step === 1 && suggestionCode && (
              <p className={styles.notice} role="status">
                <Info size={14} /> {t('report.suggestionDone', { code: suggestionCode })}
              </p>
            )}
            {step === 2 && (
              <>
                <section className={styles.card}>
                  <CardTitle title={t('report.evidenceTitle')} caption={[t('report.evidenceCaption1'), t('report.evidenceCaption2')]} />
                  <div className={styles.group}>
                    <span className={styles.label}>{t('report.evidenceLevel')}</span>
                    <div className={styles.chips}>
                      {evidenceLevels.map((item) => (
                        <button type="button" key={item} className={evidence === item ? styles.chipActive : styles.chip} aria-pressed={evidence === item} onClick={() => setEvidence(item)}>
                          {t(`evidence.${item}`)}
                        </button>
                      ))}
                    </div>
                    <p className={styles.evidenceHelp}>
                      <Info size={14} /> {t(`evidence.${evidence}`)} — {t(`filter.help.${evidence}`)}
                    </p>
                  </div>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('report.sourceUrl')} {needsSource ? '*' : t('report.optional')}</span>
                    <input
                      className={styles.input}
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder={t('report.sourcePlaceholder')}
                      required={needsSource}
                    />
                    <ul className={`${styles.help} ${styles.bullets}`}>
                      <li>{t('report.sourceHelp1')}</li>
                      <li>{t('report.sourceHelp2')}</li>
                      <li>{t('report.sourceHelp3')}</li>
                    </ul>
                  </label>
                </section>

                <section className={styles.card}>
                  <CardTitle title={t('report.extraTitle')} caption={t('report.extraCaption')} />
                  <label className={styles.field}>
                    <span className={styles.label}>{t('report.wikiUrl')}</span>
                    <input className={styles.input} type="url" value={wikiUrl} onChange={(e) => setWikiUrl(e.target.value)} placeholder={t('report.wikiPlaceholder')} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{t('report.description')}</span>
                    <textarea className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} placeholder={t('report.descriptionPlaceholder')} />
                  </label>
                  <div className={styles.twoFields}>
                    <ImageAttach
                      label={t('report.screenshot')}
                      image={screenshot}
                      rights={screenshotRights}
                      onRights={(checked) => {
                        setScreenshotRights(checked)
                        if (!checked) setScreenshot(null)
                      }}
                      onSelect={(file) => void attach(file, 'screenshot')}
                      onRemove={() => setScreenshot(null)}
                    />
                    <ImageAttach
                      label={t('report.photo')}
                      image={photo}
                      rights={photoRights}
                      onRights={(checked) => {
                        setPhotoRights(checked)
                        if (!checked) setPhoto(null)
                      }}
                      onSelect={(file) => void attach(file, 'photo')}
                      onRemove={() => setPhoto(null)}
                    />
                  </div>
                  <small className={styles.privateNote}>
                    <LockKeyhole size={12} /> {t('report.privateNote')}
                  </small>
                </section>
              </>
            )}
          </div>
          {locationCard}
        </div>

        {step === 2 && (
          <>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={backToSearch}>
                {t('common.back')}
              </button>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? t('report.submitting') : t('report.submit')} <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
      </form>
    </main>
  )
}

function isHttpUrl(value: string) {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** 설명이 여러 줄이면 글머리표 목록으로 보여 준다. */
function CardTitle({ title, caption, icon }: { title: string; caption: string | string[]; icon?: ReactNode }) {
  return (
    <div className={styles.cardTitle}>
      <div>
        <h2>{title}</h2>
        {Array.isArray(caption) ? (
          <ul className={`${styles.caption} ${styles.bullets}`}>
            {caption.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : (
          <p className={styles.caption}>{caption}</p>
        )}
      </div>
      {icon && <span className={styles.cardIcon}>{icon}</span>}
    </div>
  )
}

function Callout({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={styles.callout}>
      {icon}
      <span>
        <b>{title}</b>
        <br />
        {children}
      </span>
    </div>
  )
}

/** 03-b: 등록된 맵 한 줄. 장소가 여러 곳이면 장소마다 "지도에서 보기"(새 탭, 작성 중인 폼 유지)와 "정보 수정 제안"을 둔다. */
function MatchRow(props: { gameName: string; map: CatalogMap; activeId: string | null; onSuggest: (target: SuggestionTarget) => void }) {
  const { gameName, map, activeId, onSuggest } = props
  const { t } = useI18n()
  const labels = usePlaceLabels()
  const places = map.places.length ? map.places : [null]
  const where = (p: CatalogPlace) => {
    const names = { name: p.placeName, nameEn: p.placeNameEn, country: p.country, region: p.region, countryCode: p.countryCode, admin1Code: p.admin1Code }
    return `${labels.country(names)} > ${labels.region(names) ?? labels.name(names)}`
  }
  return (
    <>
      {places.map((place) => (
        <div key={place?.placeId ?? map.id} className={styles.matchRow}>
          <div className={styles.matchInfo}>
            <b>
              {gameName} · {map.name}
            </b>
            <small>
              {place
                ? t('report.matchPlace', { location: where(place), evidence: t(`evidence.${place.evidence}`), era: t(`era.${map.era}`) })
                : t('report.matchNoPlace', { era: t(`era.${map.era}`) })}
            </small>
          </div>
          {place && (
            <Link className={styles.small} to={`/?place=${encodeURIComponent(place.placeId)}`} target="_blank" rel="noopener">
              <MapIcon size={14} /> {t('report.viewOnMap')}
            </Link>
          )}
          {place && (
            <button
              type="button"
              className={activeId === place.mapPlaceId ? styles.smallActive : styles.small}
              aria-expanded={activeId === place.mapPlaceId}
              onClick={() =>
                onSuggest({
                  mapPlaceId: place.mapPlaceId,
                  title: `${gameName} · ${map.name}`,
                  location: where(place),
                  evidence: place.evidence,
                  sourceCount: place.sourceCount,
                  hasWiki: Boolean(map.wikiUrl),
                })
              }
            >
              {t('report.suggestEdit')} {activeId === place.mapPlaceId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      ))}
    </>
  )
}

/** 업로드 칸 오른쪽 아래의 권리 확인에 먼저 체크해야 업로드 칸이 열린다. 체크를 풀면 첨부한 이미지도 지운다. */
function ImageAttach(props: {
  label: string
  image: PreparedImage | null
  rights: boolean
  onRights: (checked: boolean) => void
  onSelect: (file: File) => void
  onRemove: () => void
}) {
  const { label, image, rights, onRights, onSelect, onRemove } = props
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.attach}>
      <span className={styles.label}>{label}</span>
      <input
        ref={input}
        hidden
        aria-label={label}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={!rights}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onSelect(file)
          e.target.value = ''
        }}
      />
      {image ? (
        <div className={styles.preview}>
          <img src={image.attached.previewUrl} alt={t('report.preview', { label })} />
          <span>
            <b>{image.attached.fileName}</b>
            <small>
              {image.attached.width} × {image.attached.height} · WebP · {Math.round(image.attached.bytes / 1024)}KB
            </small>
            <button type="button" onClick={onRemove}>
              {t('common.remove')}
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className={styles.dropzone} disabled={!rights} onClick={() => input.current?.click()}>
          {t('report.pickImage')}
          <small>{t('report.imageHint')}</small>
          {!rights && <small className={styles.rightsNote}>{t('report.rightsFirst')}</small>}
        </button>
      )}
      <label className={styles.rights}>
        <input type="checkbox" checked={rights} onChange={(e) => onRights(e.target.checked)} />
        {t('report.rights')}
      </label>
    </div>
  )
}
