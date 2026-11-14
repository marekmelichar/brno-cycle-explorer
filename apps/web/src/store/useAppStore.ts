import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CATEGORIES,
  CATEGORY_ORDER,
  type InfraCategory,
  type LngLat,
  type RideType,
  type RoutePreference,
  type RouteCandidate,
} from '@bce/shared';
import { DEFAULT_MATCH_OPTIONS, type MatchOptions, type TrackPoint } from '@bce/geo';

export type SidebarTab = 'map' | 'planner' | 'gpx' | 'stats';
export type PlannerMode = 'auto' | 'manual';

export interface Waypoint {
  id: string;
  position: LngLat;
  name: string;
}

/** The route currently analysed and shown on the map. `kind` tells its provenance. */
export interface ActiveRoute {
  kind: 'gpx' | 'calculated' | 'manual';
  name: string;
  lines: LngLat[][];
  /** Elevation per vertex for GPX, or engine samples for calculated routes */
  elevations: Array<number | null> | null;
  meta?: Record<string, string | number>;
}

export interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  kind: ActiveRoute['kind'];
  lines: LngLat[][];
  waypoints: Waypoint[];
}

export interface GpxInfo {
  fileName: string;
  name: string | null;
  segments: TrackPoint[][];
  warnings: string[];
  stats: { rawPointCount: number; validPointCount: number; invalidPointCount: number; segmentCount: number; elevationCoverage: number };
}

interface State {
  tab: SidebarTab;
  basemapId: string | null;
  visibleCategories: Record<InfraCategory, boolean>;
  infraOpacity: number;
  showInfra: boolean;
  selectedFeatureId: number | null;
  hoverFeatureId: number | null;
  matchOptions: MatchOptions;

  gpx: GpxInfo | null;
  activeRoute: ActiveRoute | null;
  selectedSectionId: number | null;
  analysisOpen: boolean;

  plannerMode: PlannerMode;
  waypoints: Waypoint[];
  manualLine: LngLat[];
  roundTrip: boolean;
  rideType: RideType;
  preference: RoutePreference;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  savedRoutes: SavedRoute[];

  fitRequest: { bounds: [number, number, number, number]; at: number } | null;
  settingsOpen: boolean;
  sourcesOpen: boolean;

  set: (p: Partial<State>) => void;
  setTab: (t: SidebarTab) => void;
  toggleCategory: (c: InfraCategory) => void;
  setAllCategories: (v: boolean) => void;
  addWaypoint: (p: LngLat, name?: string) => void;
  moveWaypoint: (id: string, p: LngLat) => void;
  removeWaypoint: (id: string) => void;
  reorderWaypoint: (from: number, to: number) => void;
  clearPlanner: () => void;
  fitTo: (bounds: [number, number, number, number]) => void;
  saveRoute: (r: SavedRoute) => void;
  deleteSavedRoute: (id: string) => void;
  resetSettings: () => void;
}

const defaultVisible = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, CATEGORIES[c].defaultVisible])) as Record<InfraCategory, boolean>;
let wpCounter = 0;
export const newWaypointId = () => `wp-${Date.now().toString(36)}-${wpCounter++}`;

export const useAppStore = create<State>()(
  persist(
    (set) => ({
      tab: 'map',
      basemapId: null,
      visibleCategories: defaultVisible,
      infraOpacity: 0.9,
      showInfra: true,
      selectedFeatureId: null,
      hoverFeatureId: null,
      matchOptions: DEFAULT_MATCH_OPTIONS,
      gpx: null,
      activeRoute: null,
      selectedSectionId: null,
      analysisOpen: true,
      plannerMode: 'auto',
      waypoints: [],
      manualLine: [],
      roundTrip: false,
      rideType: 'ebike',
      preference: 'max_paths',
      candidates: [],
      selectedCandidateId: null,
      savedRoutes: [],
      fitRequest: null,
      settingsOpen: false,
      sourcesOpen: false,

      set: (p) => set(p),
      setTab: (tab) => set({ tab }),
      toggleCategory: (c) => set((s) => ({ visibleCategories: { ...s.visibleCategories, [c]: !s.visibleCategories[c] } })),
      setAllCategories: (v) =>
        set({ visibleCategories: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, c === 'not_infrastructure' ? false : v])) as Record<InfraCategory, boolean> }),
      addWaypoint: (p, name) =>
        set((s) => ({
          waypoints: [...s.waypoints, { id: newWaypointId(), position: p, name: name ?? `Bod ${s.waypoints.length + 1}` }],
          candidates: [],
          selectedCandidateId: null,
        })),
      moveWaypoint: (id, p) =>
        set((s) => ({ waypoints: s.waypoints.map((w) => (w.id === id ? { ...w, position: p } : w)), candidates: [], selectedCandidateId: null })),
      removeWaypoint: (id) => set((s) => ({ waypoints: s.waypoints.filter((w) => w.id !== id), candidates: [], selectedCandidateId: null })),
      reorderWaypoint: (from, to) =>
        set((s) => {
          if (to < 0 || to >= s.waypoints.length) return {};
          const w = [...s.waypoints];
          const [m] = w.splice(from, 1);
          w.splice(to, 0, m);
          return { waypoints: w, candidates: [], selectedCandidateId: null };
        }),
      clearPlanner: () =>
        set((s) => ({
          waypoints: [],
          manualLine: [],
          candidates: [],
          selectedCandidateId: null,
          activeRoute: s.activeRoute && s.activeRoute.kind !== 'gpx' ? null : s.activeRoute,
          selectedSectionId: null,
        })),
      fitTo: (bounds) => set({ fitRequest: { bounds, at: Date.now() } }),
      saveRoute: (r) => set((s) => ({ savedRoutes: [r, ...s.savedRoutes.filter((x) => x.id !== r.id)].slice(0, 10) })),
      deleteSavedRoute: (id) => set((s) => ({ savedRoutes: s.savedRoutes.filter((x) => x.id !== id) })),
      resetSettings: () => set({ matchOptions: DEFAULT_MATCH_OPTIONS, visibleCategories: defaultVisible, infraOpacity: 0.9, showInfra: true }),
    }),
    {
      name: 'bce-settings-v1',
      version: 2,
      // v2 changed the default matching tolerance – drop old matching options, keep the rest
      migrate: (persisted) => ({ ...(persisted as object), matchOptions: undefined }) as unknown as State,
      partialize: (s) => ({
        basemapId: s.basemapId,
        visibleCategories: s.visibleCategories,
        infraOpacity: s.infraOpacity,
        matchOptions: s.matchOptions,
        rideType: s.rideType,
        preference: s.preference,
        savedRoutes: s.savedRoutes,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          visibleCategories: { ...current.visibleCategories, ...(p.visibleCategories ?? {}) },
          matchOptions: { ...current.matchOptions, ...(p.matchOptions ?? {}) },
        };
      },
    },
  ),
);
