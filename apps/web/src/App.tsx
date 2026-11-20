import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';

import { Loading, Empty } from './components/common/ui';

import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';

import {
  VerifyEmailPage,
  ResetPasswordPage,
} from './pages/AccountLinkPages';

import OverviewPage from './pages/OverviewPage';
import NewbornsPage from './pages/NewbornsPage';
import NewbornProfilePage from './pages/NewbornProfilePage';
import MonitoringPage from './pages/MonitoringPage';
import ClinicalIntelligencePage from './pages/ClinicalIntelligencePage';
import AlertsPage from './pages/AlertsPage';
import AlertDetailPage from './pages/AlertDetailPage';
import ResponseLogPage from './pages/ResponseLogPage';
import DevicesPage from './pages/DevicesPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import NotificationsPage from './pages/NotificationsPage';

function Protected({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();

  if (loading) {
    return <Loading label="Checking your session" />;
  }

  return me ? <>{children}</> : <Navigate to="/login" replace />;
}

function Need({
  perm,
  children,
}: {
  perm: string;
  children: ReactNode;
}) {
  const { can } = useAuth();

  return can(perm) ? (
    <>{children}</>
  ) : (
    <Empty title="You don’t have access to this page">
      Your role does not include this permission. Ask a hospital administrator if you need it.
    </Empty>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public website */}
      <Route path="/" element={<LandingPage />} />

      {/* Authentication */}
      <Route path="/login" element={<AuthPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected clinical workspace */}
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/overview" element={<OverviewPage />} />

        <Route
          path="/newborns"
          element={
            <Need perm="newborn:read">
              <NewbornsPage />
            </Need>
          }
        />

        <Route
          path="/newborns/:id"
          element={
            <Need perm="newborn:read">
              <NewbornProfilePage />
            </Need>
          }
        />

        <Route
          path="/monitoring"
          element={
            <Need perm="observation:read">
              <MonitoringPage />
            </Need>
          }
        />

        <Route
          path="/clinical-intelligence"
          element={
            <Need perm="observation:read">
              <ClinicalIntelligencePage />
            </Need>
          }
        />

        <Route
          path="/alerts"
          element={
            <Need perm="alert:read">
              <AlertsPage />
            </Need>
          }
        />

        <Route
          path="/alerts/:id"
          element={
            <Need perm="alert:read">
              <AlertDetailPage />
            </Need>
          }
        />

        <Route
          path="/response-log"
          element={
            <Need perm="response:read">
              <ResponseLogPage />
            </Need>
          }
        />

        <Route
          path="/devices"
          element={
            <Need perm="device:read">
              <DevicesPage />
            </Need>
          }
        />

        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Unknown routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}