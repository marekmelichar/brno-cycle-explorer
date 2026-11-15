import { useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Slider,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { CATEGORIES, CATEGORY_ORDER, categoryDescription, categoryLabel, unmatchedLabel } from '@bce/shared';
import { useI18n } from '../../i18n';
import { apiErrorText } from '../../services/api';
import { useDatasetStats, useImportInfrastructure, useInfrastructure, useRefreshInfrastructure } from '../../hooks/data';
import { useAppStore } from '../../store/useAppStore';
import { fmtDate, fmtDateTime, fmtInt, fmtKm } from '../../services/format';
import { LineSwatch } from '../../components/LineSwatch';
import { notifyPromise, useNotify } from '../../components/Notifier';

export function DataStatus() {
  const { data, isLoading, error, refetch } = useInfrastructure();
  const refresh = useRefreshInfrastructure();
  const imp = useImportInfrastructure();
  const notify = useNotify();
  const { t, lang } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = data?.meta;
  const lastErrorText = meta?.lastError ? (lang === 'en' && meta.lastError.code ? t(`apiErrors.${meta.lastError.code}`) : meta.lastError.message) : '';

  const onImport = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      await imp.mutateAsync(json);
      notify(t('infra.imported'), 'success');
    } catch (e) {
      notify(t('infra.importFailed', { msg: apiErrorText(e, t) }), 'error');
    }
  };

  return (
    <Box data-testid="data-status">
      {(isLoading || meta?.refreshing || refresh.isPending) && <LinearProgress sx={{ mb: 1 }} />}
      {error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => refetch()}>{t('infra.retry')}</Button>} sx={{ mb: 1 }}>
          {apiErrorText(error, t)}
        </Alert>
      )}
      {meta && meta.featureCount === 0 && !meta.refreshing && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {t('infra.noData', { reason: meta.lastError ? `: ${lastErrorText}` : '.' })}
        </Alert>
      )}
      {meta && meta.featureCount > 0 && meta.lastError && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {t('infra.lastFailed', { msg: lastErrorText, when: fmtDateTime(meta.lastRefreshed) })}
        </Alert>
      )}
      {meta && (
        <Box sx={{ fontSize: 12.5, color: 'text.secondary', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.25 }}>
          <span>{t('infra.source')}</span>
          <Box component="span" sx={{ color: 'text.primary' }}>
            {meta.source === 'official' ? t('infra.srcOfficial') : meta.source === 'imported' ? t('infra.srcImported') : '—'}
          </Box>
          <span>{t('infra.features')}</span>
          <Box component="span" sx={{ color: 'text.primary' }} data-testid="feature-count">
            {fmtInt(meta.featureCount)}
            {meta.expectedCount !== null && meta.expectedCount !== meta.featureCount ? t('infra.of', { n: fmtInt(meta.expectedCount) }) : ''}
          </Box>
          <span>{t('infra.updated')}</span>
          <Box component="span" sx={{ color: 'text.primary' }} data-testid="last-refreshed">
            {fmtDateTime(meta.lastRefreshed)}
          </Box>
          <span>{t('infra.cityExport')}</span>
          <Box component="span" sx={{ color: 'text.primary' }}>
            {fmtDate(meta.latestExportDate)}
          </Box>
        </Box>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={refresh.isPending ? <CircularProgress size={14} /> : <RefreshIcon />}
          disabled={refresh.isPending}
          onClick={() =>
            notifyPromise(refresh.mutateAsync(), {
                  loading: t('data.loading'),
                  success: (d) => t('data.refreshed', { count: d.meta.featureCount }),
                  error: (e) => t('data.refreshFailed', { msg: apiErrorText(e, t) }),
                }).catch(() => undefined)
          }
        >
          {t('infra.refresh')}
        </Button>
        <Tooltip title={t('infra.importTip')}>
          <Button size="small" variant="text" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()} disabled={imp.isPending}>
            {t('infra.import')}
          </Button>
        </Tooltip>
        <input
          ref={fileRef}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
      </Stack>
    </Box>
  );
}

export function InfrastructurePanel() {
  const { t, lang } = useI18n();
  const visible = useAppStore((s) => s.visibleCategories);
  const toggle = useAppStore((s) => s.toggleCategory);
  const setAll = useAppStore((s) => s.setAllCategories);
  const showInfra = useAppStore((s) => s.showInfra);
  const opacity = useAppStore((s) => s.infraOpacity);
  const set = useAppStore((s) => s.set);
  const stats = useDatasetStats();
  const byCat = new Map(stats?.byCategory.map((c) => [c.category, c]));

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      <DataStatus />
      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <FormControlLabel
          control={<Switch checked={showInfra} onChange={(e) => set({ showInfra: e.target.checked })} inputProps={{ 'aria-label': t('infra.showLayers') }} />}
          label={<Typography variant="subtitle2">{t('infra.layers')}</Typography>}
          sx={{ flex: 1 }}
        />
        <Button size="small" onClick={() => setAll(true)}>{t('infra.all')}</Button>
        <Button size="small" onClick={() => setAll(false)}>{t('infra.none')}</Button>
      </Box>
      <Stack spacing={0} data-testid="category-toggles">
        {CATEGORY_ORDER.map((c) => {
          const info = CATEGORIES[c];
          const st = byCat.get(c);
          return (
            <Box key={c} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: showInfra ? 1 : 0.5 }}>
              <Checkbox
                size="small"
                checked={visible[c]}
                onChange={() => toggle(c)}
                disabled={!showInfra}
                inputProps={{ 'aria-label': categoryLabel(c, lang) }}
                data-testid={`toggle-${c}`}
                sx={{ p: 0.5 }}
              />
              <LineSwatch category={c} />
              <Typography variant="body2" sx={{ flex: 1, lineHeight: 1.2 }}>
                {categoryLabel(c, lang)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {st ? `${fmtKm(st.geodesicLength)} · ${st.count}×` : '—'}
              </Typography>
              <Tooltip title={categoryDescription(c, lang)} placement="right">
                <IconButton size="small" aria-label={t('infra.explain', { label: categoryLabel(c, lang) })}>
                  <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}
      </Stack>
      <Box data-testid="route-colour-note" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pl: 0.5 }}>
        <svg width={28} height={10} aria-hidden="true" style={{ flexShrink: 0, marginTop: 4 }}>
          <line x1={1} y1={5} x2={27} y2={5} stroke="#0b1220" strokeWidth={7} />
          <line x1={1} y1={5} x2={27} y2={5} stroke="#f1f5f9" strokeWidth={4} strokeDasharray="5 4" />
        </svg>
        <Typography variant="caption" color="text.secondary">
          {t('infra.routeNote', { unmatched: unmatchedLabel(lang) })}
        </Typography>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" id="opacity-label">
          {t('infra.opacity', { v: Math.round(opacity * 100) })}
        </Typography>
        <Slider size="small" value={opacity} min={0.15} max={1} step={0.05} onChange={(_, v) => set({ infraOpacity: v as number })} aria-labelledby="opacity-label" />
      </Box>
      <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: 12 } }}>
        {t('infra.lengthsNote')}
      </Alert>
      <Button size="small" onClick={() => set({ sourcesOpen: true })}>
        {t('infra.sourcesLink')}
      </Button>
    </Stack>
  );
}
