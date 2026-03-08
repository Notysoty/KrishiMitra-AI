import React, { useEffect, useState, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
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
import { ProfilePage } from './pages/ProfilePage';
import { DashboardPage } from './pages/DashboardPage';

import { ConnectionStatusIndicator } from './components/ConnectionStatus';
import { AlertNotifications } from './components/AlertNotifications';
import { LanguageSelector } from './components/LanguageSelector';
import { ThemeToggle } from './components/ThemeToggle';
import { CommandPalette } from './components/CommandPalette';

import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { I18nProvider, useTranslation } from './i18n';
import { isAuthenticated, logout, isAdmin } from './services/authClient';
import { startBackgroundSync, setupPushNotifications } from './services/backgroundSync';
import { getAlerts } from './services/alertClient';
import type { Alert } from './services/alertClient';
import type { AlertNotification } from './services/marketClient';

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

function AuthGuard() {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

function AppShell() {
  const { t } = useTranslation();

  const MAIN_NAV = [
    { path: '/dashboard', label: t('navDashboard'), icon: '🏠' },
    { path: '/chat', label: t('navChat'), icon: '💬' },
    { path: '/farm-profile', label: t('navFarm'), icon: '🏡' },
    { path: '/market', label: t('market'), icon: '📊' },
    { path: '/sustainability', label: t('navSustainability'), icon: '🌱' },
    { path: '/groups', label: t('navGroups'), icon: '👥' },
  ];

  const ADMIN_NAV = [
    { path: '/admin', label: t('navAdmin'), icon: '⚙️' },
    { path: '/analytics', label: t('navAnalytics'), icon: '📈' },
    { path: '/audit-log', label: t('navAudit'), icon: '📋' },
    { path: '/moderation', label: t('navModeration'), icon: '🛡️' },
    { path: '/platform-admin', label: t('navPlatform'), icon: '🔧' },
  ];
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    async function fetchAlerts() {
      try {
        const raw = await getAlerts();
        if (!cancelled) {
          setAlerts(raw.filter((a) => !a.read).map(toNotification));
        }
      } catch { /* graceful degradation */ }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCmdPaletteOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  const unreadCount = alerts.filter((a) => !a.read).length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNav = (path: string) => {
    navigate(path);
  };

  const isActive = (path: string) => location.pathname === path;

  const isAdminActive = ADMIN_NAV.some((item) => location.pathname === item.path);

  return (
    <div className="app-layout">
      <aside
        className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`}
      >
        <div className="sidebar-logo">
          <img src="/logo.svg" alt="" className="logo-icon" width={28} height={28} style={{ borderRadius: '6px' }} />
          <span className="logo-text">KrishiMitra</span>
        </div>

        <nav className="sidebar-nav">
          {MAIN_NAV.map((item) => (
            <button
              key={item.path}
              className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => handleNav(item.path)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}

          {isAdmin() && (
          <div className="sidebar-section">
            <button
              className="sidebar-section-title"
              onClick={() => setAdminOpen((v) => !v)}
            >
              <span>{t('navAdmin')}</span>
              <span className={`chevron ${adminOpen ? 'open' : ''}`}>▾</span>
            </button>

            {(adminOpen || isAdminActive) &&
              ADMIN_NAV.map((item) => (
                <button
                  key={item.path}
                  className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => handleNav(item.path)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
          </div>
          )}
        </nav>

        <div className="sidebar-bottom">
          <button
            className={`sidebar-nav-item ${isActive('/profile') ? 'active' : ''}`}
            onClick={() => handleNav('/profile')}
            title={sidebarCollapsed ? t('profile') : undefined}
          >
            <span className="nav-icon">👤</span>
            <span className="nav-label">{t('profile')}</span>
          </button>
          <button
            className="sidebar-nav-item"
            onClick={handleLogout}
            title={sidebarCollapsed ? t('logout') : undefined}
          >
            <span className="nav-icon">🚪</span>
            <span className="nav-label">{t('logout')}</span>
          </button>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>
      </aside>

      {mobileSidebarOpen && (
        <div
          className="sidebar-overlay visible"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className={`app-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="app-topbar">
          <button
            className="sidebar-toggle-mobile"
            onClick={() => setMobileSidebarOpen((v) => !v)}
          >
            ☰
          </button>
          <button className="kbd-hint" onClick={() => setCmdPaletteOpen(true)}>
            ⌘K
          </button>
          <div className="topbar-spacer" />
          <div className="topbar-actions">
            <ConnectionStatusIndicator />
            <LanguageSelector />
            <ThemeToggle />
            <button
              className="alert-btn"
              onClick={() => setShowAlerts((v) => !v)}
              aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              🔔
              {unreadCount > 0 && (
                <span className="alert-badge">{unreadCount}</span>
              )}
            </button>
          </div>
        </div>

        {showAlerts && (
          <div className="alert-dropdown">
            <AlertNotifications notifications={alerts} />
          </div>
        )}

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <CommandPalette isOpen={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />
    </div>
  );
}

function App() {
  useEffect(() => {
    const stop = startBackgroundSync();
    setupPushNotifications();
    return stop;
  }, []);

  return (
    <ThemeProvider>
    <ToastProvider>
    <I18nProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
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
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </I18nProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
