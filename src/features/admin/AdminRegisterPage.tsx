import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Info, Search } from 'lucide-react'
import { FilterChip } from '../../components/FilterChip.tsx'
import { ImageUploadField } from '../../components/ImageUploadField.tsx'
import { supabase } from '../../lib/supabase.ts'
import type { Era, EvidenceLevel } from '../../lib/domain.ts'
import { prepareImage, type PreparedImage } from '../submissions/images.ts'
import { LocationPicker, type Coords, type LocationValue } from '../submissions/LocationPicker.tsx'
import { AdminTabs } from './AdminTabs.tsx'
import { ERAS, EVIDENCE_LEVELS, isHttpUrl, placeCandidates, removePublic, rpcArgs, useAdminCatalog, useAdminPlaces, useRefreshAdmin } from './api.ts'
import { PlaceChoice, type PlaceDecision } from './PlaceChoice.tsx'
import styles from './Admin.module.css'

const LICENSES = ['CC BY-SA 4.0', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC0', '퍼블릭 도메인']
const EMPTY_LOCATION: LocationValue = { countryCode: null, country: '', admin1Code: null, region: '' }
const normalize = (value: string) => value.trim().toLocaleLowerCase()

/** 화면 10 · 관리자 직접 등록. 입력하면 검토 없이 바로 공개 데이터에 들어간다. */
export function AdminRegisterPage() {
  const catalog = useAdminCatalog()
  const places = useAdminPlaces()
  const refresh = useRefreshAdmin()

  const [search, setSearch] = useState('')
  const [gameName, setGameName] = useState('')
  const [mapName, setMapName] = useState('')
  const [evidence, setEvidence] = useState<EvidenceLevel>('커뮤니티 추정')
  const [era, setEra] = useState<Era | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [wikiUrl, setWikiUrl] = useState('')
  const [note, setNote] = useState('')
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [place, setPlace] = useState<PlaceDecision>(null)
  const [screenshot, setScreenshot] = useState<PreparedImage | null>(null)
  const [photoSource, setPhotoSource] = useState<'upload' | 'commons'>('upload')
  const [photo, setPhoto] = useState<PreparedImage | null>(null)
  const [commons, setCommons] = useState({ file: '', author: '', license: LICENSES[0] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ placeId: string; label: string } | null>(null)

  useEffect(() => () => { if (screenshot) URL.revokeObjectURL(screenshot.attached.previewUrl) }, [screenshot])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.attached.previewUrl) }, [photo])

  const games = catalog.data?.games ?? []
  const maps = catalog.data?.maps ?? []
  const game = games.find((g) => normalize(g.name) === normalize(gameName)) ?? null
  const existingMap = game ? (maps.find((m) => m.gameId === game.id && normalize(m.name) === normalize(mapName)) ?? null) : null
  const searchOptions = maps.map((m) => ({ map: m, label: `${games.find((g) => g.id === m.gameId)?.name ?? ''} · ${m.name}` }))
  const searchHit = searchOptions.find((o) => normalize(o.label) === normalize(search)) ?? null
  const effectiveEra = era ?? existingMap?.era ?? '기타'
  const candidates = placeCandidates(places.data, location.countryCode, location.admin1Code)
  const existingPlace = place?.kind === 'existing' ? (places.data?.find((p) => p.id === place.placeId) ?? null) : null

  const pickSearch = (text: string) => {
    setSearch(text)
    const hit = searchOptions.find((o) => normalize(o.label) === normalize(text))
    if (hit) {
      setGameName(games.find((g) => g.id === hit.map.gameId)?.name ?? '')
      setMapName(hit.map.name)
      setEra(null)
    }
  }

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

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setDone(null)
    if (!gameName.trim() || !mapName.trim()) return setError('게임명과 맵 이름을 입력해 주세요.')
    if (evidence !== '기타' && !isHttpUrl(sourceUrl.trim())) return setError('공식·커뮤니티 추정 근거에는 근거 링크가 필요합니다.')
    if (sourceUrl.trim() && !isHttpUrl(sourceUrl.trim())) return setError('근거 링크에 올바른 주소를 입력해 주세요.')
    if (wikiUrl.trim() && !isHttpUrl(wikiUrl.trim())) return setError('팬덤 위키 링크에 올바른 주소를 입력해 주세요.')
    if (!place) return setError('장소를 확정해 주세요.')
    if (place.kind === 'new') {
      if (!place.name.trim()) return setError('새 장소 이름을 입력해 주세요.')
      if (!location.countryCode) return setError('국가를 목록에서 골라 주세요.')
      if (location.region.trim() && !location.admin1Code) return setError('주·도는 목록이나 지도에서 고르거나 비워 주세요.')
      if (!coords) return setError('공개 좌표를 정해 주세요.')
    }
    if (photoSource === 'commons' && (commons.file.trim() || commons.author.trim()) && !(commons.file.trim() && commons.author.trim()))
      return setError('Commons 사진은 파일명과 작성자를 모두 입력해 주세요.')

    setBusy(true)
    const folder = `admin/${crypto.randomUUID()}`
    const uploaded: string[] = []
    const upload = async (image: PreparedImage, key: string) => {
      const pair = { full: `${folder}/${key}.webp`, thumb: `${folder}/${key}-thumb.webp` }
      for (const [path, body] of [[pair.full, image.image], [pair.thumb, image.thumb]] as const) {
        const { error: upError } = await supabase.storage.from('public-images').upload(path, body, { contentType: 'image/webp' })
        if (upError) throw upError
        uploaded.push(path)
      }
      return pair
    }
    try {
      const shot = screenshot ? await upload(screenshot, 'screenshot') : null
      const placePhoto = photoSource === 'upload' && photo && !existingPlace?.hasPhoto ? await upload(photo, 'place-photo') : null
      const useCommons = photoSource === 'commons' && commons.file.trim() !== ''
      const { data: linkId, error: rpcError } = await supabase.rpc(
        'admin_register',
        rpcArgs.register({
          p_game_id: game?.id ?? null,
          p_game_name: gameName.trim(),
          p_map_id: existingMap?.id ?? null,
          p_map_name: mapName.trim(),
          p_era: effectiveEra,
          p_wiki_url: wikiUrl.trim() || null,
          p_place_id: existingPlace?.id ?? null,
          p_place_name: place.kind === 'new' ? place.name.trim() : null,
          p_country: location.country.trim() || null,
          p_country_code: location.countryCode,
          p_region: location.admin1Code ? location.region : null,
          p_admin1_code: location.admin1Code,
          p_lat: coords?.lat ?? null,
          p_lng: coords?.lng ?? null,
          p_evidence: evidence,
          p_source_url: sourceUrl.trim() || null,
          p_note: note.trim() || null,
          p_screenshot_path: shot?.full ?? null,
          p_screenshot_thumb_path: shot?.thumb ?? null,
          p_place_photo_path: placePhoto?.full ?? null,
          p_place_photo_thumb_path: placePhoto?.thumb ?? null,
          p_commons_file: useCommons ? commons.file.trim() : null,
          p_commons_author: useCommons ? commons.author.trim() : null,
          p_commons_license: useCommons ? commons.license : null,
        }),
      )
      if (rpcError) throw rpcError
      const { data: link } = await supabase.from('map_places').select('place_id').eq('id', linkId).single()
      await refresh()
      setDone({ placeId: link?.place_id ?? '', label: `${gameName.trim()} · ${mapName.trim()}` })
      setSearch('')
      setGameName('')
      setMapName('')
      setSourceUrl('')
      setWikiUrl('')
      setNote('')
      setEra(null)
      setPlace(null)
      setLocation(EMPTY_LOCATION)
      setCoords(null)
      setScreenshot(null)
      setPhoto(null)
      setCommons({ file: '', author: '', license: LICENSES[0] })
    } catch (e) {
      await removePublic(uploaded)
      setError(`등록하지 못했습니다: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <div>
          <span className={styles.breadcrumb}>아카이브 / 관리자 전용</span>
          <h1>관리자가 직접 장소 연결을 등록합니다</h1>
          <p>게임, 맵, 국가·주·도, 근거를 입력하면 바로 아카이브에 반영됩니다</p>
        </div>
      </header>
      <AdminTabs active="register" />

      {done && (
        <p className={styles.done} role="status">
          <span>
            <Info size={14} /> {done.label} 연결을 등록했습니다.{' '}
            {done.placeId && (
              <Link to={`/?place=${encodeURIComponent(done.placeId)}`} className={styles.introAside}>
                지도에서 보기
              </Link>
            )}
          </span>
        </p>
      )}

      <form onSubmit={(e) => void submit(e)}>
        <div className={styles.registerColumns}>
          <section className={styles.card}>
            <div className={styles.cardTitle}>
              <h2>게임과 근거</h2>
              <small>* 필수 항목</small>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>이미 등록된 맵인지 먼저 검색</span>
              <span>
                <input className={styles.input} list="admin-maps" value={search} onChange={(e) => pickSearch(e.target.value)} placeholder="게임 · 맵 검색" />
              </span>
              <datalist id="admin-maps">
                {searchOptions.map((o) => <option key={o.map.id} value={o.label} />)}
              </datalist>
            </label>
            {search.trim() && (
              <div className={styles.searchResult}>
                {searchHit ? (
                  <span>
                    등록된 맵입니다 · {searchHit.label} · {searchHit.map.era}. 장소 연결을 추가합니다.
                  </span>
                ) : (
                  <>
                    <span>검색 결과가 없습니다. 새 맵으로 등록하시겠어요?</span>
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() => {
                        const [g, m] = search.split('·').map((v) => v.trim())
                        if (m) {
                          setGameName(g ?? '')
                          setMapName(m)
                        } else setMapName(search.trim())
                      }}
                    >
                      새 맵으로 등록
                    </button>
                  </>
                )}
              </div>
            )}
            <div className={styles.twoFields}>
              <label className={styles.field}>
                <span className={styles.label}>게임명 *</span>
                <span className={styles.adminCombo}>
                  <Search size={14} aria-hidden />
                  <input className={styles.input} list="admin-games" value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="게임 검색 또는 직접 입력" />
                  <ChevronDown size={14} aria-hidden />
                </span>
                <datalist id="admin-games">
                  {games.map((g) => <option key={g.id} value={g.name} />)}
                </datalist>
                <small className={styles.help}>{gameName.trim() && !game ? '목록에 없는 게임 · 새 게임으로 등록합니다' : '목록에서 고르거나, 없으면 직접 입력'}</small>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>맵 이름 *</span>
                <input className={styles.input} value={mapName} onChange={(e) => { setMapName(e.target.value); setEra(null) }} placeholder="게임 맵 이름" />
                <small className={styles.help}>{existingMap ? '등록된 맵 · 장소 연결을 추가합니다' : mapName.trim() ? '새 맵으로 등록합니다' : ''}</small>
              </label>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>근거 수준</span>
              <div className={styles.chipGroup}>
                {EVIDENCE_LEVELS.map((v) => (
                  <FilterChip key={v} selected={evidence === v} onClick={() => setEvidence(v)}>
                    {v}
                  </FilterChip>
                ))}
              </div>
              <small className={styles.help}>관리자가 직접 근거 수준을 확정합니다</small>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>시대 *</span>
              <div className={styles.chipGroup}>
                {ERAS.map((v) => (
                  <FilterChip key={v} selected={effectiveEra === v} onClick={() => setEra(v)}>
                    {v}
                  </FilterChip>
                ))}
              </div>
              <small className={styles.help}>맵 단위 값입니다. 목록에 없거나 판단하기 어려우면 기타로 둡니다.</small>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>근거 링크 {evidence === '기타' ? '(선택)' : '*'} (공식·커뮤니티 추정 필수 · 기타 선택)</span>
              <input className={styles.input} type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>팬덤 위키 링크 (선택)</span>
              <input className={styles.input} type="url" value={wikiUrl} onChange={(e) => setWikiUrl(e.target.value)} placeholder="선택 입력 · 위키 링크 없음" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>추가 설명 (선택)</span>
              <input className={styles.input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="맵과 실제 장소의 관계에 대한 설명" />
            </label>
          </section>

          <div className={styles.side}>
            <LocationPicker
              title="관리자 확정 · 위치"
              caption="국가·주·도와 공개 좌표를 확정합니다."
              value={existingPlace ? { countryCode: existingPlace.countryCode, country: existingPlace.country, admin1Code: existingPlace.admin1Code, region: existingPlace.region ?? '' } : location}
              onChange={setLocation}
              pin={{ coords: existingPlace ? { lat: existingPlace.lat, lng: existingPlace.lng } : coords, onChange: setCoords, readOnly: Boolean(existingPlace) }}
            />
            <section className={styles.card}>
              <div className={styles.cardTitle}>
                <h2>관리자 확정 · 장소</h2>
              </div>
              <p className={styles.cardCaption}>고른 주·도에 이미 등록된 장소가 있으면 연결하고, 없으면 새 장소로 등록합니다.</p>
              <PlaceChoice candidates={candidates} mapId={existingMap?.id ?? null} value={place} onChange={setPlace} newHint="장소 이름을 정하고 위 지도에서 공개 핀을 찍습니다" />
              <small className={styles.help}>기존 장소를 고르면 그 장소의 좌표를 그대로 씁니다. 같은 맵과 이미 연결돼 있으면 근거만 추가됩니다.</small>
            </section>
          </div>
        </div>

        <section className={`${styles.card} ${styles.imagesCard}`}>
          <div className={styles.cardTitle}>
            <h2>이미지</h2>
            <small>관리자 등록 · 모두 선택 입력</small>
          </div>
          <div className={styles.imageColumns}>
            <ImageUploadField label="인게임 스크린샷 (선택)" value={screenshot?.attached ?? null} onSelect={(f) => void attach(f, 'screenshot')} onRemove={() => setScreenshot(null)} />
            <div className={styles.field}>
              <span className={styles.label}>장소 사진 출처</span>
              <div className={styles.chipGroup}>
                <FilterChip selected={photoSource === 'upload'} onClick={() => setPhotoSource('upload')}>
                  직접 업로드
                </FilterChip>
                <FilterChip selected={photoSource === 'commons'} onClick={() => setPhotoSource('commons')}>
                  Wikimedia Commons
                </FilterChip>
              </div>
              {photoSource === 'upload' ? (
                <ImageUploadField label="장소 사진 (선택)" value={photo?.attached ?? null} onSelect={(f) => void attach(f, 'photo')} onRemove={() => setPhoto(null)} />
              ) : (
                <>
                  <div className={styles.threeFields}>
                    <label className={styles.field}>
                      <span className={styles.label}>Commons 파일명 *</span>
                      <input className={styles.input} value={commons.file} onChange={(e) => setCommons({ ...commons, file: e.target.value })} placeholder="File:….jpg" />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>작성자 *</span>
                      <input className={styles.input} value={commons.author} onChange={(e) => setCommons({ ...commons, author: e.target.value })} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>라이선스 *</span>
                      <select className={styles.input} value={commons.license} onChange={(e) => setCommons({ ...commons, license: e.target.value })}>
                        {LICENSES.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <small className={styles.help}>공개 화면에 파일명·작성자·라이선스가 함께 표시됩니다. Commons 이미지는 서버에 저장하지 않고 링크로 불러옵니다.</small>
                </>
              )}
              {existingPlace?.hasPhoto && <small className={styles.help}>고른 장소에 이미 사진이 있어 장소 사진은 바뀌지 않습니다.</small>}
            </div>
          </div>
        </section>

        <div className={styles.submitRow}>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? '등록 중…' : '바로 등록'} <ArrowRight size={14} />
          </button>
          <small className={styles.help}>입력값을 확인한 뒤 등록해주세요</small>
        </div>
      </form>
    </main>
  )
}
