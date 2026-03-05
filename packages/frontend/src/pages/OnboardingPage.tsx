import React from 'react';
import { useOnboarding } from '../hooks/useOnboarding';

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

export const OnboardingPage: React.FC = () => {
  const { currentStep, totalSteps, next, back, skip, complete } = useOnboarding();
  const step = STEPS[currentStep - 1];
  const isLast = currentStep === totalSteps;

  return (
    <div data-testid="onboarding-page" style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>{step.icon}</div>
      <h2 data-testid="onboarding-title">{step.title}</h2>
      <p data-testid="onboarding-description">{step.description}</p>
      <div style={{ margin: '16px 0', fontSize: 14, color: '#666' }}>
        Step {currentStep} of {totalSteps}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        {currentStep > 1 && !isLast && (
          <button onClick={back} type="button" data-testid="onboarding-back">Back</button>
        )}
        {!isLast && (
          <button onClick={next} type="button" data-testid="onboarding-next">Next</button>
        )}
        {isLast && (
          <button onClick={complete} type="button" data-testid="onboarding-complete">Get Started</button>
        )}
        {!isLast && (
          <button onClick={skip} type="button" data-testid="onboarding-skip" style={{ opacity: 0.7 }}>Skip</button>
        )}
      </div>
    </div>
  );
};
