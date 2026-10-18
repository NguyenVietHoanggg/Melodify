import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import vi from './vi';

export type Lang = 'vi' | 'en';
const STORAGE_KEY = 'melodify.lang';

function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {
    // storage blocked: fall through
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'vi';
}

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'vi',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

export function setLanguage(lang: Lang) {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

document.documentElement.lang = i18n.language;
export const currentLang = (): Lang => (i18n.language === 'en' ? 'en' : 'vi');
export default i18n;
