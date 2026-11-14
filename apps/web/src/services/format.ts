const nf1 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });

export function fmtDistance(m: number): string {
  if (!Number.isFinite(m)) return '–';
  if (Math.abs(m) >= 1000) return `${nf1.format(m / 1000)} km`;
  return `${nf0.format(m)} m`;
}
export const fmtKm = (m: number) => `${nf1.format(m / 1000)} km`;
export const fmtPct = (x: number) => `${nf1.format(x * 100)} %`;
export const fmtInt = (n: number) => nf0.format(n);
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' });
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('cs-CZ', { dateStyle: 'medium' });
}
export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
