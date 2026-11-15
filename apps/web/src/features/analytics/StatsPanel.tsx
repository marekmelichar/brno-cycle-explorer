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
import { CATEGORIES, CATEGORY_ORDER, categoryLabel, type InfraCategory } from '@bce/shared';
import { useI18n } from '../../i18n';
import { dataWarningText } from '../../i18n/format';
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
  const { t, lang } = useI18n();
  const { data } = useInfrastructure();
  const stats = useDatasetStats();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  if (!data || !stats) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">{t('stats.empty')}</Alert>
      </Box>
    );
  }
  const meta = data.meta;
  const infraCats = stats.byCategory.filter((c) => c.category !== 'not_infrastructure');
  const catData = infraCats.map((c) => ({ key: c.category, name: categoryLabel(c.category, lang), km: c.geodesicLength / 1000, dedup: c.dedupLength / 1000, count: c.count }));
  const yearCats = CATEGORY_ORDER.filter((c) => stats.byYear.some((y) => y.byCategory[c]));
  const yearData = stats.byYear.map((y) => ({
    year: String(y.year),
    count: y.count,
    ...Object.fromEntries(yearCats.map((c) => [c, (y.byCategory[c] ?? 0) / 1000])),
  }));

  return (
    <Stack spacing={2} sx={{ p: 2 }} data-testid="stats-panel">
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Tile label={t('stats.recorded')} value={fmtKm(stats.geodesicLength)} sub={t('stats.recordedSub')} />
        <Tile label={t('stats.dedup')} value={fmtKm(stats.dedupLength)} sub={t('stats.dedupSub', { v: fmtKm(stats.overlapLength) })} />
        <Tile label={t('stats.count')} value={fmtInt(stats.featureCount)} sub={meta.expectedCount ? t('stats.countSub', { v: fmtInt(meta.expectedCount) }) : undefined} />
        <Tile label={t('stats.export')} value={fmtDate(meta.latestExportDate)} sub={t('stats.exportSub', { v: fmtDateTime(meta.lastRefreshed) })} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('stats.explainA')}
        <code>delka</code>
        {t('stats.explainB', { v: fmtKm(stats.recordedLength) })}
      </Typography>

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {t('stats.byCategory')}
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} aria-label={t('stats.view')}>
            <ToggleButton value="chart">{t('stats.chart')}</ToggleButton>
            <ToggleButton value="table">{t('stats.table')}</ToggleButton>
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
                    t('stats.tooltip', { km: fmtKm((item.payload?.km ?? 0) * 1000), dedup: fmtKm((item.payload?.dedup ?? 0) * 1000), count: item.payload?.count }),
                    t('stats.length'),
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
          <Table size="small" sx={{ mt: 1 }} aria-label={t('stats.byCategory')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('stats.col.category')}</TableCell>
                <TableCell align="right">{t('stats.col.count')}</TableCell>
                <TableCell align="right">{t('stats.col.geometry')}</TableCell>
                <TableCell align="right">{t('stats.col.dedup')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stats.byCategory.map((c) => (
                <TableRow key={c.category}>
                  <TableCell sx={{ fontSize: 12 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <LineSwatch category={c.category} width={20} />
                      {categoryLabel(c.category, lang)}
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
          <Typography variant="subtitle2">{t('stats.byYear')}</Typography>
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
                  formatter={(v: number, name: string) => [fmtKm(v * 1000), CATEGORIES[name as InfraCategory] ? categoryLabel(name as InfraCategory, lang) : name]}
                />
                <Legend wrapperStyle={{ fontSize: 10.5 }} formatter={(v: string) => <span style={{ color: '#c3c2b7' }}>{CATEGORIES[v as InfraCategory] ? categoryLabel(v as InfraCategory, lang) : v}</span>} />
                {yearCats.map((c) => (
                  <Bar key={c} dataKey={c} stackId="y" fill={CATEGORIES[c].colorDark} stroke="#151f2e" strokeWidth={1} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
          {stats.missingYearCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              {t('stats.missingYear', { count: stats.missingYearCount })}
            </Typography>
          )}
        </Box>
      )}

      <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: 12 } }}>
        <b>{t('stats.coverageTitle')}</b> {t('stats.coverage')}
        <code>typ_opatreni</code>.
        {meta.schemaWarnings.length > 0 && <div>{t('stats.schemaWarnings', { list: meta.schemaWarnings.map((w) => dataWarningText(w, t)).join(' ') })}</div>}
      </Alert>
    </Stack>
  );
}
