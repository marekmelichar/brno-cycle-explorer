import { useRef } from 'react';
import { AppBar, Box, CircularProgress, IconButton, MenuItem, Select, Toolbar, Tooltip, Typography, useMediaQuery } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LayersIcon from '@mui/icons-material/Layers';
import { useAppConfig, useRefreshInfrastructure } from '../hooks/data';
import { useAppStore } from '../store/useAppStore';
import { useExportGpx, useGpxImport } from '../hooks/useRouteActions';
import { SearchBox } from './SearchBox';
import { useNotify } from './Notifier';

export function TopBar() {
  const { data: config } = useAppConfig();
  const basemapId = useAppStore((s) => s.basemapId);
  const set = useAppStore((s) => s.set);
  const fitTo = useAppStore((s) => s.fitTo);
  const refresh = useRefreshInfrastructure();
  const importGpx = useGpxImport();
  const exportGpx = useExportGpx();
  const notify = useNotify();
  const fileRef = useRef<HTMLInputElement>(null);
  const hasRoute = useAppStore((s) => !!s.activeRoute);
  const wide = useMediaQuery('(min-width:1100px)');
  const mobile = useMediaQuery('(max-width:899px)');
  const current = basemapId ?? config?.defaultBasemap ?? '';

  return (
    <AppBar position="static" elevation={0} sx={{ bgcolor: '#0f1724', borderBottom: '1px solid', borderColor: 'divider', zIndex: 3 }}>
      <Toolbar variant="dense" sx={{ gap: 1, minHeight: 52, px: { xs: 1, sm: 2 } }}>
        <Box component="img" src="/favicon.svg" alt="" sx={{ width: 28, height: 28 }} />
        <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 700, whiteSpace: 'nowrap', mr: 1, fontSize: { xs: 15, sm: 16 } }}>
          Brno <Box component="span" sx={{ color: 'primary.main' }}>Cycle</Box> Explorer
        </Typography>
        {wide && (
          <Box sx={{ width: 340 }}>
            <SearchBox
              onSelect={(r) => {
                if (r.bbox) fitTo(r.bbox);
                else fitTo([r.lon - 0.004, r.lat - 0.003, r.lon + 0.004, r.lat + 0.003]);
              }}
            />
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        {config && !mobile && (
            <Select
              size="small"
              value={current}
              onChange={(e) => set({ basemapId: e.target.value })}
              startAdornment={<LayersIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />}
              sx={{ fontSize: 13, minWidth: 180, '& .MuiSelect-select': { py: 0.6 } }}
              inputProps={{ 'aria-label': 'Mapový podklad' }}
              title="Mapový podklad"
              data-testid="basemap-select"
            >
              {config.basemaps.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.label}
                </MenuItem>
              ))}
            </Select>
        )}
        <Tooltip title="Obnovit data z ArcGIS služby města">
          <span>
            <IconButton
              color="inherit"
              aria-label="Obnovit data"
              disabled={refresh.isPending}
              onClick={() =>
                refresh.mutate(undefined, {
                  onSuccess: (d) => notify(`Data obnovena: ${d.meta.featureCount} prvků.`, 'success'),
                  onError: (e) => notify(`Obnovení selhalo: ${(e as Error).message}`, 'error'),
                })
              }
            >
              {refresh.isPending ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Importovat GPX">
          <IconButton color="inherit" aria-label="Importovat GPX" onClick={() => fileRef.current?.click()}>
            <UploadFileIcon />
          </IconButton>
        </Tooltip>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          data-testid="topbar-gpx-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importGpx(f);
            e.target.value = '';
          }}
        />
        <Tooltip title={hasRoute ? 'Exportovat zobrazenou trasu do GPX' : 'Není co exportovat'}>
          <span>
            <IconButton color="inherit" aria-label="Exportovat GPX" onClick={exportGpx} disabled={!hasRoute} data-testid="export-gpx">
              <DownloadIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Nastavení">
          <IconButton color="inherit" aria-label="Nastavení" onClick={() => set({ settingsOpen: true })}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        {!mobile && (
          <Tooltip title="Zdroje dat a informace">
            <IconButton color="inherit" aria-label="Zdroje dat" onClick={() => set({ sourcesOpen: true })}>
              <InfoOutlinedIcon />
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
    </AppBar>
  );
}
