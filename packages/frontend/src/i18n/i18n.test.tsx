import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useTranslation, useLanguage, Language } from './index';

beforeEach(() => localStorage.clear());

function TranslationDisplay() {
  const { t, language } = useTranslation();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="text">{t('login')}</span>
    </div>
  );
}

function LanguageSwitcher() {
  const { setLanguage, supportedLanguages } = useLanguage();
  return (
    <div>
      {supportedLanguages.map((l) => (
        <button key={l.code} onClick={() => setLanguage(l.code)}>
          {l.nativeName}
        </button>
      ))}
    </div>
  );
}

function TestApp() {
  return (
    <I18nProvider>
      <TranslationDisplay />
      <LanguageSwitcher />
    </I18nProvider>
  );
}

test('defaults to English', () => {
  render(<TestApp />);
  expect(screen.getByTestId('lang')).toHaveTextContent('en');
  expect(screen.getByTestId('text')).toHaveTextContent('Login');
});

test('switches to Hindi', async () => {
  const user = userEvent.setup();
  render(<TestApp />);
  await user.click(screen.getByText('हिन्दी'));
  expect(screen.getByTestId('lang')).toHaveTextContent('hi');
  expect(screen.getByTestId('text')).toHaveTextContent('लॉगिन');
});

test('switches to Tamil', async () => {
  const user = userEvent.setup();
  render(<TestApp />);
  await user.click(screen.getByText('தமிழ்'));
  expect(screen.getByTestId('lang')).toHaveTextContent('ta');
  expect(screen.getByTestId('text')).toHaveTextContent('உள்நுழைவு');
});

test('switches to Telugu', async () => {
  const user = userEvent.setup();
  render(<TestApp />);
  await user.click(screen.getByText('తెలుగు'));
  expect(screen.getByTestId('lang')).toHaveTextContent('te');
});

test('switches to Kannada', async () => {
  const user = userEvent.setup();
  render(<TestApp />);
  await user.click(screen.getByText('ಕನ್ನಡ'));
  expect(screen.getByTestId('lang')).toHaveTextContent('kn');
});

test('persists language to localStorage', async () => {
  const user = userEvent.setup();
  render(<TestApp />);
  await user.click(screen.getByText('हिन्दी'));
  expect(localStorage.getItem('krishimitra_language')).toBe('hi');
});

test('restores language from localStorage', () => {
  localStorage.setItem('krishimitra_language', 'ta');
  render(<TestApp />);
  expect(screen.getByTestId('lang')).toHaveTextContent('ta');
});

test('useTranslation throws outside provider', () => {
  function Bad() { useTranslation(); return null; }
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<Bad />)).toThrow('useTranslation must be used within I18nProvider');
  spy.mockRestore();
});

test('useLanguage throws outside provider', () => {
  function Bad() { useLanguage(); return null; }
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<Bad />)).toThrow('useLanguage must be used within I18nProvider');
  spy.mockRestore();
});
