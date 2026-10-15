// 연동 해제(탈퇴). 로그인한 본인만 자기 계정을 지운다.
// 본문: { "keepName": boolean } — false면 공개된 이미지 출처의 이름을 "사용자"로 바꾼 뒤 지운다.
// 순서: 출처 이름 처리(제보가 남아 있어야 찾을 수 있음) → 비공개 업로드 폴더 삭제 → 인증 계정 삭제
//       (profiles·제보·수정 제안은 on delete cascade로 함께 지워진다. 공개 버킷의 승인 이미지는 남는다.)
import { createClient } from 'npm:@supabase/supabase-js@2'

const PRIVATE_BUCKET = 'submission-images'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: '로그인이 필요합니다.' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return json({ error: '로그인 정보를 확인할 수 없습니다.' }, 401)

  const body = await req.json().catch(() => ({}))
  if (typeof body.keepName !== 'boolean') return json({ error: 'keepName(true/false)이 필요합니다.' }, 400)

  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (profile?.role === 'admin') return json({ error: '관리자 계정은 탈퇴할 수 없습니다. 먼저 관리자 권한을 해제하세요.' }, 403)

  let anonymized = 0
  if (!body.keepName) {
    const { data, error } = await admin.rpc('anonymize_user_credits', { p_user: user.id })
    if (error) return json({ error: error.message }, 500)
    anonymized = data ?? 0
  }

  // 비공개 버킷의 본인 폴더(<사용자 id>/<제보별 폴더>/파일)를 비운다. 승인된 이미지는 공개 버킷에 복사돼 있어 영향 없음.
  const bucket = admin.storage.from(PRIVATE_BUCKET)
  const paths: string[] = []
  const walk = async (prefix: string): Promise<string | null> => {
    for (let offset = 0; ; offset += 100) {
      const { data: entries, error } = await bucket.list(prefix, { limit: 100, offset })
      if (error) return error.message
      for (const entry of entries ?? []) {
        // 폴더는 id가 없다
        if (entry.id) paths.push(`${prefix}/${entry.name}`)
        else {
          const nested = await walk(`${prefix}/${entry.name}`)
          if (nested) return nested
        }
      }
      if (!entries || entries.length < 100) return null
    }
  }
  const listError = await walk(user.id)
  if (listError) return json({ error: listError }, 500)
  let removed = 0
  for (let i = 0; i < paths.length; i += 100) {
    const { data: gone, error: removeError } = await bucket.remove(paths.slice(i, i + 100))
    if (removeError) return json({ error: removeError.message }, 500)
    removed += gone?.length ?? 0
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) return json({ error: deleteError.message }, 500)

  console.log(JSON.stringify({ deleted: user.id, anonymized, removed }))
  return json({ ok: true, anonymized, removed })
})
