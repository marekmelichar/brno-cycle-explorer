import { currentLang } from '../i18n';

/** Locale for numbers and dates follows the UI language (decimal comma in Czech, point in English). */
const locale = () => (currentLang() === 'en' ? 'en-GB' : 'cs-CZ');
const nf1f = new Map<string, Intl.NumberFormat>();
const nf0f = new Map<string, Intl.NumberFormat>();
const nf1 = {
  format: (n: number) => {
    const l = locale();
    if (!nf1f.has(l)) nf1f.set(l, new Intl.NumberFormat(l, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
    return nf1f.get(l)!.format(n);
  },
};
const nf0 = {
  format: (n: number) => {
    const l = locale();
    if (!nf0f.has(l)) nf0f.set(l, new Intl.NumberFormat(l, { maximumFractionDigits: 0 }));
    return nf0f.get(l)!.format(n);
  },
};

export function fmtDistance(m: number): string {
  if (!Number.isFinite(m)) return '–';
  if (Math.abs(m) >= 1000) return `${nf1.format(m / 1000)} km`;
  return `${nf0.format(m)} m`;
}
export const fmtKm = (m: number) => `${nf1.format(m / 1000)} km`;
export const fmtPct = (x: number) => (currentLang() === 'en' ? `${nf1.format(x * 100)}%` : `${nf1.format(x * 100)} %`);
export const fmtInt = (n: number) => nf0.format(n);
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale(), { dateStyle: 'medium' });
}
export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
