import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth.tsx'
import styles from './Admin.module.css'

/** 관리자만 들어온다. 일반 사용자·비로그인은 지도로 돌려보낸다(데이터는 RLS가 따로 막는다). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className={styles.loading}>권한을 확인하고 있습니다.</div>
  if (profile?.role !== 'admin') return <Navigate to="/" replace />
  return children
}
