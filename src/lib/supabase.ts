import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

// 브라우저에는 공개 키(anon)만 들어간다. service role 키는 절대 VITE_ 접두사로 두지 않는다.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY가 .env에 없습니다.')
}

export const supabase = createClient<Database>(url, anonKey)
