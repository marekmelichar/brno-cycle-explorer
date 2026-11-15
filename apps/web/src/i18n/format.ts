import type { TFunction } from 'i18next';
import { categoryLabel, type DataWarning, type Lang } from '@bce/shared';
import type { GpxWarning, PieceReason, QualityNote, RejectReason, ElevationStats } from '@bce/geo';

const n0 = (v: number) => v.toFixed(0);
const n1 = (v: number) => v.toFixed(1);

export function rejectText(r: RejectReason, t: TFunction): string {
  switch (r.code) {
    case 'distance':
      return t('reject.distance', { v: n1(r.value), limit: r.limit });
    case 'diverging':
      return t('reject.diverging', { v: n1(r.value) });
    case 'angle':
      return t('reject.angle', { v: n0(r.value) });
    case 'overlap':
      return t('reject.overlap', { v: n0(r.value * 100) });
  }
}

/** Human explanation of why a route piece got its classification. */
export function reasonText(r: PieceReason, t: TFunction, lang: Lang): string {
  switch (r.code) {
    case 'matched':
      return (
        t('reason.matched', { id: r.featureId, d: n1(r.distance), a: n0(r.angle), o: n0(r.overlap * 100) }) +
        (r.ambiguousWith ? t('reason.ambiguous', { cat: categoryLabel(r.ambiguousWith.category, lang), id: r.ambiguousWith.featureId }) : '')
      );
    case 'outside':
      return t('reason.outside');
    case 'none_nearby':
      return t('reason.noneNearby', { tol: r.tolerance });
    case 'rejected':
      return t('reason.rejected', { why: rejectText(r.reject, t) });
    case 'short_run':
      return t('reason.shortRun', { len: n0(r.length), min: r.min, cat: categoryLabel(r.category, lang) }) + reasonText(r.prior, t, lang);
    case 'gap':
      return t('reason.gap', { len: n0(r.length) }) + reasonText(r.prior, t, lang);
  }
}

export function noteText(n: QualityNote, t: TFunction): string {
  switch (n.code) {
    case 'sparse':
      return t('note.sparse', { v: n0(n.spacing) });
    case 'outside':
    case 'ambiguous':
      return t(`note.${n.code}`, { v: n0(n.share * 100) });
    default:
      return t(`note.${n.code}`);
  }
}

export const qualityText = (level: string, t: TFunction) => t(`quality.${level}`, { defaultValue: level });

export function elevationReasonText(r: ElevationStats['reason'], t: TFunction): string {
  if (!r) return '';
  return r.code === 'coverage' ? t('elev.coverage', { v: n0(r.share * 100) }) : t('elev.range');
}

export function gpxWarningText(w: GpxWarning, t: TFunction): string {
  return w.code === 'invalid_points' ? t('gpxWarn.invalid_points', { count: w.count }) : t(`gpxWarn.${w.code}`);
}

/** Data-source warnings; plain strings come from caches written before 15 Nov 2026 (Czech). */
export function dataWarningText(w: DataWarning | string, t: TFunction): string {
  if (typeof w === 'string') return w;
  switch (w.code) {
    case 'missing_fields':
      return t('dataWarn.missing_fields', { fields: w.fields.join(', ') });
    case 'skipped_no_geometry':
      return t('dataWarn.skipped_no_geometry', { count: w.count });
    case 'unexpected_geometry':
      return t('dataWarn.unexpected_geometry', { type: w.type });
    case 'partial':
      return t('dataWarn.partial', { received: w.received, expected: w.expected });
    default:
      return t(`dataWarn.${w.code}`);
  }
}
