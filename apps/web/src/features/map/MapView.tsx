import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap, type MapGeoJSONFeature, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Alert, Box, Button, CircularProgress, Paper, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { CATEGORIES, CATEGORY_ORDER, UNMATCHED_COLOR, categoryLabel, type InfraCategory } from '@bce/shared';
import { useActiveAnalysis, useAppConfig, useInfrastructure } from '../../hooks/data';
import { useAppStore } from '../../store/useAppStore';
import { BRNO_CENTER } from '../../services/geometry';
import { BLANK_STYLE, EMPTY_FC, INFRA_LAYER_IDS, ROUTE_LAYER_IDS, addOverlays, infraLayerId, setSourceData, type OverlayData } from './mapLayers';
import { FeatureInspector } from './FeatureInspector';
import { sectionLabel } from '../../services/osm';
import i18n, { currentLang, useI18n } from '../../i18n';
import { nameWaypoint } from '../../services/waypointNames';
import { SeeThroughButton } from './SeeThroughButton';

type StyleStatus = { status: 'idle' | 'loading' | 'ready' | 'error'; message?: string };

const STYLE_TIMEOUT_MS = 15000;

async function fetchStyle(url: string): Promise<StyleSpecification> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(STYLE_TIMEOUT_MS) });
  } catch (e) {
    const timeout = (e as Error)?.name === 'TimeoutError';
    throw new Error(timeout ? i18n.t('map.styleTimeout') : i18n.t('map.styleBlocked'));
  }
  if (!res.ok) throw new Error(i18n.t('map.styleHttp', { status: res.status }));
  const json = (await res.json().catch(() => null)) as StyleSpecification | null;
  if (!json || json.version !== 8 || !json.sources || !Array.isArray(json.layers)) {
    throw new Error(i18n.t('map.styleInvalid'));
  }
  return json;
}

export function MapView() {
  const { t, lang } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hoverRef = useRef<number | null>(null);
  const tileErrorsRef = useRef({ errors: 0, loaded: 0 });
  const [styleStatus, setStyleStatus] = useState<StyleStatus>({ status: 'idle' });
  const [tileWarning, setTileWarning] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; label: string } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { data: config, error: configError, refetch: refetchConfig } = useAppConfig();
  const { data: infra } = useInfrastructure();
  const analysis = useActiveAnalysis();
  const activeRoute = useAppStore((s) => s.activeRoute);

  const basemapId = useAppStore((s) => s.basemapId);
  const visible = useAppStore((s) => s.visibleCategories);
  const showInfra = useAppStore((s) => s.showInfra);
  const opacity = useAppStore((s) => s.infraOpacity);
  const overlayOpacity = useAppStore((s) => s.overlayOpacity);
  const selectedFeatureId = useAppStore((s) => s.selectedFeatureId);
  const selectedSectionId = useAppStore((s) => s.selectedSectionId);
  const waypoints = useAppStore((s) => s.waypoints);
  const manualLine = useAppStore((s) => s.manualLine);
  const candidates = useAppStore((s) => s.candidates);
  const selectedCandidateId = useAppStore((s) => s.selectedCandidateId);
  const fitRequest = useAppStore((s) => s.fitRequest);
  const tab = useAppStore((s) => s.tab);
  const plannerMode = useAppStore((s) => s.plannerMode);

  const basemap = useMemo(() => {
    if (!config) return null;
    return config.basemaps.find((b) => b.id === basemapId) ?? config.basemaps.find((b) => b.id === config.defaultBasemap) ?? config.basemaps[0];
  }, [config, basemapId]);

  // ---------- overlay data (kept in a ref so it can be re-applied after style changes) ----------
  const overlay = useMemo<OverlayData>(() => {
    const route: GeoJSON.FeatureCollection = analysis
      ? {
          type: 'FeatureCollection',
          features: analysis.sections.map((s) => ({
            type: 'Feature',
            id: s.id,
            properties: { sectionId: s.id, category: s.category ?? 'unmatched', color: s.category ? CATEGORIES[s.category].color : UNMATCHED_COLOR, label: sectionLabel(activeRoute, analysis, s) },
            geometry: { type: 'LineString', coordinates: s.coordinates },
          })),
        }
      : EMPTY_FC;
    const sel = analysis?.sections.find((s) => s.id === selectedSectionId);
    return {
      infra: (infra?.data as unknown as GeoJSON.FeatureCollection) ?? EMPTY_FC,
      route,
      candidates: {
        type: 'FeatureCollection',
        features: candidates
          .filter((c) => c.id !== selectedCandidateId)
          .map((c) => ({ type: 'Feature', properties: { id: c.id }, geometry: { type: 'LineString', coordinates: c.coordinates } })),
      },
      manual: {
        type: 'FeatureCollection',
        features: [
          ...(manualLine.length >= 2 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: manualLine } }] : []),
          ...manualLine.map((c) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: c } })),
        ],
      },
      selectedSection: sel ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: sel.coordinates } }] } : EMPTY_FC,
      routeStart:
        analysis && analysis.sections.length
          ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: analysis.sections[0].coordinates[0] } }] }
          : EMPTY_FC,
    };
  }, [analysis, activeRoute, infra, candidates, selectedCandidateId, manualLine, selectedSectionId, lang]);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  const applyLayerState = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(infraLayerId('separated_path'))) return;
    const s = useAppStore.getState();
    // overlayOpacity (map slider) scales every overlay so roads and their names show through the lines.
    // Dark casings fade faster (k²), otherwise they would hide the roads even at low opacity.
    const k = s.overlayOpacity;
    const infraOpacity = s.infraOpacity * k;
    for (const c of CATEGORY_ORDER) {
      const id = infraLayerId(c);
      map.setLayoutProperty(id, 'visibility', s.showInfra && s.visibleCategories[c] ? 'visible' : 'none');
      map.setPaintProperty(id, 'line-opacity', infraOpacity);
    }
    map.setPaintProperty('bce-route-casing', 'line-opacity', 0.85 * k * k);
    map.setPaintProperty('bce-route-matched', 'line-opacity', k);
    map.setPaintProperty('bce-route-unmatched', 'line-opacity', k);
    map.setPaintProperty('bce-candidates', 'line-opacity', 0.55 * k);
    map.setPaintProperty('bce-route-selected', 'line-opacity', 0.6 * k);
    map.setPaintProperty('bce-route-arrows', 'icon-opacity', Math.max(0.35, k));
    map.setPaintProperty('bce-route-start', 'circle-opacity', Math.max(0.5, k));
    map.setPaintProperty('bce-route-start', 'circle-stroke-opacity', Math.max(0.5, k));
    map.setPaintProperty('bce-infra-selected', 'line-opacity', 0.75 * k);
    const visibleCats = CATEGORY_ORDER.filter((c) => s.showInfra && s.visibleCategories[c] && c !== 'not_infrastructure');
    map.setFilter('bce-infra-casing', ['in', ['get', 'category'], ['literal', visibleCats]]);
    map.setPaintProperty('bce-infra-casing', 'line-opacity', 0.45 * infraOpacity * k);
    map.setFilter('bce-infra-selected', ['==', ['get', 'id'], s.selectedFeatureId ?? -1]);
  }, []);

  // ---------- style loading with timeout / error / retry ----------
  const loadBasemap = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !basemap) return;
    setStyleStatus({ status: 'loading' });
    setTileWarning(false);
    tileErrorsRef.current = { errors: 0, loaded: 0 };
    try {
      const style = await fetchStyle(basemap.url);
      map.setStyle(style, { diff: false });
      map.getContainer().dataset.basemap = basemap.id;
      setStyleStatus({ status: 'ready' });
    } catch (e) {
      setStyleStatus({ status: 'error', message: (e as Error).message });
    }
  }, [basemap]);

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BLANK_STYLE,
      center: BRNO_CENTER,
      zoom: 12.3,
      maxZoom: 19,
      minZoom: 5,
      attributionControl: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 3),
      cooperativeGestures: false,
    });
    mapRef.current = map;
    (window as unknown as { __bceMap?: MlMap }).__bceMap = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: true }),
      'top-right',
    );
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: [
          i18n.t('map.attrCity'),
          i18n.t('map.attrRouting'),
        ],
      }),
      'bottom-right',
    );

    map.on('style.load', () => {
      addOverlays(map, overlayRef.current);
      applyLayerState();
      setMapReady(true);
    });
    map.on('error', (e) => {
      const err = e as unknown as { sourceId?: string; tile?: unknown; error?: { status?: number; message?: string } };
      if (err.sourceId && err.sourceId.startsWith('bce-')) return;
      tileErrorsRef.current.errors++;
      const t = tileErrorsRef.current;
      if (t.errors >= 6 && t.errors > t.loaded) setTileWarning(true);
    });
    map.on('data', (e) => {
      const ev = e as unknown as { dataType?: string; tile?: unknown; sourceId?: string };
      if (ev.dataType === 'source' && ev.tile && !ev.sourceId?.startsWith('bce-')) tileErrorsRef.current.loaded++;
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [applyLayerState]);

  useEffect(() => {
    if (basemap) loadBasemap();
  }, [basemap, loadBasemap]);

  // ---------- sync overlay data ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource('bce-infra')) return;
    setSourceData(map, 'bce-infra', overlay.infra);
  }, [overlay.infra, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource('bce-route')) return;
    setSourceData(map, 'bce-route', overlay.route);
    setSourceData(map, 'bce-candidates', overlay.candidates);
    setSourceData(map, 'bce-manual', overlay.manual);
    setSourceData(map, 'bce-selected-section', overlay.selectedSection);
    setSourceData(map, 'bce-route-start', overlay.routeStart);
  }, [overlay.route, overlay.candidates, overlay.manual, overlay.selectedSection, overlay.routeStart, mapReady]);

  useEffect(applyLayerState, [visible, showInfra, opacity, overlayOpacity, selectedFeatureId, mapReady, applyLayerState]);

  // ---------- waypoint markers (draggable) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = waypoints.map((w, i) => {
      const el = document.createElement('div');
      const isStart = i === 0;
      const isEnd = i === waypoints.length - 1 && waypoints.length > 1;
      el.className = 'bce-waypoint';
      el.style.background = isStart ? '#16a34a' : isEnd ? '#dc2626' : '#0ea5e9';
      el.textContent = isStart ? i18n.t('wp.start') : isEnd ? i18n.t('wp.end') : String(i);
      el.title = i18n.t('map.waypointTitle', { name: w.name });
      el.setAttribute('aria-label', i18n.t('map.waypointAria', { name: w.name }));
      const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(w.position).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        useAppStore.getState().moveWaypoint(w.id, [Number(p.lng.toFixed(6)), Number(p.lat.toFixed(6))]);
        void nameWaypoint(w.id);
      });
      return marker;
    });
  }, [waypoints, lang]);

  // ---------- fit bounds ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitRequest) return;
    const [a, b, c, d] = fitRequest.bounds;
    const mobile = window.innerWidth < 900;
    map.fitBounds(
      [
        [a, b],
        [c, d],
      ],
      { padding: mobile ? { top: 70, bottom: window.innerHeight * 0.45, left: 30, right: 30 } : 60, maxZoom: 16, duration: 700 },
    );
  }, [fitRequest]);

  // ---------- interactions ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const queryLayers = (layers: string[]) => layers.filter((l) => map.getLayer(l));

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const s = useAppStore.getState();
      if (s.tab === 'planner') {
        const p: [number, number] = [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))];
        if (s.plannerMode === 'auto') {
          s.addWaypoint(p);
          const added = useAppStore.getState().waypoints.at(-1);
          if (added) void nameWaypoint(added.id);
        }
        else s.set({ manualLine: [...s.manualLine, p] });
        return;
      }
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ];
      const route = map.queryRenderedFeatures(box, { layers: queryLayers(ROUTE_LAYER_IDS) });
      if (route.length) {
        s.set({ selectedSectionId: Number(route[0].properties.sectionId), analysisOpen: true });
        return;
      }
      const feats = map.queryRenderedFeatures(box, { layers: queryLayers(INFRA_LAYER_IDS) });
      s.set({ selectedFeatureId: feats.length ? Number(feats[0].properties.id) : null });
    };

    const setHover = (id: number | null) => {
      if (hoverRef.current === id) return;
      if (hoverRef.current !== null && map.getSource('bce-infra')) map.setFeatureState({ source: 'bce-infra', id: hoverRef.current }, { hover: false });
      hoverRef.current = id;
      if (id !== null && map.getSource('bce-infra')) map.setFeatureState({ source: 'bce-infra', id }, { hover: true });
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const s = useAppStore.getState();
      if (s.tab === 'planner') {
        map.getCanvas().style.cursor = 'crosshair';
        setHover(null);
        setHoverInfo(null);
        return;
      }
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 5, e.point.y - 5],
        [e.point.x + 5, e.point.y + 5],
      ];
      const route = map.queryRenderedFeatures(box, { layers: queryLayers(ROUTE_LAYER_IDS) });
      const feats: MapGeoJSONFeature[] = route.length ? [] : map.queryRenderedFeatures(box, { layers: queryLayers(INFRA_LAYER_IDS) });
      if (route.length) {
        map.getCanvas().style.cursor = 'pointer';
        setHover(null);
        setHoverInfo({ x: e.point.x, y: e.point.y, label: i18n.t('map.hoverRoute', { label: route[0].properties.label }) });
      } else if (feats.length) {
        const f = feats[0];
        map.getCanvas().style.cursor = 'pointer';
        setHover(Number(f.properties.id));
        const cat = f.properties.category as InfraCategory;
        setHoverInfo({ x: e.point.x, y: e.point.y, label: `${CATEGORIES[cat] ? categoryLabel(cat, currentLang()) : cat} · ${f.properties.originalType ?? i18n.t('map.noType')}` });
      } else {
        map.getCanvas().style.cursor = '';
        setHover(null);
        setHoverInfo(null);
      }
    };
    const onLeave = () => {
      setHover(null);
      setHoverInfo(null);
    };
    map.on('click', onClick);
    map.on('mousemove', onMove);
    map.on('mouseout', onLeave);
    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMove);
      map.off('mouseout', onLeave);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = tab === 'planner' ? 'crosshair' : '';
  }, [tab, plannerMode]);

  const showError = styleStatus.status === 'error' || !!configError;
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#dfe4ea' }}>
      <Box ref={containerRef} data-testid="map-container" sx={{ position: 'absolute', inset: 0 }} role="region" aria-label={t('map.region')} />

      {styleStatus.status === 'loading' && (
        <Paper elevation={3} sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', px: 2, py: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
          <CircularProgress size={16} />
          <Typography variant="body2">{t('map.loadingStyle')}</Typography>
        </Paper>
      )}

      {showError && (
        <Box
          role="alert"
          data-testid="basemap-error"
          sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(15,23,36,0.55)', zIndex: 5, p: 2 }}
        >
          <Paper sx={{ p: 3, maxWidth: 440 }}>
            <Typography variant="h6" gutterBottom>
              {t('map.styleFailed')}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {configError ? t('map.configFailed') : styleStatus.message}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {t('map.providerHelp', { name: basemap ? t(`basemap.${basemap.id}`, { defaultValue: basemap.label }) : '–' })}
            </Typography>
            <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => (configError ? refetchConfig() : loadBasemap())}>
              {t('map.retry')}
            </Button>
          </Paper>
        </Box>
      )}

      {tileWarning && !showError && (
        <Alert
          severity="warning"
          sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 4, maxWidth: 'calc(100% - 120px)' }}
          action={
            <Button color="inherit" size="small" onClick={loadBasemap}>
              {t('map.again')}
            </Button>
          }
        >
          {t('map.tilesFailing')}
        </Alert>
      )}

      {hoverInfo && (
        <Box
          sx={{
            position: 'absolute',
            left: hoverInfo.x + 14,
            top: hoverInfo.y + 14,
            pointerEvents: 'none',
            bgcolor: 'rgba(15,23,36,0.92)',
            color: '#e2e8f0',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            fontSize: 12,
            maxWidth: 280,
            zIndex: 3,
          }}
        >
          {hoverInfo.label}
        </Box>
      )}

      {tab === 'planner' && ((plannerMode === 'auto' && waypoints.length === 0) || (plannerMode === 'manual' && manualLine.length === 0)) && (
        <Paper sx={{ position: 'absolute', top: 12, left: 12, px: 1.5, py: 0.75, zIndex: 2, maxWidth: 'calc(100% - 80px)' }} elevation={3} data-testid="planner-hint">
          <Typography variant="caption">
            {plannerMode === 'auto' ? t('map.hintAuto') : t('map.hintManual')}
          </Typography>
        </Paper>
      )}

      <FeatureInspector />
      <SeeThroughButton />
    </Box>
  );
}
