import { useState } from 'react';
import {
  Alert,
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CATEGORIES, CATEGORY_ORDER, type InfraCategory } from '@bce/shared';
import { useDatasetStats, useInfrastructure } from '../../hooks/data';
import { fmtDate, fmtDateTime, fmtInt, fmtKm } from '../../services/format';
import { LineSwatch } from '../../components/LineSwatch';

const tooltipStyle = { background: '#0f1724', border: '1px solid #334155', fontSize: 12 };

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div" noWrap>
        {label}
      </Typography>
      <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

export function StatsPanel() {
  const { data } = useInfrastructure();
  const stats = useDatasetStats();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  if (!data || !stats) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">Statistiky budou dostupné po načtení dat o cyklistické infrastruktuře.</Alert>
      </Box>
    );
  }
  const meta = data.meta;
  const infraCats = stats.byCategory.filter((c) => c.category !== 'not_infrastructure');
  const catData = infraCats.map((c) => ({ key: c.category, name: CATEGORIES[c.category].label, km: c.geodesicLength / 1000, dedup: c.dedupLength / 1000, count: c.count }));
  const yearCats = CATEGORY_ORDER.filter((c) => stats.byYear.some((y) => y.byCategory[c]));
  const yearData = stats.byYear.map((y) => ({
    year: String(y.year),
    count: y.count,
    ...Object.fromEntries(yearCats.map((c) => [c, (y.byCategory[c] ?? 0) / 1000])),
  }));

  return (
    <Stack spacing={2} sx={{ p: 2 }} data-testid="stats-panel">
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Tile label="Délka záznamů (geometrie)" value={fmtKm(stats.geodesicLength)} sub="součet všech linií" />
        <Tile label="Deduplikovaná síť" value={fmtKm(stats.dedupLength)} sub={`překryvy ${fmtKm(stats.overlapLength)}`} />
        <Tile label="Počet prvků" value={fmtInt(stats.featureCount)} sub={meta.expectedCount ? `ve službě ${fmtInt(meta.expectedCount)}` : undefined} />
        <Tile label="Export dat města" value={fmtDate(meta.latestExportDate)} sub={`staženo ${fmtDateTime(meta.lastRefreshed)}`} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        „Délka záznamů“ je součet geodetických délek všech linií (atribut <code>delka</code> dává {fmtKm(stats.recordedLength)}). „Deduplikovaná síť“ počítá
        každé místo jen jednou – úseky, kde se linie překrývají (do 3 m a souběžně), se nezapočítají dvakrát. Nezahrnuje záznamy „Úsek byl zrušen“ a „Vjezd
        cyklistům zakázán“.
      </Typography>

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            Délka podle kategorie
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} aria-label="Zobrazení">
            <ToggleButton value="chart">Graf</ToggleButton>
            <ToggleButton value="table">Tabulka</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {view === 'chart' ? (
          <Box sx={{ height: catData.length * 30 + 20, mt: 1 }}>
            <ResponsiveContainer>
              <BarChart data={catData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }} barCategoryGap={2}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={155} tick={{ fill: '#c3c2b7', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#f0efec' }}
                  itemStyle={{ color: '#f0efec' }}
                  formatter={(_v: number, _n: string, item: { payload?: { km: number; dedup: number; count: number } }) => [
                    `${fmtKm((item.payload?.km ?? 0) * 1000)} (dedup. ${fmtKm((item.payload?.dedup ?? 0) * 1000)}, ${item.payload?.count} prvků)`,
                    'Délka',
                  ]}
                />
                <Bar dataKey="km" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {catData.map((d) => (
                    <Cell key={d.key} fill={CATEGORIES[d.key as InfraCategory].colorDark} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Table size="small" sx={{ mt: 1 }} aria-label="Délka podle kategorie">
            <TableHead>
              <TableRow>
                <TableCell>Kategorie</TableCell>
                <TableCell align="right">Prvků</TableCell>
                <TableCell align="right">Geometrie</TableCell>
                <TableCell align="right">Dedup.</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stats.byCategory.map((c) => (
                <TableRow key={c.category}>
                  <TableCell sx={{ fontSize: 12 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <LineSwatch category={c.category} width={20} />
                      {CATEGORIES[c.category].label}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: 12 }}>{c.count}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12 }}>{fmtKm(c.geodesicLength)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12 }}>{c.category === 'not_infrastructure' ? '—' : fmtKm(c.dedupLength)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {yearData.length > 0 && (
        <Box>
          <Typography variant="subtitle2">Realizace podle roku (km, dle rok_realizace)</Typography>
          <Box sx={{ height: 230, mt: 1 }}>
            <ResponsiveContainer>
              <BarChart data={yearData} margin={{ left: -18, right: 4, top: 4, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="year" tick={{ fill: '#c3c2b7', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#334155' }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#c3c2b7', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#f0efec' }}
                  itemStyle={{ color: '#f0efec' }}
                  formatter={(v: number, name: string) => [fmtKm(v * 1000), CATEGORIES[name as InfraCategory]?.label ?? name]}
                />
                <Legend wrapperStyle={{ fontSize: 10.5 }} formatter={(v: string) => <span style={{ color: '#c3c2b7' }}>{CATEGORIES[v as InfraCategory]?.label ?? v}</span>} />
                {yearCats.map((c) => (
                  <Bar key={c} dataKey={c} stackId="y" fill={CATEGORIES[c].colorDark} stroke="#151f2e" strokeWidth={1} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
          {stats.missingYearCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              {stats.missingYearCount} záznamů nemá vyplněný rok realizace.
            </Typography>
          )}
        </Box>
      )}

      <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: 12 } }}>
        <b>Pokrytí a omezení dat:</b> Datová sada „Realizovaná cykloopatření“ obsahuje opatření evidovaná městem Brnem. Nezahrnuje všechny cesty, po kterých je
        jízda na kole povolená (např. lesní a polní cesty, klidné ulice bez opatření, okolní obce). Absence záznamu neznamená, že úsek je nebezpečný či
        nesjízdný. Kategorie jsou odvozeny z atributu <code>typ_opatreni</code>.
        {meta.schemaWarnings.length > 0 && <div>Upozornění ke schématu: {meta.schemaWarnings.join(' ')}</div>}
      </Alert>
    </Stack>
  );
}
