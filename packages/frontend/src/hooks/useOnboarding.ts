import { useState, useCallback } from 'react';

const STORAGE_KEY = 'krishimitra_onboarding_complete';
const TOTAL_STEPS = 5;

export interface UseOnboardingReturn {
  isComplete: boolean;
  currentStep: number;
  totalSteps: number;
  next: () => void;
  back: () => void;
  skip: () => void;
  complete: () => void;
}

function getStoredComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useOnboarding(): UseOnboardingReturn {
  const [isComplete, setIsComplete] = useState(getStoredComplete);
  const [currentStep, setCurrentStep] = useState(1);

  const markComplete = useCallback(() => {
    setIsComplete(true);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch { /* ignore */ }
  }, []);

  const next = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const back = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }, []);

  const skip = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const complete = useCallback(() => {
    markComplete();
  }, [markComplete]);

  return { isComplete, currentStep, totalSteps: TOTAL_STEPS, next, back, skip, complete };
}
