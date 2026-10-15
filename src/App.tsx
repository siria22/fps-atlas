import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './app/AppLayout.tsx'
import { AtlasPage } from './features/atlas/AtlasPage.tsx'
import { CompletePage, LoginRequiredPage, MySubmissionsPage, ReportPage } from './features/submissions/SubmissionPages.tsx'
import { AdminOnly } from './features/admin/AdminOnly.tsx'
import { GuidePage } from './features/guide/GuidePage.tsx'

// 관리 화면은 관리자만 쓰므로 따로 불러온다.
const AdminReviewPage = lazy(() => import('./features/admin/AdminReviewPage.tsx').then((m) => ({ default: m.AdminReviewPage })))
const AdminRegisterPage = lazy(() => import('./features/admin/AdminRegisterPage.tsx').then((m) => ({ default: m.AdminRegisterPage })))

// 개발 서버에서만 /dev/components 로 공통 컴포넌트 확인 페이지를 연다. 프로덕션 번들에서는 제거된다.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./dev/ComponentGallery.tsx')) : null

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<AtlasPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="report/login" element={<LoginRequiredPage />} />
        <Route path="report/complete" element={<CompletePage />} />
        <Route path="my" element={<MySubmissionsPage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="admin" element={<AdminOnly><Suspense fallback={null}><AdminReviewPage /></Suspense></AdminOnly>} />
        <Route path="admin/new" element={<AdminOnly><Suspense fallback={null}><AdminRegisterPage /></Suspense></AdminOnly>} />
      </Route>
      {ComponentGallery && (
        <Route
          path="/dev/components"
          element={
            <Suspense fallback={null}>
              <ComponentGallery />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
