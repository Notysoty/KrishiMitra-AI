import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../hooks/useOnboarding';
import { useTranslation } from '../i18n';

const STEPS = [
  {
    title: 'Welcome to KrishiMitra!',
    description: 'Your AI-powered agricultural assistant. Let us show you around.',
    icon: '🌾',
  },
  {
    title: 'Farm Profile',
    description: 'Set up your farm details including location, crops, soil type, and irrigation. This helps us give you personalized recommendations.',
    icon: '🏡',
  },
  {
    title: 'AI Assistant',
    description: 'Ask questions about farming, get disease diagnosis from crop photos, and receive tailored advice in your language.',
    icon: '🤖',
  },
  {
    title: 'Market Intelligence',
    description: 'Track market prices, get price forecasts, and find the best time to sell your produce.',
    icon: '📊',
  },
  {
    title: "You're all set!",
    description: 'Great job completing the tour! You can always revisit this guide from Settings. Happy farming!',
    icon: '🎉',
  },
];

const WelcomePreview: React.FC = () => (
  <div className="onboarding-preview" style={{ flexDirection: 'column', gap: '12px' }}>
    <div style={{ fontSize: '2.5rem', animation: 'celebration 2s ease infinite' }}>🌱</div>
    <div style={{ display: 'flex', gap: '8px', fontSize: '1.5rem' }}>
      <span>☀️</span>
      <span>🌿</span>
      <span>💧</span>
    </div>
  </div>
);

const FarmProfilePreview: React.FC = () => (
  <div className="onboarding-preview" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', textAlign: 'left' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
      <span>📍 Location</span>
      <span style={{ color: 'var(--gray-700)' }}>Karnataka, India</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
      <span>🌾 Crops</span>
      <span style={{ color: 'var(--gray-700)' }}>Rice, Wheat</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
      <span>🏗️ Soil Type</span>
      <span style={{ color: 'var(--gray-700)' }}>Alluvial</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
      <span>💧 Irrigation</span>
      <span style={{ color: 'var(--gray-700)' }}>Drip</span>
    </div>
  </div>
);

const ChatPreview: React.FC = () => (
  <div className="onboarding-preview" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
    <div className="mini-chat-bubble user" style={{ alignSelf: 'flex-end' }}>
      My tomato leaves are turning yellow 🍅
    </div>
    <div className="mini-chat-bubble ai" style={{ alignSelf: 'flex-start' }}>
      This could be nitrogen deficiency. Try adding compost or a balanced fertilizer 🌿
    </div>
  </div>
);

const MarketPreview: React.FC = () => (
  <div className="onboarding-preview" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '50px', justifyContent: 'center' }}>
      {[30, 45, 35, 55, 50, 65, 60].map((h, i) => (
        <div
          key={i}
          style={{
            width: '20px',
            height: `${h}px`,
            background: `var(--primary${i === 6 ? '' : '-light'})`,
            borderRadius: '4px 4px 0 0',
            transition: 'height 0.3s ease',
          }}
        />
      ))}
    </div>
    <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', textAlign: 'center' }}>
      Price trends &bull; Forecasts &bull; Best sell time
    </div>
  </div>
);

const CelebrationPreview: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => (
  <div className="onboarding-preview" style={{ flexDirection: 'column', gap: '12px' }}>
    <div style={{ fontSize: '2.5rem' }} className="celebration-icon">🎉</div>
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => onNavigate?.('/chat')}
        type="button"
      >
        💬 Go to Chat
      </button>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => onNavigate?.('/farm-profile')}
        type="button"
      >
        🏡 Farm Profile
      </button>
    </div>
  </div>
);

const STEP_PREVIEWS = [
  WelcomePreview,
  FarmProfilePreview,
  ChatPreview,
  MarketPreview,
  CelebrationPreview,
];

export const OnboardingPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentStep, totalSteps, next, back, skip, complete } = useOnboarding();
  const step = STEPS[currentStep - 1];
  const isLast = currentStep === totalSteps;
  const progressPercent = (currentStep / totalSteps) * 100;
  const PreviewComponent = STEP_PREVIEWS[currentStep - 1];

  const handleComplete = () => { complete(); navigate('/dashboard'); };
  const handleSkip = () => { skip(); navigate('/dashboard'); };

  return (
    <div data-testid="onboarding-page" className="onboarding-page">
      <div className="onboarding-card fade-in">
        <div className="onboarding-progress-bar">
          <div
            className="onboarding-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="step-transition" key={currentStep}>
          <span className={`onboarding-icon${isLast ? ' celebration-icon' : ''}`}>{step.icon}</span>
          <h2 data-testid="onboarding-title">{step.title}</h2>
          <p data-testid="onboarding-description">{step.description}</p>
          <PreviewComponent />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginBottom: '16px' }}>
          {t('step')} {currentStep} {t('of')} {totalSteps}
        </div>
        <div className="onboarding-progress">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`onboarding-dot${i + 1 === currentStep ? ' active' : ''}`}
            />
          ))}
        </div>
        <div className="onboarding-actions">
          {currentStep > 1 && !isLast && (
            <button onClick={back} type="button" data-testid="onboarding-back" className="btn btn-secondary">{t('back')}</button>
          )}
          {!isLast && (
            <button onClick={next} type="button" data-testid="onboarding-next" className="btn btn-primary">{t('next')}</button>
          )}
          {isLast && (
            <button onClick={handleComplete} type="button" data-testid="onboarding-complete" className="btn btn-primary btn-lg">{t('getStarted')}</button>
          )}
          {!isLast && (
            <button onClick={handleSkip} type="button" data-testid="onboarding-skip" className="btn btn-ghost">{t('skip')}</button>
          )}
        </div>
      </div>
    </div>
  );
};
