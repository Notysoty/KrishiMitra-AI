import React from 'react';
import { useLanguage, Language } from '../i18n';

export function LanguageSelector() {
  const { language, setLanguage, supportedLanguages } = useLanguage();

  return (
    <select
      aria-label="Select Language"
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
      className="lang-select-light"
    >
      {supportedLanguages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeName}
        </option>
      ))}
    </select>
  );
}
