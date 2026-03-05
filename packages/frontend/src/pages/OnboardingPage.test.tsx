import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingPage } from './OnboardingPage';

beforeEach(() => localStorage.clear());

test('renders first step with welcome message', () => {
  render(<OnboardingPage />);
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Welcome to KrishiMitra!');
  expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  expect(screen.getByTestId('onboarding-next')).toBeInTheDocument();
  expect(screen.getByTestId('onboarding-skip')).toBeInTheDocument();
});

test('navigates to next step', async () => {
  const user = userEvent.setup();
  render(<OnboardingPage />);
  await user.click(screen.getByTestId('onboarding-next'));
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Farm Profile');
  expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
});

test('navigates back', async () => {
  const user = userEvent.setup();
  render(<OnboardingPage />);
  await user.click(screen.getByTestId('onboarding-next'));
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Farm Profile');
  await user.click(screen.getByTestId('onboarding-back'));
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Welcome to KrishiMitra!');
});

test('shows all steps in sequence', async () => {
  const user = userEvent.setup();
  render(<OnboardingPage />);
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Welcome to KrishiMitra!');
  await user.click(screen.getByTestId('onboarding-next'));
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Farm Profile');
  await user.click(screen.getByTestId('onboarding-next'));
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('AI Assistant');
  await user.click(screen.getByTestId('onboarding-next'));
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Market Intelligence');
  await user.click(screen.getByTestId('onboarding-next'));
  expect(screen.getByTestId('onboarding-title')).toHaveTextContent("You're all set!");
});

test('shows Get Started button on last step', async () => {
  const user = userEvent.setup();
  render(<OnboardingPage />);
  // Navigate to last step
  for (let i = 0; i < 4; i++) {
    await user.click(screen.getByTestId('onboarding-next'));
  }
  expect(screen.getByTestId('onboarding-complete')).toHaveTextContent('Get Started');
  expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument();
  expect(screen.queryByTestId('onboarding-skip')).not.toBeInTheDocument();
});

test('completes onboarding and stores in localStorage', async () => {
  const user = userEvent.setup();
  render(<OnboardingPage />);
  for (let i = 0; i < 4; i++) {
    await user.click(screen.getByTestId('onboarding-next'));
  }
  await user.click(screen.getByTestId('onboarding-complete'));
  expect(localStorage.getItem('krishimitra_onboarding_complete')).toBe('true');
});

test('skip stores completion in localStorage', async () => {
  const user = userEvent.setup();
  render(<OnboardingPage />);
  await user.click(screen.getByTestId('onboarding-skip'));
  expect(localStorage.getItem('krishimitra_onboarding_complete')).toBe('true');
});

test('back button not shown on first step', () => {
  render(<OnboardingPage />);
  expect(screen.queryByTestId('onboarding-back')).not.toBeInTheDocument();
});
