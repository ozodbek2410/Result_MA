import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuthStore } from './store/authStore';
import { Loading } from './components/ui/Loading';

// Lazy load pages and layouts
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SsoCallbackPage = lazy(() => import('./pages/auth/SsoCallbackPage'));
const ChangePasswordPage = lazy(() => import('./pages/auth/ChangePasswordPage'));
const TeacherLayout = lazy(() => import('./layouts/TeacherLayout'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const PublicTestResult = lazy(() => import('./pages/PublicTestResult'));
const BlockTestAnswerKeysPage = lazy(() => import('./pages/teacher/BlockTestAnswerKeysPage'));
const TestPrintPage = lazy(() => import('./pages/teacher/TestPrintPage'));

function App() {
  const { user } = useAuthStore();

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/sso" element={<SsoCallbackPage />} />
          <Route path="/p/:token" element={<PublicProfile />} />
          <Route path="/profile/:token" element={<PublicProfile />} />
          <Route path="/test-result/:resultId/:token" element={<PublicTestResult />} />
          
          {/* Force password change gate: if set, only allow /change-password */}
          {user && user.mustChangePassword && (
            <>
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="*" element={<Navigate to="/change-password" replace />} />
            </>
          )}

          {/* Teacher routes - Print pages without layout */}
          {user && !user.mustChangePassword && (
            <>
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/teacher/block-tests/:id/answer-keys" element={<BlockTestAnswerKeysPage />} />
              <Route path="/teacher/block-tests/:id/print/:type" element={<TestPrintPage />} />
              <Route path="/teacher/*" element={<TeacherLayout />} />
            </>
          )}

          {/* Home route - redirect to login or teacher */}
          <Route path="/" element={
            user
              ? (user.mustChangePassword ? <Navigate to="/change-password" replace /> : <Navigate to="/teacher" replace />)
              : <Navigate to="/login" replace />
          } />
          
          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
