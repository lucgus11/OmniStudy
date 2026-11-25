import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { UpdatePrompt } from './components/UpdatePrompt';
import Dashboard from './pages/Dashboard';
import Subjects from './pages/Subjects';
import SubjectDetail from './pages/SubjectDetail';
import CourseView from './pages/CourseView';
import Study from './pages/Study';
import Settings from './pages/Settings';
import Auth from './pages/Auth';

// Pages "lourdes" ou plein écran : chargées à la demande
const Import = lazy(() => import('./pages/Import'));
const Session = lazy(() => import('./pages/Session'));
const Recall = lazy(() => import('./pages/Recall'));
const AudioPage = lazy(() => import('./pages/AudioPage'));

export default function App() {
  return (
    <>
      <UpdatePrompt />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Modes "focus" : plein écran, sans navigation */}
          <Route path="/session" element={<Session />} />
          <Route path="/recall/:courseId" element={<Recall />} />

          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="subjects" element={<Subjects />} />
            <Route path="subject/:id" element={<SubjectDetail />} />
            <Route path="import" element={<Import />} />
            <Route path="course/:id" element={<CourseView />} />
            <Route path="study" element={<Study />} />
            <Route path="audio" element={<AudioPage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="auth" element={<Auth />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
