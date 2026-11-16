import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LngLat, Stair, StairsResponse } from '@bce/shared';
import { distanceToStair, isPracticeStair } from '@bce/geo';
import { api } from '../services/api';
import { newWaypointId, useAppStore } from '../store/useAppStore';
import { useI18n } from '../i18n';
import { useLocationStart } from './usePlanSharing';

/** Where the list comes from: full OSM data from the API, or the limited map-tile fallback. */
export type StairsMode = 'osm' | 'tiles';

export interface StairsView {
  mode: StairsMode;
  data: StairsResponse | undefined;
  /** The API is still downloading the OSM data (the tile fallback is shown meanwhile). */
  pending: boolean;
  /** Every staircase of the current source (unfiltered, for the map and the counts). */
  all: Stair[];
  /** Filtered and sorted list, with the distance to the sort origin when known. */
  list: Array<{ stair: Stair; distance: number | null }>;
}

/** Loads stairs once the Stairs tab has been opened, then keeps them cached. */
export function useStairsQuery() {
  const opened = useAppStore((s) => s.tab === 'stairs' || s.selectedStairId !== null);
  return useQuery({
    queryKey: ['stairs'],
    queryFn: api.stairs,
    enabled: opened,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    // first server start: Overpass is still downloading → poll until data arrives
    refetchInterval: (q) => {
      const d = q.state.data as StairsResponse | undefined;
      return d && d.stairs.length === 0 && d.meta.refreshing ? 5000 : false;
    },
  });
}

export function useStairs(): StairsView {
  const q = useStairsQuery();
  const tileStairs = useAppStore((s) => s.tileStairs);
  const filters = useAppStore((s) => s.stairFilters);
  const sort = useAppStore((s) => s.stairSort);
  const origin = useAppStore((s) => s.stairOrigin);
  const osm = q.data?.stairs ?? [];
  const mode: StairsMode = osm.length ? 'osm' : 'tiles';
  const all = mode === 'osm' ? osm : tileStairs;

  const list = useMemo(() => {
    const out = all
      .filter((s) => (filters.outdoorOnly ? isPracticeStair(s) : true))
      .filter((s) => (filters.hideNoBicycle ? s.bicycle !== 'no' : true))
      // tiles carry no step count: the minimum applies to OSM data only
      .filter((s) => (mode === 'osm' && filters.minSteps > 0 ? (s.stepCount ?? 0) >= filters.minSteps : true))
      .map((stair) => ({ stair, distance: origin ? distanceToStair(origin.position, stair) : null }));
    if (sort === 'distance' && origin) out.sort((a, b) => a.distance! - b.distance!);
    else out.sort((a, b) => (b.stair.stepCount ?? -1) - (a.stair.stepCount ?? -1) || b.stair.length - a.stair.length);
    return out;
  }, [all, filters, sort, origin, mode]);

  return { mode, data: q.data, pending: !!q.data?.meta.refreshing || q.isLoading, all, list };
}

/** Upper end when OSM says (incline), otherwise the start of the drawn line. */
export const stairTarget = (s: Stair): LngLat => s.top ?? s.lines[0][0];

/** "Plan a route here": the stairs become the destination, the device location the start. */
export function usePlanToStair() {
  const { t } = useI18n();
  const locationStart = useLocationStart();
  const plan = useCallback(
    (s: Stair) => {
      const st = useAppStore.getState();
      st.set({
        tab: 'planner',
        plannerMode: 'auto',
        roundTrip: false,
        waypoints: [
          {
            id: newWaypointId(),
            position: stairTarget(s),
            name: s.name ?? (s.stepCount !== null ? t('stairs.destNameSteps', { count: s.stepCount }) : t('stairs.destName')),
            autoName: false,
          },
        ],
        manualLine: [],
        candidates: [],
        selectedCandidateId: null,
        activeRoute: st.activeRoute?.kind === 'gpx' ? st.activeRoute : null,
        selectedSectionId: null,
        routeDirty: true,
      });
      // the location becomes the start; if it is refused, the user taps a start on the map
      locationStart.start();
    },
    [t, locationStart],
  );
  return { plan, locating: locationStart.locating };
}

/** "42 schodů", "42+ schodů" (some flights uncounted, so the real number is higher), or null. */
export function useStepsLabel() {
  const { t } = useI18n();
  return useCallback(
    (s: Stair) => (s.stepCount === null ? null : t('stairs.steps', { count: s.stepCount }).replace(/^(\d+)/, s.stepCountPartial ? '$1+' : '$1')),
    [t],
  );
}
