import { useCallback } from 'react';
import { buildGpx, parseGpx, GpxParseError } from '@bce/geo';
import { useAppStore, type ActiveRoute } from '../store/useAppStore';
import { downloadText, linesBounds, safeFileName } from '../services/geometry';
import { useNotify } from '../components/Notifier';

const MAX_GPX_BYTES = 25 * 1024 * 1024;

export function useGpxImport() {
  const notify = useNotify();
  return useCallback(
    async (file: File) => {
      if (file.size > MAX_GPX_BYTES) {
        notify('Soubor je příliš velký (max. 25 MB).', 'error');
        return false;
      }
      if (!/\.gpx$/i.test(file.name) && file.type !== 'application/gpx+xml') {
        notify('Očekáván soubor .gpx.', 'warning');
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
        notify(`Načtena trasa „${route.name}“ (${parsed.stats.validPointCount} bodů).`, 'success');
        return true;
      } catch (e) {
        notify(e instanceof GpxParseError ? `GPX nelze načíst: ${e.message}` : 'Soubor se nepodařilo načíst.', 'error');
        return false;
      }
    },
    [notify],
  );
}

export function useExportGpx() {
  const notify = useNotify();
  return useCallback(() => {
    const s = useAppStore.getState();
    const r = s.activeRoute;
    if (!r) {
      notify('Není co exportovat – nejprve načtěte GPX nebo naplánujte trasu.', 'info');
      return;
    }
    let idx = 0;
    const ele = r.kind === 'gpx' ? r.elevations : null;
    const segments = r.lines.map((l) => l.map(([lon, lat]) => ({ lon, lat, ele: ele ? ele[idx++] ?? null : null })));
    const kindLabel = r.kind === 'calculated' ? `Vypočtená trasa (${r.meta?.variant ?? 'směrovač'}, data OSM)` : r.kind === 'manual' ? 'Ručně nakreslená trasa – nenavigovaná' : 'Importovaná GPX stopa';
    const xml = buildGpx({
      name: r.name,
      description: `${kindLabel}. Exportováno z Brno Cycle Explorer.`,
      segments,
      waypoints: r.kind !== 'gpx' ? s.waypoints.map((w) => ({ name: w.name, lon: w.position[0], lat: w.position[1] })) : undefined,
    });
    downloadText(`${safeFileName(r.name)}.gpx`, xml);
    notify('GPX soubor byl vygenerován.', 'success');
  }, [notify]);
}
