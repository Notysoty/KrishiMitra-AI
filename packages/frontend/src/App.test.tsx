import { render, screen } from '@testing-library/react';
import App from './App';

// Mock all pages to avoid deep dependency trees in routing tests
jest.mock('./pages/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">Login</div>,
}));
jest.mock('./pages/RegisterPage', () => ({
  RegisterPage: () => <div data-testid="register-page">Register</div>,
}));
jest.mock('./pages/ChatPage', () => ({
  ChatPage: () => <div data-testid="chat-page">Chat</div>,
}));
jest.mock('./pages/OnboardingPage', () => ({
  OnboardingPage: () => <div>Onboarding</div>,
}));
jest.mock('./pages/FarmProfilePage', () => ({
  FarmProfilePage: () => <div>FarmProfile</div>,
}));
jest.mock('./pages/MarketIntelligencePage', () => ({
  MarketIntelligencePage: () => <div>Market</div>,
}));
jest.mock('./pages/SustainabilityPage', () => ({
  SustainabilityPage: () => <div>Sustainability</div>,
}));
jest.mock('./pages/TenantAdminPage', () => ({
  TenantAdminPage: () => <div>TenantAdmin</div>,
}));
jest.mock('./pages/PlatformAdminPage', () => ({
  PlatformAdminPage: () => <div>PlatformAdmin</div>,
}));
jest.mock('./pages/AuditLogPage', () => ({
  AuditLogPage: () => <div>AuditLog</div>,
}));
jest.mock('./pages/ContentModerationPage', () => ({
  ContentModerationPage: () => <div>ContentModeration</div>,
}));
jest.mock('./pages/GroupManagementPage', () => ({
  GroupManagementPage: () => <div>GroupManagement</div>,
}));
jest.mock('./pages/AnalyticsPage', () => ({
  AnalyticsPage: () => <div>Analytics</div>,
}));

// Mock alert client to avoid real fetch calls
jest.mock('./services/alertClient', () => ({
  getAlerts: jest.fn().mockResolvedValue([]),
}));

// Mock backgroundSync to avoid side effects
jest.mock('./services/backgroundSync', () => ({
  startBackgroundSync: jest.fn().mockReturnValue(() => {}),
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.removeItem('krishimitra_token');
  });

  it('redirects to /login when not authenticated', () => {
    render(<App />);
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('renders login page at /login route', () => {
    // Without a token, the app always shows login
    render(<App />);
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });
});
