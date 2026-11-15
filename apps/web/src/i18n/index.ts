import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { Lang } from '@bce/shared';
import { cs } from './cs';
import { en } from './en';

const STORAGE_KEY = 'bce-lang';

/** Saved choice, else Czech for Czech/Slovak browsers, else English. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'cs' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []).join(',').toLowerCase();
  return /\b(cs|sk)\b/.test(nav) || nav.startsWith('cs') || nav.startsWith('sk') ? 'cs' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { cs: { translation: cs }, en: { translation: en } },
  lng: detectLang(),
  fallbackLng: 'cs',
  interpolation: { escapeValue: false },
  returnNull: false,
});

const applyHtmlLang = (l: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = l;
};
applyHtmlLang(i18n.language);
i18n.on('languageChanged', (l) => {
  applyHtmlLang(l);
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
});

export const currentLang = (): Lang => (i18n.language === 'en' ? 'en' : 'cs');
export const setLang = (l: Lang) => void i18n.changeLanguage(l);

/** t + the active language (for helpers that take a Lang). */
export function useI18n() {
  const { t, i18n: inst } = useTranslation();
  const lang: Lang = inst.language === 'en' ? 'en' : 'cs';
  return { t, lang };
}

export default i18n;
