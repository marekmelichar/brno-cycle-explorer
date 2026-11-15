import { useRef, useState } from 'react';
import { AppBar, Box, Button, CircularProgress, IconButton, MenuItem, Select, Toolbar, Tooltip, Typography, useMediaQuery } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LayersIcon from '@mui/icons-material/Layers';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useAppConfig, useRefreshInfrastructure } from '../hooks/data';
import { useAppStore } from '../store/useAppStore';
import { useExportGpx, useGpxImport } from '../hooks/useRouteActions';
import { SearchBox } from './SearchBox';
import { setLang, useI18n } from '../i18n';
import { apiErrorText } from '../services/api';
import { notifyPromise, useNotify } from './Notifier';

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
  const { t, lang } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
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
              inputProps={{ 'aria-label': t('top.basemap') }}
              title={t('top.basemap')}
              data-testid="basemap-select"
            >
              {config.basemaps.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {t(`basemap.${b.id}`, { defaultValue: b.label })}
                </MenuItem>
              ))}
            </Select>
        )}
        {mobile && (
          <Tooltip title={t('top.search')}>
            <IconButton color="inherit" aria-label={t('top.search')} onClick={() => setSearchOpen(!searchOpen)} data-testid="mobile-search-button">
              <SearchIcon />
            </IconButton>
          </Tooltip>
        )}
        {!mobile && (
        <Tooltip title={t('top.refreshTip')}>
          <span>
            <IconButton
              color="inherit"
              aria-label={t('top.refresh')}
              disabled={refresh.isPending}
              onClick={() =>
                notifyPromise(refresh.mutateAsync(), {
                  loading: t('data.loading'),
                  success: (d) => t('data.refreshed', { count: d.meta.featureCount }),
                  error: (e) => t('data.refreshFailed', { msg: apiErrorText(e, t) }),
                }).catch(() => undefined)
              }
            >
              {refresh.isPending ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
            </IconButton>
          </span>
        </Tooltip>
        )}
        <Tooltip title={t('top.importGpx')}>
          <IconButton color="inherit" aria-label={t('top.importGpx')} onClick={() => fileRef.current?.click()}>
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
        <Tooltip title={hasRoute ? t('top.exportTip') : t('top.nothingToExport')}>
          <span>
            <IconButton color="inherit" aria-label={t('top.exportGpx')} onClick={exportGpx} disabled={!hasRoute} data-testid="export-gpx">
              <DownloadIcon />
            </IconButton>
          </span>
        </Tooltip>
        {!mobile && (
          <Tooltip title={t('top.switchLang')}>
            <Button
              color="inherit"
              size="small"
              onClick={() => setLang(lang === 'cs' ? 'en' : 'cs')}
              data-testid="lang-toggle"
              aria-label={t('top.switchLang')}
              sx={{ minWidth: 0, px: 1, fontWeight: 700, letterSpacing: 0.5 }}
            >
              {lang === 'cs' ? 'EN' : 'CZ'}
            </Button>
          </Tooltip>
        )}
        <Tooltip title={t('top.settings')}>
          <IconButton color="inherit" aria-label={t('top.settings')} onClick={() => set({ settingsOpen: true })}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        {!mobile && (
          <Tooltip title={t('top.sourcesTip')}>
            <IconButton color="inherit" aria-label={t('top.sources')} onClick={() => set({ sourcesOpen: true })}>
              <InfoOutlinedIcon />
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
      {mobile && searchOpen && (
        <Box sx={{ px: 1, pb: 1, display: 'flex', gap: 1, alignItems: 'center' }} data-testid="mobile-search">
          <Box sx={{ flex: 1 }}>
            <SearchBox
              autoFocus
              onSelect={(r) => {
                if (r.bbox) fitTo(r.bbox);
                else fitTo([r.lon - 0.004, r.lat - 0.003, r.lon + 0.004, r.lat + 0.003]);
                setSearchOpen(false);
              }}
            />
          </Box>
          <IconButton color="inherit" aria-label={t('top.closeSearch')} onClick={() => setSearchOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
      )}
    </AppBar>
  );
}
