import React, { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  Outlet,
} from 'react-router-dom';

import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { FarmProfilePage } from './pages/FarmProfilePage';
import { ChatPage } from './pages/ChatPage';
import { MarketIntelligencePage } from './pages/MarketIntelligencePage';
import { SustainabilityPage } from './pages/SustainabilityPage';
import { TenantAdminPage } from './pages/TenantAdminPage';
import { PlatformAdminPage } from './pages/PlatformAdminPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { ContentModerationPage } from './pages/ContentModerationPage';
import { GroupManagementPage } from './pages/GroupManagementPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

import { ConnectionStatusIndicator } from './components/ConnectionStatus';
import { AlertNotifications } from './components/AlertNotifications';

import { I18nProvider } from './i18n';
import { isAuthenticated } from './services/authClient';
import { startBackgroundSync } from './services/backgroundSync';
import { getAlerts } from './services/alertClient';
import type { Alert } from './services/alertClient';
import type { AlertNotification } from './services/marketClient';

// Adapt Alert → AlertNotification shape for the existing component
function toNotification(a: Alert): AlertNotification {
  return {
    id: a.id,
    type: (a.type as AlertNotification['type']) ?? 'price_change',
    title: a.title,
    message: a.message,
    crop: (a.data?.crop as string) ?? '',
    market: (a.data?.market as string) ?? '',
    priority: a.priority,
    actionable_info: (a.data?.actionable_info as string) ?? '',
    created_at: a.created_at,
    read: a.read,
  };
}

/** Redirect to /login when not authenticated */
function AuthGuard() {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

/** App shell with persistent header */
function AppShell() {
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);

  // Poll for alerts every 60 seconds
  useEffect(() => {
    let cancelled = false;

    async function fetchAlerts() {
      try {
        const raw = await getAlerts();
        if (!cancelled) {
          setAlerts(raw.filter((a) => !a.read).map(toNotification));
        }
      } catch {
        // Degrade gracefully — no alerts shown when offline/error
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#1976d2',
          color: '#fff',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 18 }}>🌾 KrishiMitra</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ConnectionStatusIndicator />
          <button
            onClick={() => setShowAlerts((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 20,
              position: 'relative',
            }}
            aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          >
            🔔
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: '#f44336',
                  color: '#fff',
                  borderRadius: '50%',
                  fontSize: 10,
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {showAlerts && (
        <div
          style={{
            position: 'fixed',
            top: 48,
            right: 16,
            zIndex: 1000,
            background: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: 8,
            maxWidth: 360,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          <AlertNotifications notifications={alerts} />
        </div>
      )}

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  // Initialize background sync once on mount
  useEffect(() => {
    const stop = startBackgroundSync();
    return stop;
  }, []);

  return (
    <I18nProvider>
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/farm-profile" element={<FarmProfilePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/market" element={<MarketIntelligencePage />} />
            <Route path="/sustainability" element={<SustainabilityPage />} />
            <Route path="/admin" element={<TenantAdminPage />} />
            <Route path="/platform-admin" element={<PlatformAdminPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/moderation" element={<ContentModerationPage />} />
            <Route path="/groups" element={<GroupManagementPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/chat" replace />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </I18nProvider>
  );
}

export default App;
