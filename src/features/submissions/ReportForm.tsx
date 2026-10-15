import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, ChevronUp, CirclePlus, Info, LockKeyhole, Map as MapIcon, Search, TriangleAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { Tables } from '../../lib/database.types.ts'
import { useAuth } from '../../lib/auth.tsx'
import { supabase } from '../../lib/supabase.ts'
import type { Era, EvidenceLevel } from '../../lib/domain.ts'
import { prepareImage, type PreparedImage } from './images.ts'
import { LocationPicker, type LocationValue } from './LocationPicker.tsx'
import { EditSuggestion, type SuggestionTarget } from './EditSuggestion.tsx'
import { ko } from '../../i18n/messages.ts'
import styles from './ReportForm.module.css'

type Submission = Tables<'submissions'>
type CatalogGame = { id: string; name: string }
type CatalogPlace = { mapPlaceId: string; placeId: string; placeName: string; region: string | null; country: string; evidence: EvidenceLevel; sourceCount: number }
type CatalogMap = { id: string; gameId: string; name: string; era: Era; wikiUrl: string | null; places: CatalogPlace[] }

const evidenceLevels: EvidenceLevel[] = ['공식', '커뮤니티 추정', '기타']
// 필터 툴팁·이용 안내와 같은 정의(src/i18n/messages.ts filter.help.*)
const evidenceHelp: Record<EvidenceLevel, string> = {
  공식: ko['filter.help.공식'],
  '커뮤니티 추정': ko['filter.help.커뮤니티 추정'],
  기타: ko['filter.help.기타'],
}
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
        supabase.from('games').select('id, name').order('name'),
        supabase
          .from('maps')
          .select('id, game_id, name, era, wiki_url, map_places ( id, evidence_level, map_place_sources ( url ), places ( id, name, region, country ) )')
          .order('name'),
      ])
      if (games.error) throw games.error
      if (maps.error) throw maps.error
      return {
        games: games.data as CatalogGame[],
        maps: maps.data.map(
          (m): CatalogMap => ({
            id: m.id,
            gameId: m.game_id,
            name: m.name,
            era: m.era,
            wikiUrl: m.wiki_url,
            places: m.map_places.flatMap((mp) =>
              mp.places
                ? [
                    {
                      mapPlaceId: mp.id,
                      placeId: mp.places.id,
                      placeName: mp.places.name,
                      region: mp.places.region,
                      country: mp.places.country,
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

  const game = catalog.data?.games.find((g) => normalize(g.name) === normalize(gameName)) ?? null
  const typedMap = normalize(mapName)
  const matches =
    game && typedMap.length >= MIN_MATCH_LENGTH
      ? (catalog.data?.maps ?? []).filter((m) => m.gameId === game.id && normalize(m.name).includes(typedMap)).slice(0, MAX_MATCHES)
      : []
  // 이름이 정확히 같은 등록된 맵이 있으면 그 맵에 새 장소를 제보하는 것으로 본다.
  const existingMap = matches.find((m) => normalize(m.name) === typedMap) ?? null
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
      setError((e as Error).message)
    }
  }

  const continueToDetails = () => {
    setError('')
    if (!gameName.trim() || !mapName.trim()) {
      setError('게임 이름과 맵 이름을 입력해 주세요.')
      return
    }
    setStep(2)
  }

  const backToSearch = () => {
    setError('')
    setStep(1)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!user) return setError('로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.')
    if (!location.countryCode) return setError('국가를 목록에서 골라 주세요.')
    if (location.region.trim() && !location.admin1Code) return setError('주·도는 목록이나 지도에서 고르거나, 모르면 비워 주세요.')
    if (needsSource && !sourceUrl.trim()) return setError('공식·커뮤니티 추정 근거에는 URL이 필요합니다.')
    if (sourceUrl.trim() && !isHttpUrl(sourceUrl)) return setError('근거 URL에 올바른 주소를 입력해 주세요.')
    if (wikiUrl.trim() && !isHttpUrl(wikiUrl)) return setError('팬덤 위키 URL에 올바른 주소를 입력해 주세요.')

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
          game_name: gameName.trim(),
          map_id: existingMap?.id ?? null,
          map_name: mapName.trim(),
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
        state: { code: data.code, gameName, mapName, region: location.admin1Code ? location.region : '', country: location.country },
      })
    } catch (e) {
      if (uploaded.length) await supabase.storage.from('submission-images').remove(uploaded)
      setError(`제보를 제출하지 못했습니다: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const locationCard = <LocationPicker value={location} onChange={setLocation} />

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>장소 제보 및 수정 요청</h1>
      </header>

      {resubmit && (
        <p className={styles.notice}>
          <Info size={14} /> 기존 내용을 불러왔습니다. 비공개 이미지는 다시 첨부하고 권리를 확인해 주세요.
        </p>
      )}

      <form onSubmit={(event) => void submit(event)}>
        {step === 2 && (
          <section className={`${styles.card} ${styles.selectedMap}`}>
            <div>
              <h2>
                {gameName} · {mapName} <span className={styles.badge}>{existingMap ? '등록된 맵' : '새 맵'}</span>
              </h2>
              <p className={styles.caption}>
                {existingMap ? '등록된 맵에 새 장소를 제보합니다.' : '등록된 맵이 없어 새 맵으로 제보합니다.'} 바꾸려면 맵 변경을 누르세요.
              </p>
            </div>
            <button type="button" className={styles.secondary} onClick={backToSearch}>
              맵 변경
            </button>
          </section>
        )}

        <div className={styles.columns}>
          <div className={styles.main}>
            {step === 1 ? (
              <section className={styles.card}>
                <CardTitle title="게임과 맵" caption={['새로운 장소 제보 요청 시, 기존에 등록된 항목이 있는지 검색해주세요.', '기존 정보 수정 요청 시, 수정할 항목을 검색해주세요.']} />
                <div className={styles.twoFields}>
                  <label className={styles.field}>
                    <span className={styles.label}>게임 이름 *</span>
                    <span className={styles.combo}>
                      <Search size={14} aria-hidden />
                      <input
                        className={styles.input}
                        list="report-games"
                        value={gameName}
                        onChange={(e) => setGameName(e.target.value)}
                        placeholder="게임 검색 또는 직접 입력"
                        required
                      />
                      <ChevronDown size={14} aria-hidden />
                    </span>
                    <datalist id="report-games">
                      {catalog.data?.games.map((g) => <option key={g.id} value={g.name} />)}
                    </datalist>
                    <small className={styles.help}>목록에서 고르거나 직접 입력하세요.</small>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>맵 이름 *</span>
                    <input className={styles.input} value={mapName} onChange={(e) => setMapName(e.target.value)} placeholder="게임 맵 이름" required />
                    <small className={styles.help}>등록된 맵이 있을 경우 표시됩니다.</small>
                  </label>
                </div>

                {gameName.trim() && typedMap.length >= MIN_MATCH_LENGTH && (
                  matches.length > 0 ? (
                    <div className={styles.matchBox}>
                      <strong className={styles.matchTitle}>
                        <TriangleAlert size={14} /> 이미 등록된 맵입니다.
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
                      <small className={styles.help}>같은 위치의 다른 맵을 등록하고자 할 경우, 다음 버튼을 눌러주세요.</small>
                    </div>
                  ) : (
                    <Callout icon={<CirclePlus size={14} />} title="등록된 맵 중 일치하는 항목이 없습니다">
                      새 맵으로 제보합니다. 다음을 눌러 근거와 추가 자료를 입력하세요.
                    </Callout>
                  )
                )}

                {error && <p role="alert" className={styles.error}>{error}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.primary} disabled={catalog.isLoading} onClick={continueToDetails}>
                    다음 <ArrowRight size={14} />
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
                <Info size={14} /> 수정 제안이 접수되었습니다 ({suggestionCode}). 관리자의 확인 후 반영됩니다.
              </p>
            )}
            {step === 2 && (
              <>
                <section className={styles.card}>
                  <CardTitle title="근거" caption={['맵과 실제 장소의 연결을 뒷받침하는 근거 수준을 고르세요.', '각 항목을 클릭하면 설명이 표시됩니다.']} />
                  <div className={styles.group}>
                    <span className={styles.label}>근거 수준 *</span>
                    <div className={styles.chips}>
                      {evidenceLevels.map((item) => (
                        <button type="button" key={item} className={evidence === item ? styles.chipActive : styles.chip} aria-pressed={evidence === item} onClick={() => setEvidence(item)}>
                          {item}
                        </button>
                      ))}
                    </div>
                    <p className={styles.evidenceHelp}>
                      <Info size={14} /> {evidence} — {evidenceHelp[evidence]}
                    </p>
                  </div>
                  <label className={styles.field}>
                    <span className={styles.label}>근거 URL {needsSource ? '*' : '(선택)'}</span>
                    <input
                      className={styles.input}
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https:// 커뮤니티 글, 영상 등 근거 자료 주소"
                      required={needsSource}
                    />
                    <ul className={`${styles.help} ${styles.bullets}`}>
                      <li>주장을 뒷받침할만한 자료를 제시해주세요.</li>
                      <li>공식: 공식 홈페이지, 디렉터/디자이너 인터뷰, 소개 영상의 유튜브 링크, 신뢰할 수 있는 공식 소스 등</li>
                      <li>커뮤니티 추정: 최소한의 근거를 갖춘 플레이어 커뮤니티의 게시글 등</li>
                    </ul>
                  </label>
                </section>

                <section className={styles.card}>
                  <CardTitle title="추가 자료" caption="이하의 내용들은 빠른 검토를 위한 선택 사항입니다." />
                  <label className={styles.field}>
                    <span className={styles.label}>팬덤 위키 URL (선택)</span>
                    <input className={styles.input} type="url" value={wikiUrl} onChange={(e) => setWikiUrl(e.target.value)} placeholder="해당 맵의 팬덤 위키 링크" />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>추가 설명 (선택)</span>
                    <textarea className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} placeholder="맵과 실제 장소의 관계에 대한 설명" />
                  </label>
                  <div className={styles.twoFields}>
                    <ImageAttach
                      label="인게임 스크린샷 (선택)"
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
                      label="장소의 실제 이미지 (선택)"
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
                    <LockKeyhole size={12} /> 첨부 이미지는 관리자의 승인 전까지 게시되지 않습니다.
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
                이전
              </button>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? '제출 중…' : '장소 제보 제출'} <ArrowRight size={14} />
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
  const places = map.places.length ? map.places : [null]
  return (
    <>
      {places.map((place) => (
        <div key={place?.placeId ?? map.id} className={styles.matchRow}>
          <div className={styles.matchInfo}>
            <b>
              {gameName} · {map.name}
            </b>
            <small>{place ? `${place.country} > ${place.region ?? place.placeName} · 근거 ${place.evidence} · ${map.era}` : `장소 연결 없음 · ${map.era}`}</small>
          </div>
          {place && (
            <Link className={styles.small} to={`/?place=${encodeURIComponent(place.placeId)}`} target="_blank" rel="noopener">
              <MapIcon size={14} /> 지도에서 보기
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
                  location: `${place.country} > ${place.region ?? place.placeName}`,
                  evidence: place.evidence,
                  sourceCount: place.sourceCount,
                  hasWiki: Boolean(map.wikiUrl),
                })
              }
            >
              정보 수정 제안 {activeId === place.mapPlaceId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
          <img src={image.attached.previewUrl} alt={`${label} 미리보기`} />
          <span>
            <b>{image.attached.fileName}</b>
            <small>
              {image.attached.width} × {image.attached.height} · WebP · {Math.round(image.attached.bytes / 1024)}KB
            </small>
            <button type="button" onClick={onRemove}>
              삭제
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className={styles.dropzone} disabled={!rights} onClick={() => input.current?.click()}>
          이미지를 클릭해 선택
          <small>JPG·PNG·WebP·최대 15MB까지</small>
          {!rights && <small className={styles.rightsNote}>저작권 확인 사항에 체크하면 업로드할 수 있습니다</small>}
        </button>
      )}
      <label className={styles.rights}>
        <input type="checkbox" checked={rights} onChange={(e) => onRights(e.target.checked)} />
        직접 촬영했거나 저작권상 사용 가능한 이미지입니다
      </label>
    </div>
  )
}
