/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 공용 문의 함수 주소(src/lib/inquiry.ts). 비어 있으면 문의를 보내지 않는다. */
  /** Google OAuth 웹 클라이언트 ID(src/lib/auth.tsx의 One Tap 로그인). 비어 있으면 Supabase 리디렉션 로그인만 쓴다. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
