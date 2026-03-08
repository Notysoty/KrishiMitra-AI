import { createContext, useContext, useState, useCallback, ReactNode, createElement } from 'react';
import en from './translations/en';
import hi from './translations/hi';
import ta from './translations/ta';
import te from './translations/te';
import kn from './translations/kn';
import mr from './translations/mr';

export type Language = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'mr';
export type TranslationKeys = keyof typeof en;
export type Translations = Record<TranslationKeys, string>;

export const SUPPORTED_LANGUAGES: { code: Language; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
];

const translationsMap: Record<Language, Translations> = { en, hi, mr, ta, te, kn };

const STORAGE_KEY = 'krishimitra_language';

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in translationsMap) return stored as Language;
  } catch { /* ignore */ }
  return 'en';
}

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKeys) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: TranslationKeys): string => {
    return translationsMap[language][key] || translationsMap.en[key] || key;
  }, [language]);

  return createElement(I18nContext.Provider, { value: { language, setLanguage, t } }, children);
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return { t: ctx.t, language: ctx.language };
}

export function useLanguage() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useLanguage must be used within I18nProvider');
  return { language: ctx.language, setLanguage: ctx.setLanguage, supportedLanguages: SUPPORTED_LANGUAGES };
}
