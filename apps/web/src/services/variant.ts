import type { TFunction } from 'i18next';
import type { AppConfig, RouteCandidate } from '@bce/shared';

/** Candidate variant label in the UI language (server sends Czech text + a language-neutral code). */
export function variantLabel(c: Pick<RouteCandidate, 'variant' | 'variantCode' | 'alternative'>, t: TFunction): string {
  if (!c.variantCode) return c.variant;
  const base = t(`variants.${c.variantCode.replace('.', '_')}`, { defaultValue: c.variant });
  return c.alternative ? t('variants.alt', { label: base, n: c.alternative }) : base;
}

export const engineLabel = (e: { id: string; label: string }, t: TFunction) => t(`engines.${e.id}`, { defaultValue: e.label });

/** Short description of the enabled engines, e.g. "BRouter (cycling profiles on OSM) · Valhalla (bicycle profile)". */
export function enginesDescription(config: AppConfig | undefined, t: TFunction): string {
  if (!config) return '';
  const ids = config.routing.engines.map((e) => e.id);
  if (!ids.length) return config.routing.description;
  return ids.map((id) => (id === 'brouter' ? t('engines.descBrouter') : id === 'valhalla' ? t('engines.descValhalla') : id)).join(' · ');
}
