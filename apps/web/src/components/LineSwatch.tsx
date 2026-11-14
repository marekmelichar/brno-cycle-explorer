import { CATEGORIES, type InfraCategory } from '@bce/shared';

/** SVG sample of a category's map line style (colour + dash), so identity is never colour-only. */
export function LineSwatch({ category, width = 28 }: { category: InfraCategory; width?: number }) {
  const c = CATEGORIES[category];
  const sw = 4;
  const dash = c.dash ? c.dash.map((d) => d * sw).join(' ') : undefined;
  return (
    <svg width={width} height={10} aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1={1} y1={5} x2={width - 1} y2={5} stroke="#0b1220" strokeOpacity={0.6} strokeWidth={sw + 2} strokeLinecap="round" />
      <line x1={1} y1={5} x2={width - 1} y2={5} stroke={c.color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap={dash ? 'butt' : 'round'} />
    </svg>
  );
}
