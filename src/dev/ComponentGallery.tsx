// 개발 전용: 공통 컴포넌트를 Figma '05 · 공통 컴포넌트' / 'v2 추가분'과 나란히 비교하기 위한 페이지.
// npm run dev 후 /dev/components. 프로덕션 빌드에는 포함되지 않는다.
import { useState, type ReactNode } from 'react'
import { EvidenceBadge, StatusBadge } from '../components/Badge.tsx'
import { Checkbox } from '../components/Checkbox.tsx'
import { FilterChip } from '../components/FilterChip.tsx'
import { AdminInput, SelectField, TextField } from '../components/FormField.tsx'
import { ImageUploadField, type AttachedImage } from '../components/ImageUploadField.tsx'
import { ClusterItem, MapLinkItem } from '../components/ListItem.tsx'
import { GameMoreMenu, Menu, MenuOption } from '../components/Menu.tsx'
import { ClusterBadge, Pin } from '../components/Pin.tsx'
import { SectionCard } from '../components/SectionCard.tsx'
import { SubmissionRow } from '../components/TableRow.tsx'
import { Thumbnail } from '../components/Thumbnail.tsx'
import styles from './ComponentGallery.module.css'

const SAMPLE: AttachedImage = {
  fileName: 'carentan_cod2.png',
  width: 1600,
  height: 900,
  bytes: 412 * 1024,
  previewUrl: '',
}

const GAMES = [
  { id: 'bf1942', name: 'Battlefield 1942' },
  { id: 'bf2042', name: 'Battlefield 2042' },
  { id: 'cod2', name: 'Call of Duty 2' },
  { id: 'codww2', name: 'Call of Duty: WWII' },
  { id: 'hll', name: 'Hell Let Loose' },
  { id: 'r6', name: 'Rainbow Six Siege' },
]

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <div className={styles.row}>{children}</div>
    </section>
  )
}

export default function ComponentGallery() {
  const [selectedGames, setSelectedGames] = useState(new Set(GAMES.filter((g) => g.id !== 'hll').map((g) => g.id)))
  const [confirmed, setConfirmed] = useState(true)
  const [shot, setShot] = useState<AttachedImage | null>(SAMPLE)

  const toggleGame = (id: string) =>
    setSelectedGames((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>공통 컴포넌트 (개발 확인용)</h1>

      <div className={styles.columns}>
        <Group title="Filter Chip">
          <FilterChip>필터</FilterChip>
          <FilterChip selected>필터</FilterChip>
          <FilterChip>+6 ▾</FilterChip>
        </Group>
        <Group title="Evidence Badge">
          <EvidenceBadge level="공식" />
          <EvidenceBadge level="커뮤니티 추정" />
          <EvidenceBadge level="기타" />
        </Group>
        <Group title="StatusBadge">
          <StatusBadge status="검토 대기" />
          <StatusBadge status="승인" />
          <StatusBadge status="반려" />
        </Group>
        <Group title="Pin">
          <Pin aria-label="장소" />
          <ClusterBadge count={8} />
          <Pin selected aria-label="선택된 장소" />
          <ClusterBadge count={8} active />
          <Pin selected small aria-label="선택된 장소(소형)" />
        </Group>
      </div>

      <div className={styles.columns}>
        <Group title="Checkbox · Thumbnail">
          <Checkbox checked readOnly aria-label="선택" />
          <Checkbox checked={false} readOnly aria-label="해제" />
          <Thumbnail />
          <Thumbnail src={null} />
          <Thumbnail size="small" />
          <Thumbnail size="small" src={null} />
        </Group>
        <Group title="게임 더보기 드롭다운">
          <GameMoreMenu
            games={GAMES}
            selected={selectedGames}
            onToggle={toggleGame}
            onSelectAll={() => setSelectedGames(new Set(GAMES.map((g) => g.id)))}
            onClearAll={() => setSelectedGames(new Set())}
          />
        </Group>
      </div>

      <Group title="ListItem · 썸네일">
        <div className={styles.w344}>
          <MapLinkItem
            gameName="Call of Duty 2"
            mapName="Carentan"
            era="WWII"
            thumbnailSrc={undefined}
            sources={[{ label: '게임 소개 자료 (예시)', url: 'https://example.com' }]}
            wiki={{ label: 'Call of Duty 2 / Carentan', url: 'https://example.com' }}
          />
        </div>
        <div className={styles.w344}>
          <MapLinkItem
            gameName="Call of Duty 2"
            mapName="Carentan"
            era="WWII"
            thumbnailSrc={null}
            sources={[]}
            wiki={null}
          />
        </div>
        <div className={styles.w348}>
          <ClusterItem
            gameName="Call of Duty 2"
            era="WWII"
            mapName="Carentan"
            placeName="카랑탕"
            thumbnailSrc={undefined}
            onClick={() => {}}
          />
        </div>
        <div className={styles.w348}>
          <ClusterItem
            gameName="Call of Duty 2"
            era="WWII"
            mapName="Carentan"
            placeName="카랑탕"
            thumbnailSrc={undefined}
            selected
            onClick={() => {}}
          />
        </div>
        <div className={styles.w344}>
          <MapLinkItem
            gameName="Hell Let Loose"
            mapName="Carentan"
            era="WWII"
            thumbnailSrc={null}
            sources={[]}
            wiki={null}
          />
        </div>
      </Group>

      <Group title="TableRow">
        <div className={styles.w928}>
          <SubmissionRow
            person="김민준"
            date="2026.10.09"
            gameName="Call of Duty 2"
            mapName="Carentan"
            location="카랑탕 · 프랑스"
            linkLabel="자료 열기"
            status="검토 대기"
            onClick={() => {}}
          />
          <SubmissionRow
            person="김민준"
            date="2026.10.09"
            gameName="Call of Duty 2"
            mapName="Carentan"
            location="카랑탕 · 프랑스"
            linkLabel="자료 열기"
            status="검토 대기"
            selected
            onClick={() => {}}
          />
        </div>
      </Group>

      <Group title="FormField">
        <div className={styles.w388}>
          <SelectField label="게임명 *" defaultValue="cod2">
            <option value="cod2">Call of Duty 2</option>
          </SelectField>
          <Menu className={styles.mt4}>
            <MenuOption>목록에 없는 게임 직접 입력</MenuOption>
          </Menu>
        </div>
        <div className={styles.w388}>
          <TextField label="맵 이름 *" defaultValue="Carentan" />
        </div>
        <div className={styles.w792}>
          <TextField
            label="근거 링크 *"
            placeholder="https:// 출처 URL을 입력해주세요"
            error="필수 항목입니다. 공식 자료 또는 확인 가능한 출처를 입력해주세요."
          />
        </div>
        <div className={styles.w192}>
          <AdminInput defaultValue="카랑탕, 노르망디" aria-label="관리자 확정 · 도시·지역" />
        </div>
      </Group>

      <Group title="FormField · 이미지 업로드">
        <div className={styles.w388}>
          <ImageUploadField label="인게임 스크린샷 *" value={null} onSelect={() => {}} onRemove={() => {}} />
        </div>
        <div className={styles.w388}>
          <ImageUploadField label="인게임 스크린샷 *" value={SAMPLE} onSelect={() => {}} onRemove={() => {}} />
        </div>
        <div className={styles.w388}>
          <ImageUploadField
            label="인게임 스크린샷 *"
            value={null}
            error="인게임 스크린샷은 필수입니다."
            onSelect={() => {}}
            onRemove={() => {}}
          />
        </div>
      </Group>

      <Group title="SectionCard / 이미지 첨부">
        <SectionCard title="이미지 첨부" aside="인게임 스크린샷 1장 필수 · 장소 사진 1장 선택" className={styles.w1368}>
          <div className={styles.imageFields}>
            <div className={styles.w388}>
              <ImageUploadField
                label="인게임 스크린샷 *"
                value={shot}
                onSelect={() => setShot(SAMPLE)}
                onRemove={() => setShot(null)}
              />
            </div>
            <div className={styles.w388}>
              <ImageUploadField label="장소 실제 사진 (선택)" value={null} onSelect={() => {}} onRemove={() => {}} />
            </div>
            <div className={styles.imageGuide}>
              <strong>이미지 안내</strong>
              <span>· 본인이 직접 촬영·캡처한 이미지만 첨부해주세요.</span>
              <span>· 다른 사람의 영상·게시물에서 가져온 이미지는 올리지 마세요.</span>
              <span>· 항목당 1장씩 첨부합니다. 승인 전까지 공개되지 않습니다.</span>
            </div>
          </div>
          <Checkbox className={styles.confirm} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
            첨부한 이미지는 본인이 직접 촬영·캡처한 것입니다 *
          </Checkbox>
          <p className={styles.note}>반려된 제보의 이미지는 30일 후, 제출되지 않은 업로드는 24시간 후 자동 삭제됩니다.</p>
        </SectionCard>
      </Group>
    </main>
  )
}
