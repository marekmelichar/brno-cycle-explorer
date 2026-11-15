import { Alert, Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { CATEGORIES, ROUTE_GROUPS, UNMATCHED_COLOR, categoryLabel, groupLabel, unmatchedLabel, type InfraCategory } from '@bce/shared';
import { useI18n } from '../i18n';
import { elevationReasonText, noteText, qualityText } from '../i18n/format';
import type { ElevationStats, RouteAnalysis } from '@bce/geo';
import { fmtDistance, fmtKm, fmtPct } from '../services/format';

const GAP = 2;

/** 100 % stacked bar of route groups with a 2 px surface gap between segments. */
export function GroupBar({ analysis, height = 14 }: { analysis: RouteAnalysis; height?: number }) {
  const { lang } = useI18n();
  const parts = analysis.byGroup.filter((g) => g.length > 0);
  return (
    <Box
      role="img"
      aria-label={parts.map((g) => `${groupLabel(g.key, lang)} ${fmtPct(g.share)}`).join(', ')}
      sx={{ display: 'flex', gap: `${GAP}px`, height, width: '100%', borderRadius: 1, overflow: 'hidden' }}
    >
      {parts.map((g) => (
        <Tooltip key={g.key} title={`${groupLabel(g.key, lang)}: ${fmtDistance(g.length)} (${fmtPct(g.share)})`}>
          <Box
            sx={{
              flexGrow: g.share,
              flexBasis: 0,
              minWidth: 3,
              bgcolor: ROUTE_GROUPS[g.key].color,
              backgroundImage:
                g.key === 'unclassified' ? 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,0.18) 4px 6px)' : undefined,
            }}
          />
        </Tooltip>
      ))}
    </Box>
  );
}

export function QualityChip({ analysis }: { analysis: RouteAnalysis }) {
  const { t } = useI18n();
  const q = analysis.quality;
  const color = q.level === 'vysoká' ? 'success' : q.level === 'střední' ? 'warning' : 'error';
  return (
    <Tooltip
      title={
        <Box>
          <div>{t('stats.route.matched')} {fmtPct(q.matchedShare)}</div>
          <div>{t('stats.route.high')} {fmtPct(q.highConfidenceShare)}</div>
          <div>{t('stats.route.ambiguous')} {fmtPct(q.ambiguousShare)}</div>
          <div>{t('stats.route.spacing')} {q.meanPointSpacing.toFixed(0)} m</div>
          {q.notes.map((n) => (
            <div key={n.code}>• {noteText(n, t)}</div>
          ))}
        </Box>
      }
    >
      <Chip size="small" color={color} variant="outlined" label={t('stats.route.reliability', { level: qualityText(q.level, t) })} data-testid="quality-chip" />
    </Tooltip>
  );
}

interface Props {
  analysis: RouteAnalysis;
  elevation?: ElevationStats | null;
  compact?: boolean;
  extra?: React.ReactNode;
}

export function RouteStats({ analysis, elevation, compact, extra }: Props) {
  const { t, lang } = useI18n();
  const chartData = analysis.byCategory.map((c) => ({
    key: c.key,
    name: c.key === 'unmatched' ? unmatchedLabel(lang) : categoryLabel(c.key as InfraCategory, lang),
    km: c.length / 1000,
    share: c.share,
    color: c.key === 'unmatched' ? UNMATCHED_COLOR : CATEGORIES[c.key as InfraCategory].colorDark,
  }));
  const rec = analysis.reconciliation;
  return (
    <Box data-testid="route-stats">
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h5" component="p" data-testid="route-total" sx={{ fontWeight: 700 }}>
          {fmtKm(analysis.totalLength)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('stats.route.total')}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <QualityChip analysis={analysis} />
      </Box>
      {elevation && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('stats.route.elevation', { gain: Math.round(elevation.gain), loss: Math.round(elevation.loss), min: Math.round(elevation.min), max: Math.round(elevation.max) })}
          {!elevation.reliable && t('stats.route.unreliable', { why: elevationReasonText(elevation.reason, t) })}
        </Typography>
      )}
      {extra}
      <GroupBar analysis={analysis} />
      <Stack spacing={0.25} sx={{ mt: 1 }} data-testid="group-table">
        {analysis.byGroup.map((g) => (
          <Box key={g.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: ROUTE_GROUPS[g.key].color, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1, color: 'text.primary' }}>
              {groupLabel(g.key, lang)}
            </Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
              {fmtDistance(g.length)}
            </Typography>
            <Typography variant="body2" sx={{ width: 58, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
              {fmtPct(g.share)}
            </Typography>
          </Box>
        ))}
      </Stack>

      {!compact && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {t('stats.route.byType')}
          </Typography>
          <Box sx={{ height: Math.max(80, chartData.length * 24 + 10) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }} barCategoryGap={GAP}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={150} tick={{ fill: '#c3c2b7', fontSize: 11 }} axisLine={false} tickLine={false} />
                <RTooltip
                  cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                  contentStyle={{ background: '#0f1724', border: '1px solid #334155', fontSize: 12 }}
                  labelStyle={{ color: '#f0efec' }}
                  itemStyle={{ color: '#f0efec' }}
                  formatter={(_v: number, _n: string, item: { payload?: { km: number; share: number } }) => [
                    `${fmtKm((item.payload?.km ?? 0) * 1000)} (${fmtPct(item.payload?.share ?? 0)})`,
                    t('stats.route.length'),
                  ]}
                />
                <Bar dataKey="km" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {chartData.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }} data-testid="reconciliation">
        {rec.ok ? <CheckCircleOutlineIcon fontSize="inherit" color="success" /> : <ErrorOutlineIcon fontSize="inherit" color="error" />}
        <Typography variant="caption" color="text.secondary">
          {t('stats.route.reconcile', { sum: fmtDistance(rec.sum), total: fmtDistance(rec.total), diff: rec.difference.toFixed(3), tol: rec.tolerance.toFixed(1) })}
        </Typography>
      </Box>
      {!compact && analysis.quality.notes.length > 0 && (
        <Alert severity="info" variant="outlined" sx={{ mt: 1, py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
          {analysis.quality.notes.map((n) => (
            <div key={n.code}>{noteText(n, t)}</div>
          ))}
        </Alert>
      )}
    </Box>
  );
}
