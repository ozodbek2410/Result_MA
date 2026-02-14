import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuthStore } from './store/authStore';
import { Loading } from './components/ui/Loading';

// Lazy load pages and layouts
const LoginPage = lazy(() => import('./pages/LoginPage'));
const TeacherLayout = lazy(() => import('./layouts/TeacherLayout'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const PublicTestResult = lazy(() => import('./pages/PublicTestResult'));
const BlockTestAnswerKeysPage = lazy(() => import('./pages/teacher/BlockTestAnswerKeysPage'));
const BlockTestAllTestsPage = lazy(() => import('./pages/teacher/BlockTestAllTestsPage'));
const BlockTestAnswerSheetsViewPage = lazy(() => import('./pages/teacher/BlockTestAnswerSheetsViewPage'));

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
          <Route path="/p/:token" element={<PublicProfile />} />
          <Route path="/profile/:token" element={<PublicProfile />} />
          <Route path="/test-result/:resultId/:token" element={<PublicTestResult />} />
          
          {/* Teacher routes - Print pages without layout */}
          {user && (
            <>
              <Route path="/teacher/block-tests/:id/answer-keys" element={<BlockTestAnswerKeysPage />} />
              <Route path="/teacher/block-tests/:id/all-tests" element={<BlockTestAllTestsPage />} />
              <Route path="/teacher/block-tests/:id/answer-sheets" element={<BlockTestAnswerSheetsViewPage />} />
              <Route path="/teacher/*" element={<TeacherLayout />} />
            </>
          )}
          
          {/* Home route - redirect to login or teacher */}
          <Route path="/" element={
            user ? <Navigate to="/teacher" replace /> : <Navigate to="/login" replace />
          } />
          
          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
