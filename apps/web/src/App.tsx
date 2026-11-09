import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import { Loading, Empty } from './components/common/ui';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import NewbornsPage from './pages/NewbornsPage';
import NewbornProfilePage from './pages/NewbornProfilePage';
import MonitoringPage from './pages/MonitoringPage';
import AlertsPage from './pages/AlertsPage';
import AlertDetailPage from './pages/AlertDetailPage';
import ResponseLogPage from './pages/ResponseLogPage';
import DevicesPage from './pages/DevicesPage';
import SettingsPage from './pages/SettingsPage';

function Protected({ children }: { children: ReactNode }) { const { me, loading } = useAuth(); if (loading) return <Loading label="Checking your session" />; return me ? <>{children}</> : <Navigate to="/login" replace />; }
function Need({ perm, children }: { perm: string; children: ReactNode }) { const { can } = useAuth(); return can(perm) ? <>{children}</> : <Empty title="You don’t have access to this page">Your role does not include this permission. Ask a hospital administrator if you need it.</Empty>; }

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<OverviewPage />} />
        <Route path="newborns" element={<Need perm="newborn:read"><NewbornsPage /></Need>} />
        <Route path="newborns/:id" element={<Need perm="newborn:read"><NewbornProfilePage /></Need>} />
        <Route path="monitoring" element={<Need perm="observation:read"><MonitoringPage /></Need>} />
        <Route path="alerts" element={<Need perm="alert:read"><AlertsPage /></Need>} />
        <Route path="alerts/:id" element={<Need perm="alert:read"><AlertDetailPage /></Need>} />
        <Route path="response-log" element={<Need perm="response:read"><ResponseLogPage /></Need>} />
        <Route path="devices" element={<Need perm="device:read"><DevicesPage /></Need>} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
