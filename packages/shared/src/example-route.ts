import type { LngLat } from './types';

export interface ExampleWaypoint {
  name: string;
  position: LngLat;
  /** How the position was obtained */
  source: string;
}

/**
 * Example route "Maloměřice → Náplavka → Riviéra → Anthropos → Maloměřice".
 * Positions geocoded with Nominatim (OpenStreetMap) on 2026-11-14, then
 * snapped to the matching street / embankment. These are WAYPOINTS, not a route;
 * the connected route is calculated by the routing engine at runtime.
 */
export const EXAMPLE_ROUTE: { name: string; waypoints: ExampleWaypoint[] } = {
  name: 'Maloměřice → Náplavka → Riviéra → Anthropos → Maloměřice',
  waypoints: [
    { name: 'Karlova, Maloměřice', position: [16.6427732, 49.2104463], source: 'Nominatim: Karlova, Maloměřice (way 4795963)' },
    { name: 'Svitavské nábřeží', position: [16.6311968, 49.2070109], source: 'Nominatim: Svitavské nábřeží, Husovice' },
    { name: 'Komárov', position: [16.624729, 49.1780597], source: 'Nominatim: Komárov (suburb), Brno-jih' },
    { name: 'Rullerovo nábřeží', position: [16.6007935, 49.1850051], source: 'Nominatim: Rullerovo nábřeží, Staré Brno' },
    { name: 'Riviéra', position: [16.5725956, 49.1854306], source: 'Nominatim: Riviéra (koupaliště), Pisárky' },
    { name: 'Anthropos', position: [16.5671639, 49.1921153], source: 'Nominatim: Anthropos, Pisárecká 5' },
    { name: 'Karlova, Maloměřice (návrat)', position: [16.6427732, 49.2104463], source: 'Shodné se startem' },
  ],
};
