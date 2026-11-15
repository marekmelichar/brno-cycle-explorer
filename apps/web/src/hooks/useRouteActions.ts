import { useCallback } from 'react';
import { buildGpx, parseGpx, GpxParseError } from '@bce/geo';
import { useAppStore, type ActiveRoute } from '../store/useAppStore';
import { downloadText, linesBounds, safeFileName } from '../services/geometry';
import { useNotify } from '../components/Notifier';
import { useI18n } from '../i18n';

const MAX_GPX_BYTES = 25 * 1024 * 1024;

export function useGpxImport() {
  const notify = useNotify();
  const { t } = useI18n();
  return useCallback(
    async (file: File) => {
      if (file.size > MAX_GPX_BYTES) {
        notify(t('gpx.tooBig'), 'error');
        return false;
      }
      if (!/\.gpx$/i.test(file.name) && file.type !== 'application/gpx+xml') {
        notify(t('gpx.expectGpx'), 'warning');
      }
      try {
        const text = await file.text();
        const parsed = parseGpx(text);
        const lines = parsed.segments.map((s) => s.map((p) => [p.lon, p.lat] as [number, number]));
        const route: ActiveRoute = {
          kind: 'gpx',
          name: parsed.name ?? file.name.replace(/\.gpx$/i, ''),
          lines,
          elevations: parsed.segments.flat().map((p) => p.ele),
        };
        const s = useAppStore.getState();
        s.set({
          gpx: { fileName: file.name, name: parsed.name, segments: parsed.segments, warnings: parsed.warnings, stats: parsed.stats },
          activeRoute: route,
          selectedSectionId: null,
          analysisOpen: true,
          tab: 'gpx',
        });
        const b = linesBounds(lines);
        if (b) s.fitTo(b);
        notify(t('gpx.loaded', { name: route.name, count: parsed.stats.validPointCount }), 'success');
        return true;
      } catch (e) {
        notify(e instanceof GpxParseError ? t('gpx.cannotLoad', { reason: t(`gpx.err.${e.code}`) }) : t('gpx.readFailed'), 'error');
        return false;
      }
    },
    [notify],
  );
}

export function useExportGpx() {
  const notify = useNotify();
  const { t } = useI18n();
  return useCallback(() => {
    const s = useAppStore.getState();
    const r = s.activeRoute;
    if (!r) {
      notify(t('export.nothing'), 'info');
      return;
    }
    let idx = 0;
    const ele = r.kind === 'gpx' ? r.elevations : null;
    const segments = r.lines.map((l) => l.map(([lon, lat]) => ({ lon, lat, ele: ele ? ele[idx++] ?? null : null })));
    const kindLabel = r.kind === 'calculated' ? t('export.calculated', { variant: r.meta?.variant ?? t('export.router') }) : r.kind === 'manual' ? t('export.manual') : t('export.gpx');
    const xml = buildGpx({
      name: r.name,
      description: t('export.desc', { kind: kindLabel }),
      segments,
      waypoints: r.kind !== 'gpx' ? s.waypoints.map((w) => ({ name: w.name, lon: w.position[0], lat: w.position[1] })) : undefined,
    });
    downloadText(`${safeFileName(r.name)}.gpx`, xml);
    notify(t('export.done'), 'success');
  }, [notify, t]);
}
