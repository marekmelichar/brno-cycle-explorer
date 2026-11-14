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
import { CATEGORIES, CATEGORY_ORDER } from '@bce/shared';
import { useDatasetStats, useImportInfrastructure, useInfrastructure, useRefreshInfrastructure } from '../../hooks/data';
import { useAppStore } from '../../store/useAppStore';
import { fmtDate, fmtDateTime, fmtInt, fmtKm } from '../../services/format';
import { LineSwatch } from '../../components/LineSwatch';
import { useNotify } from '../../components/Notifier';

export function DataStatus() {
  const { data, isLoading, error, refetch } = useInfrastructure();
  const refresh = useRefreshInfrastructure();
  const imp = useImportInfrastructure();
  const notify = useNotify();
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = data?.meta;

  const onImport = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      await imp.mutateAsync(json);
      notify('GeoJSON byl importován. Data jsou označena jako importovaná, nikoli oficiální.', 'success');
    } catch (e) {
      notify(`Import selhal: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Box data-testid="data-status">
      {(isLoading || meta?.refreshing || refresh.isPending) && <LinearProgress sx={{ mb: 1 }} />}
      {error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => refetch()}>Znovu</Button>} sx={{ mb: 1 }}>
          {(error as Error).message}
        </Alert>
      )}
      {meta && meta.featureCount === 0 && !meta.refreshing && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Data o cyklistické infrastruktuře nejsou k dispozici{meta.lastError ? `: ${meta.lastError.message}` : '.'} Aplikace nenahrazuje chybějící data
          vymyšlenými údaji – zkuste obnovit data nebo importovat GeoJSON.
        </Alert>
      )}
      {meta && meta.featureCount > 0 && meta.lastError && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Poslední aktualizace selhala ({meta.lastError.message}). Zobrazena jsou data z {fmtDateTime(meta.lastRefreshed)}.
        </Alert>
      )}
      {meta && (
        <Box sx={{ fontSize: 12.5, color: 'text.secondary', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.25 }}>
          <span>Zdroj</span>
          <Box component="span" sx={{ color: 'text.primary' }}>
            {meta.source === 'official' ? 'Oficiální ArcGIS služba města Brna' : meta.source === 'imported' ? 'Ručně importovaný GeoJSON' : '—'}
          </Box>
          <span>Prvků</span>
          <Box component="span" sx={{ color: 'text.primary' }} data-testid="feature-count">
            {fmtInt(meta.featureCount)}
            {meta.expectedCount !== null && meta.expectedCount !== meta.featureCount ? ` z ${fmtInt(meta.expectedCount)}` : ''}
          </Box>
          <span>Aktualizováno</span>
          <Box component="span" sx={{ color: 'text.primary' }} data-testid="last-refreshed">
            {fmtDateTime(meta.lastRefreshed)}
          </Box>
          <span>Export města</span>
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
            refresh.mutate(undefined, {
              onSuccess: (d) => notify(`Data obnovena: ${d.meta.featureCount} prvků.`, 'success'),
              onError: (e) => notify(`Obnovení selhalo: ${(e as Error).message}`, 'error'),
            })
          }
        >
          Obnovit data
        </Button>
        <Tooltip title="Záložní možnost: načíst GeoJSON s liniemi a atributem typ_opatreni (např. ruční export z data.brno.cz).">
          <Button size="small" variant="text" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()} disabled={imp.isPending}>
            Import GeoJSON
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
          control={<Switch checked={showInfra} onChange={(e) => set({ showInfra: e.target.checked })} inputProps={{ 'aria-label': 'Zobrazit cykloopatření' }} />}
          label={<Typography variant="subtitle2">Vrstvy cykloopatření</Typography>}
          sx={{ flex: 1 }}
        />
        <Button size="small" onClick={() => setAll(true)}>Vše</Button>
        <Button size="small" onClick={() => setAll(false)}>Nic</Button>
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
                inputProps={{ 'aria-label': info.label }}
                data-testid={`toggle-${c}`}
                sx={{ p: 0.5 }}
              />
              <LineSwatch category={c} />
              <Typography variant="body2" sx={{ flex: 1, lineHeight: 1.2 }}>
                {info.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {st ? `${fmtKm(st.geodesicLength)} · ${st.count}×` : '—'}
              </Typography>
              <Tooltip title={info.description} placement="right">
                <IconButton size="small" aria-label={`Vysvětlení: ${info.label}`}>
                  <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}
      </Stack>
      <Box>
        <Typography variant="caption" color="text.secondary" id="opacity-label">
          Průhlednost vrstev: {Math.round(opacity * 100)} %
        </Typography>
        <Slider size="small" value={opacity} min={0.15} max={1} step={0.05} onChange={(_, v) => set({ infraOpacity: v as number })} aria-labelledby="opacity-label" />
      </Box>
      <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: 12 } }}>
        Délky u kategorií jsou součtem geometrií záznamů (bez deduplikace). Klikněte na linii v mapě pro zobrazení původních atributů. Piktogramové koridory a
        cyklopruhy nejsou fyzicky oddělenou infrastrukturou.
      </Alert>
      <Button size="small" onClick={() => set({ sourcesOpen: true })}>
        Zdroje dat a převodní tabulka kategorií
      </Button>
    </Stack>
  );
}
