import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeSharedPlan, encodeSharedPlan, stripSharedPlan, type LngLat } from '@bce/shared';
import { newWaypointId, useAppStore } from '../store/useAppStore';
import { useNotify } from '../components/Notifier';
import i18n, { useI18n } from '../i18n';
import { linesBounds } from '../services/geometry';
import { nameWaypoint } from '../services/waypointNames';

/** True when the planner holds a plan that can be calculated (and therefore shared). */
export function useCanSharePlan(): boolean {
  return useAppStore((s) => s.plannerMode === 'auto' && (s.waypoints.length >= 2 || (s.roundTrip && s.waypoints.length === 1)));
}

/** Placeholder names ("Bod 2", "Moje poloha" before the street is known) are not worth sharing. */
function isPlaceholderName(w: { name: string; autoName?: boolean }): boolean {
  if (w.autoName === false) return false;
  return /^Bod \d+$/.test(w.name) || ['cs', 'en'].some((lng) => w.name === i18n.t('planner.myLocation', { lng }));
}

/** Link to the current planner plan (points + options). The geometry is recalculated by the recipient. */
export function currentPlanUrl(): string {
  const s = useAppStore.getState();
  const query = encodeSharedPlan({
    // placeholders are not sent: the recipient looks up the street name instead
    waypoints: s.waypoints.map((w) => ({ position: w.position, name: isPlaceholderName(w) ? null : w.name })),
    rideType: s.rideType,
    preference: s.preference,
    engine: s.engine ?? undefined,
    roundTrip: s.roundTrip,
    targetKm: s.targetKm,
  });
  return `${window.location.origin}${window.location.pathname}?${query}`;
}

/** Shares the plan: the native share sheet on touch devices, otherwise copies the link. */
export function useSharePlan() {
  const { t } = useI18n();
  const notify = useNotify();
  return useCallback(async () => {
    const url = currentPlanUrl();
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('planner.shareTitle'), url });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return; // the user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      notify(t('planner.shareCopied'), 'success');
    } catch {
      // no clipboard permission (e.g. insecure context): let the user copy it by hand
      window.prompt(t('planner.shareManual'), url);
    }
  }, [t, notify]);
}

/**
 * On start-up, loads a plan from a shared link (?wp=…) into the planner, then removes the
 * parameters from the address bar so a reload or later edits do not re-import it.
 * The planner recalculates the route automatically (routeDirty).
 */
export function useSharedPlanImport() {
  const { t } = useI18n();
  const notify = useNotify();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const plan = decodeSharedPlan(window.location.search);
    if (!plan) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${stripSharedPlan(window.location.search)}${window.location.hash}`);
    const waypoints = plan.waypoints.map((w, i) => ({
      id: newWaypointId(),
      position: w.position,
      name: w.name ?? `Bod ${i + 1}`,
      autoName: w.name === null,
    }));
    const st = useAppStore.getState();
    st.set({
      tab: 'planner',
      plannerMode: 'auto',
      waypoints,
      manualLine: [],
      roundTrip: plan.roundTrip,
      ...(plan.rideType ? { rideType: plan.rideType } : {}),
      ...(plan.preference ? { preference: plan.preference } : {}),
      ...(plan.engine ? { engine: plan.engine } : {}),
      ...(plan.targetKm ? { targetKm: plan.targetKm } : {}),
      candidates: [],
      selectedCandidateId: null,
      activeRoute: st.activeRoute?.kind === 'gpx' ? st.activeRoute : null,
      selectedSectionId: null,
      routeDirty: true,
    });
    const b = linesBounds([waypoints.map((w) => w.position)]);
    if (b) st.fitTo(b);
    for (const w of waypoints) if (w.autoName) void nameWaypoint(w.id);
    notify(plan.roundTrip && waypoints.length === 1 ? t('planner.sharedLoadedLoop') : t('planner.sharedLoaded', { n: waypoints.length }), 'info');
  }, [t, notify]);
}

const GEO_ERRORS: Record<number, string> = { 1: 'planner.geoDenied', 2: 'planner.geoUnavailable', 3: 'planner.geoTimeout' };

/** "Start from my location": asks the browser for the position and makes it the route start. */
export function useLocationStart() {
  const { t } = useI18n();
  const notify = useNotify();
  const [locating, setLocating] = useState(false);
  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      notify(t('planner.geoUnsupported'), 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p: LngLat = [Number(pos.coords.longitude.toFixed(6)), Number(pos.coords.latitude.toFixed(6))];
        const st = useAppStore.getState();
        if (st.plannerMode !== 'auto') st.set({ plannerMode: 'auto' });
        const id = st.setLocationStart(p, t('planner.myLocation'));
        const wps = useAppStore.getState().waypoints;
        const b = linesBounds([wps.map((w) => w.position)]);
        if (b) st.fitTo(b);
        void nameWaypoint(id);
      },
      (err) => {
        setLocating(false);
        notify(t(GEO_ERRORS[err.code] ?? 'planner.geoUnavailable'), err.code === 1 ? 'error' : 'warning');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, [t, notify]);
  return { locating, start };
}
