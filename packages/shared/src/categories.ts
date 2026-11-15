/**
 * Normalization of municipal `typ_opatreni` values into infrastructure classes.
 *
 * The mapping table below was built from the DISTINCT values actually returned by the
 * official Brno FeatureServer (cykloopatreni_realizovana_opendata, layer 0) on 2026-11-14.
 * See docs/NORMALIZATION.md for the full justification of each row.
 *
 * Any value not present in this table is classified as `unknown` (Neznámý typ) –
 * we never guess.
 */

export type InfraCategory =
  | 'separated_path'
  | 'shared_path'
  | 'reserved_lane'
  | 'protective_lane'
  | 'contraflow'
  | 'pictogram'
  | 'no_motor_traffic'
  | 'other'
  | 'unknown'
  | 'not_infrastructure';

/** Aggregated groups used in route statistics (spec section 7). */
export type RouteGroup = 'dedicated' | 'shared' | 'lane' | 'other' | 'unclassified';

export type Lang = 'cs' | 'en';

export interface CategoryInfo {
  id: InfraCategory;
  /** Czech label / description (default UI language) */
  label: string;
  description: string;
  /** English label / description */
  en: { label: string; description: string };
  /** Line colour on the map (validated categorical palette, light step) */
  color: string;
  /** Same hue stepped for dark surfaces (charts in dark panels) */
  colorDark: string;
  /** MapLibre line-dasharray, undefined = solid */
  dash?: number[];
  width: number;
  group: RouteGroup;
  /** Physically separated from motor traffic? (lanes/pictograms are NOT) */
  physicallySeparated: boolean;
  /** Should segments of this category be considered when matching routes? */
  matchable: boolean;
  /** Visible by default on the map */
  defaultVisible: boolean;
  /** Higher = more preferred for pleasant cycling (used only in route scoring). */
  comfortWeight: number;
}

// Palette validated with a CVD/contrast checker (adjacent ΔE ≥ 9 deutan, ≥ 15 normal vision).
// Palette chosen for distinguishability (incl. common colour-vision deficiencies)
// and supplemented by distinct line styles so colour is never the only cue.
export const CATEGORIES: Record<InfraCategory, CategoryInfo> = {
  separated_path: {
    id: 'separated_path',
    label: 'Oddělená cyklostezka',
    description:
      'Stezka určená cyklistům (C8) nebo dělená stezka pro chodce a cyklisty (C10), kde má cyklista vlastní vyznačenou část mimo vozovku.',
    en: { label: 'Separated cycle path', description: "Path for cyclists only (C8), or a segregated path (C10) where cyclists have their own marked half, away from the road." },
    color: '#1baf7a',
    colorDark: '#199e70',
    width: 4,
    group: 'dedicated',
    physicallySeparated: true,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 1.0,
  },
  shared_path: {
    id: 'shared_path',
    label: 'Společná stezka pro chodce a cyklisty',
    description:
      'Nedělená stezka pro chodce a cyklisty (C9) nebo stezka pro chodce s povoleným vjezdem cyklistů. Mimo vozovku, ale sdílená s chodci.',
    en: { label: 'Shared path for pedestrians and cyclists', description: "Unsegregated path for pedestrians and cyclists (C9), or a footpath where bikes are allowed. Off the road, but shared with people walking." },
    color: '#2a78d6',
    colorDark: '#3987e5',
    width: 3.5,
    group: 'shared',
    physicallySeparated: true,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.85,
  },
  reserved_lane: {
    id: 'reserved_lane',
    label: 'Vyhrazený cyklopruh',
    description:
      'Vyhrazený jízdní pruh pro cyklisty (V14) na vozovce, oddělený plnou čarou. Není fyzicky oddělen od motorové dopravy.',
    en: { label: 'Reserved cycle lane', description: "Cycle lane on the road (V14), marked with a solid line. Not physically separated from motor traffic." },
    color: '#eb6834',
    colorDark: '#d95926',
    width: 3,
    group: 'lane',
    physicallySeparated: false,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.6,
  },
  protective_lane: {
    id: 'protective_lane',
    label: 'Ochranný cyklopruh',
    description:
      'Ochranný jízdní pruh pro cyklisty vyznačený přerušovanou čarou; motorová vozidla jej smějí za určitých podmínek pojíždět.',
    en: { label: 'Advisory cycle lane', description: "Cycle lane marked with a dashed line; motor vehicles may use it in some situations." },
    color: '#6250d6',
    colorDark: '#9085e9',
    dash: [2, 1.2],
    width: 3,
    group: 'lane',
    physicallySeparated: false,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.5,
  },
  contraflow: {
    id: 'contraflow',
    label: 'Cykloobousměrka',
    description:
      'Jízda cyklistů v protisměru jednosměrné ulice (vč. značky E12 a protisměrného pruhu). Jde o běžnou ulici se sdíleným provozem.',
    en: { label: 'Contraflow cycling', description: "Cycling against the traffic in a one-way street (incl. sign E12 and contraflow lanes). A normal street with mixed traffic." },
    color: '#eda100',
    colorDark: '#c98500',
    dash: [1, 1],
    width: 2.5,
    group: 'other',
    physicallySeparated: false,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.35,
  },
  pictogram: {
    id: 'pictogram',
    label: 'Piktogramový koridor',
    description:
      'Piktogramový koridor pro cyklisty (V20) – pouze vodorovné značení na běžné vozovce. NEJDE o cyklostezku ani cyklopruh.',
    en: { label: 'Pictogram corridor', description: "Pictogram corridor for cyclists (V20): bike symbols painted on a normal road. NOT a cycle path or a cycle lane." },
    color: '#e87ba4',
    colorDark: '#d55181',
    dash: [0.6, 1.6],
    width: 2.5,
    group: 'other',
    physicallySeparated: false,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.25,
  },
  no_motor_traffic: {
    id: 'no_motor_traffic',
    label: 'Komunikace bez motorové dopravy',
    description:
      'Úsek se zákazem vjezdu všech motorových vozidel (B11). Cyklisté smějí vjet, ale nejde o cyklostezku; povrch a provoz chodců se může lišit.',
    en: { label: 'Road without motor traffic', description: "Section closed to all motor vehicles (B11). Bikes are allowed, but it is not a cycle path; surface and pedestrian traffic vary." },
    color: '#008300',
    colorDark: '#008300',
    dash: [3, 1.5],
    width: 3,
    group: 'other',
    physicallySeparated: true,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.8,
  },
  other: {
    id: 'other',
    label: 'Ostatní cykloopatření',
    description:
      'Jiná opatření: přejezdy pro cyklisty, povolený vjezd cyklistů, vyhrazený pruh pro bus/taxi/cyklo a položky označené „Ostatní“.',
    en: { label: 'Other cycling measures', description: "Other measures: cycle crossings, 'bikes allowed' exceptions, bus/taxi/bike lanes and items marked 'Ostatní'." },
    color: '#8a939c',
    colorDark: '#8a939c',
    dash: [2, 2],
    width: 2.5,
    group: 'other',
    physicallySeparated: false,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.3,
  },
  unknown: {
    id: 'unknown',
    label: 'Neznámý typ',
    description: 'Záznam bez vyplněného typu opatření nebo s hodnotou, kterou aplikace nezná.',
    en: { label: 'Unknown type', description: "Record without a measure type, or with a value the app does not know." },
    color: '#c4c9ce',
    colorDark: '#c4c9ce',
    dash: [0.5, 1],
    width: 2,
    group: 'other',
    physicallySeparated: false,
    matchable: true,
    defaultVisible: true,
    comfortWeight: 0.2,
  },
  not_infrastructure: {
    id: 'not_infrastructure',
    label: 'Zrušeno / zákaz vjezdu cyklistů',
    description:
      'Záznamy „Úsek byl zrušen“ a „Vjezd cyklistům zakázán“. Nejsou to cyklistická opatření – nikdy se nezapočítávají do infrastruktury.',
    en: { label: 'Cancelled / cycling banned', description: "Records 'Úsek byl zrušen' (cancelled) and 'Vjezd cyklistům zakázán' (no cycling). Not cycling measures; never counted as infrastructure." },
    color: '#e34948',
    colorDark: '#e66767',
    dash: [1, 2],
    width: 2,
    group: 'unclassified',
    physicallySeparated: false,
    matchable: false,
    defaultVisible: false,
    comfortWeight: 0,
  },
};

export const CATEGORY_ORDER: InfraCategory[] = [
  'separated_path',
  'shared_path',
  'reserved_lane',
  'protective_lane',
  'contraflow',
  'pictogram',
  'no_motor_traffic',
  'other',
  'unknown',
  'not_infrastructure',
];

export const ROUTE_GROUPS: Record<RouteGroup, { label: string; labelEn: string; color: string }> = {
  dedicated: { label: 'Oddělené cyklostezky', labelEn: 'Separated cycle paths', color: CATEGORIES.separated_path.colorDark },
  shared: { label: 'Společné stezky s chodci', labelEn: 'Paths shared with pedestrians', color: CATEGORIES.shared_path.colorDark },
  lane: { label: 'Cyklopruhy (na vozovce)', labelEn: 'Cycle lanes (on the road)', color: CATEGORIES.reserved_lane.colorDark },
  other: { label: 'Ostatní cykloopatření', labelEn: 'Other cycling measures', color: CATEGORIES.protective_lane.colorDark },
  unclassified: { label: 'Neověřeno / bez odpovídajícího záznamu', labelEn: 'Not verified / no matching record', color: '#7d8790' },
};

export const ROUTE_GROUP_ORDER: RouteGroup[] = ['dedicated', 'shared', 'lane', 'other', 'unclassified'];

/** Colour used for route pieces with no matching municipal record. */
export const UNMATCHED_COLOR = '#7d8790';
export const UNMATCHED_LABEL = 'Neověřeno / bez odpovídajícího záznamu';
export const UNMATCHED_LABEL_EN = 'Not verified / no matching record';

export const categoryLabel = (c: InfraCategory, lang: Lang = 'cs') => (lang === 'en' ? CATEGORIES[c].en.label : CATEGORIES[c].label);
export const categoryDescription = (c: InfraCategory, lang: Lang = 'cs') => (lang === 'en' ? CATEGORIES[c].en.description : CATEGORIES[c].description);
export const groupLabel = (g: RouteGroup, lang: Lang = 'cs') => (lang === 'en' ? ROUTE_GROUPS[g].labelEn : ROUTE_GROUPS[g].label);
export const unmatchedLabel = (lang: Lang = 'cs') => (lang === 'en' ? UNMATCHED_LABEL_EN : UNMATCHED_LABEL);

export interface NormalizationRule {
  /** Exact original value of typ_opatreni (null = empty) */
  original: string | null;
  category: InfraCategory;
  note: string;
  noteEn: string;
}

/** Verified against the live service; exact string matches only. */
export const NORMALIZATION_TABLE: NormalizationRule[] = [
  { original: 'Stezka pro cyklisty - C8', category: 'separated_path', note: 'Stezka výhradně pro cyklisty.', noteEn: 'Path for cyclists only.' },
  {
    original: 'Stezka pro chodce a cyklisty (dělená) - C10',
    category: 'separated_path',
    note: 'Dělená stezka – cyklista má vlastní, vyznačenou část mimo vozovku.', noteEn: 'Segregated path: cyclists have their own marked part, off the road.',
  },
  {
    original: 'Stezka pro chodce a cyklisty (nedělená) - C9',
    category: 'shared_path',
    note: 'Společný prostor s chodci, mimo vozovku.', noteEn: 'Space shared with pedestrians, off the road.',
  },
  {
    original: 'Stezka pro chodce s povoleným vjezdem cyklistů',
    category: 'shared_path',
    note: 'Chodník/stezka pro chodce, cyklisté povoleni; chodci mají přednost.', noteEn: 'Footpath with bikes allowed; pedestrians have priority.',
  },
  { original: 'Vyhrazený jízdní pruh pro cyklisty - V14', category: 'reserved_lane', note: 'Pruh na vozovce, plná čára.', noteEn: 'Lane on the road, solid line.' },
  { original: 'Ochranný jízdní pruh pro cyklisty', category: 'protective_lane', note: 'Pruh na vozovce, přerušovaná čára.', noteEn: 'Lane on the road, dashed line.' },
  { original: 'Jízda cyklistů v protisměru', category: 'contraflow', note: 'Cykloobousměrka.', noteEn: 'Contraflow cycling.' },
  { original: 'Jízda cyklistů v protisměru - E12', category: 'contraflow', note: 'Cykloobousměrka (dodatková tabulka E12).', noteEn: 'Contraflow cycling (supplementary sign E12).' },
  {
    original: 'Jízda cyklistů v protisměru (jízdní pruh)',
    category: 'contraflow',
    note: 'Cykloobousměrka s vyznačeným protisměrným pruhem.', noteEn: 'Contraflow cycling with a marked contraflow lane.',
  },
  {
    original: 'Piktogramový koridor pro cyklisty - V20',
    category: 'pictogram',
    note: 'Jen piktogramy na vozovce – nezapočítává se jako stezka ani pruh.', noteEn: 'Only pictograms on the road; never counted as a path or a lane.',
  },
  {
    original: 'Zákaz vjezdu všech motorových vozidel - B11',
    category: 'no_motor_traffic',
    note: 'Komunikace bez motorové dopravy; není to cyklostezka.', noteEn: 'Road without motor traffic; not a cycle path.',
  },
  { original: 'Přejezd pro cyklisty', category: 'other', note: 'Krátký přejezd přes vozovku.', noteEn: 'Short crossing over a road.' },
  { original: 'Vjezd cyklistům povolen', category: 'other', note: 'Výjimka ze zákazu vjezdu pro cyklisty.', noteEn: 'Exception from a no-entry sign for cyclists.' },
  {
    original: 'Vyhrazený pruh pro taxi, cyklo, bus',
    category: 'other',
    note: 'Sdílený pruh s autobusy a taxi – není to cyklopruh.', noteEn: 'Lane shared with buses and taxis; not a cycle lane.',
  },
  { original: 'Ostatní', category: 'other', note: 'Bez bližší specifikace v datech.', noteEn: 'No further specification in the data.' },
  { original: 'Úsek byl zrušen', category: 'not_infrastructure', note: 'Zrušený úsek – nezapočítává se.', noteEn: 'Cancelled section; not counted.' },
  { original: 'Vjezd cyklistům zakázán', category: 'not_infrastructure', note: 'Zákaz pro cyklisty – nezapočítává se.', noteEn: 'Cycling banned; not counted.' },
  { original: null, category: 'unknown', note: 'Typ opatření není vyplněn.', noteEn: 'Measure type not filled in.' },
];

const RULE_MAP = new Map<string, NormalizationRule>(
  NORMALIZATION_TABLE.filter((r) => r.original !== null).map((r) => [r.original as string, r]),
);

export function normalizeTypOpatreni(value: unknown): InfraCategory {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value !== 'string') return 'unknown';
  const trimmed = value.trim();
  if (trimmed === '') return 'unknown';
  return RULE_MAP.get(trimmed)?.category ?? 'unknown';
}

export function categoryGroup(cat: InfraCategory | null): RouteGroup {
  return cat ? CATEGORIES[cat].group : 'unclassified';
}
