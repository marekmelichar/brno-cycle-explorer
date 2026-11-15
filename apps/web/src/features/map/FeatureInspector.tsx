import { useMemo } from 'react';
import { Box, Chip, IconButton, Paper, Table, TableBody, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { CATEGORIES, categoryDescription, categoryLabel } from '@bce/shared';
import { useI18n } from '../../i18n';
import { useInfrastructure } from '../../hooks/data';
import { useAppStore } from '../../store/useAppStore';
import { fmtDistance } from '../../services/format';
import { linesBounds } from '../../services/geometry';
import { LineSwatch } from '../../components/LineSwatch';

export function FeatureInspector() {
  const id = useAppStore((s) => s.selectedFeatureId);
  const set = useAppStore((s) => s.set);
  const fitTo = useAppStore((s) => s.fitTo);
  const { t, lang } = useI18n();
  const { data } = useInfrastructure();
  const feature = useMemo(() => data?.data.features.find((f) => f.properties.id === id) ?? null, [data, id]);
  if (!feature) return null;
  const p = feature.properties;
  const cat = CATEGORIES[p.category];
  const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return (
    <Paper
      data-testid="feature-inspector"
      elevation={6}
      sx={{ position: 'absolute', top: 12, left: 12, width: 330, maxWidth: 'calc(100% - 80px)', maxHeight: '60%', overflow: 'auto', zIndex: 3, p: 1.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LineSwatch category={p.category} />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {categoryLabel(p.category, lang)}
        </Typography>
        <Tooltip title={t('feature.zoom')}>
          <IconButton size="small" aria-label={t('feature.zoomTo')} onClick={() => { const b = linesBounds(lines); if (b) fitTo(b); }}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" aria-label={t('feature.close')} onClick={() => set({ selectedFeatureId: null })}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ my: 0.5 }}>
        {categoryDescription(p.category, lang)}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
        <Chip size="small" label={p.source === 'official' ? t('feature.official') : t('feature.imported')} color={p.source === 'official' ? 'success' : 'warning'} variant="outlined" />
        <Chip size="small" label={cat.physicallySeparated ? t('feature.offRoad') : t('feature.onRoad')} variant="outlined" />
      </Box>
      <Typography variant="overline" color="text.secondary">
        {t('feature.attributes')}
      </Typography>
      <Table size="small" aria-label={t('feature.attributesAria')}>
        <TableBody>
          {Object.entries(p.original).map(([k, v]) => (
            <TableRow key={k}>
              <TableCell sx={{ py: 0.25, pl: 0, color: 'text.secondary', fontFamily: 'monospace', fontSize: 12 }}>{k}</TableCell>
              <TableCell sx={{ py: 0.25, pr: 0, fontSize: 12, wordBreak: 'break-word' }}>{v === null || v === undefined || v === '' ? '—' : String(v)}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ py: 0.25, pl: 0, color: 'text.secondary', fontSize: 12 }}>{t('feature.geomLength')}</TableCell>
            <TableCell sx={{ py: 0.25, pr: 0, fontSize: 12 }}>{fmtDistance(p.geodesicLength)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  );
}
