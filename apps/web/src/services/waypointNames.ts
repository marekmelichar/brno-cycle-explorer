import { api } from './api';
import { useAppStore } from '../store/useAppStore';

/**
 * Names a user-placed route point after the nearest street (Nominatim reverse, via our API).
 * Runs only on explicit user action (placing or moving a point) and never overwrites a name the
 * user typed. Failures are silent: the point keeps "Bod N".
 */
export async function nameWaypoint(id: string): Promise<void> {
  const wp = useAppStore.getState().waypoints.find((w) => w.id === id);
  if (!wp || wp.autoName === false) return;
  const [lon, lat] = wp.position;
  try {
    const { label } = await api.reverseGeocode(lat, lon);
    if (!label) return;
    const st = useAppStore.getState();
    const cur = st.waypoints.find((w) => w.id === id);
    // still the same point, at the same place, still automatically named?
    if (!cur || cur.autoName === false || cur.position[0] !== lon || cur.position[1] !== lat) return;
    st.set({ waypoints: st.waypoints.map((w) => (w.id === id ? { ...w, name: label } : w)) });
  } catch {
    // keep the automatic name
  }
}
