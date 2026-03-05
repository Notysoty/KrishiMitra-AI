import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { LanguageSelector } from './LanguageSelector';

beforeEach(() => localStorage.clear());

function renderWithProvider() {
  return render(
    <I18nProvider>
      <LanguageSelector />
    </I18nProvider>
  );
}

test('renders language selector with all languages', () => {
  renderWithProvider();
  const select = screen.getByLabelText('Select Language');
  expect(select).toBeInTheDocument();
  expect(screen.getByText('English')).toBeInTheDocument();
  expect(screen.getByText('हिन्दी')).toBeInTheDocument();
  expect(screen.getByText('தமிழ்')).toBeInTheDocument();
  expect(screen.getByText('తెలుగు')).toBeInTheDocument();
  expect(screen.getByText('ಕನ್ನಡ')).toBeInTheDocument();
});

test('defaults to English', () => {
  renderWithProvider();
  const select = screen.getByLabelText('Select Language') as HTMLSelectElement;
  expect(select.value).toBe('en');
});

test('changes language on selection', async () => {
  const user = userEvent.setup();
  renderWithProvider();
  const select = screen.getByLabelText('Select Language');
  await user.selectOptions(select, 'hi');
  expect((select as HTMLSelectElement).value).toBe('hi');
  expect(localStorage.getItem('krishimitra_language')).toBe('hi');
});
