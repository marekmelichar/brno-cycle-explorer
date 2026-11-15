import { useEffect, useState, type ReactNode } from 'react';
import { Box, IconButton, Paper, Tab, Tabs, useMediaQuery } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import RouteIcon from '@mui/icons-material/Route';
import TimelineIcon from '@mui/icons-material/Timeline';
import BarChartIcon from '@mui/icons-material/BarChart';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { TopBar } from './components/TopBar';
import { useI18n } from './i18n';
import { MapView } from './features/map/MapView';
import { InfrastructurePanel } from './features/infrastructure/InfrastructurePanel';
import { PlannerPanel } from './features/routing/PlannerPanel';
import { GpxPanel } from './features/gpx/GpxPanel';
import { AnalysisPanel } from './features/gpx/AnalysisPanel';
import { StatsPanel } from './features/analytics/StatsPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { SourcesDialog } from './components/SourcesDialog';
import { useAppStore, type SidebarTab } from './store/useAppStore';
import { useGpxImport } from './hooks/useRouteActions';
import { useActiveAnalysis } from './hooks/data';
import { RouteSummaryBar } from './components/RouteSummaryBar';

const TABS: Array<{ id: SidebarTab; label: string; short: string; icon: ReactNode }> = [
  { id: 'map', label: 'tabs.map', short: 'tabs.mapShort', icon: <MapIcon fontSize="small" /> },
  { id: 'planner', label: 'tabs.planner', short: 'tabs.plannerShort', icon: <RouteIcon fontSize="small" /> },
  { id: 'gpx', label: 'tabs.gpx', short: 'tabs.gpxShort', icon: <TimelineIcon fontSize="small" /> },
  { id: 'stats', label: 'tabs.stats', short: 'tabs.statsShort', icon: <BarChartIcon fontSize="small" /> },
];

function TabContent({ tab }: { tab: SidebarTab }) {
  return (
    <>
      {tab === 'map' && <InfrastructurePanel />}
      {tab === 'planner' && <PlannerPanel />}
      {tab === 'gpx' && <GpxPanel />}
      {tab === 'stats' && <StatsPanel />}
    </>
  );
}

function SidebarTabs({ compact }: { compact?: boolean }) {
  const { t: tr } = useI18n();
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  return (
    <Tabs
      value={tab}
      onChange={(_, v) => setTab(v)}
      variant="fullWidth"
      aria-label={tr('app.tabsLabel')}
      sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
    >
      {TABS.map((t) => (
        <Tab
          key={t.id}
          value={t.id}
          icon={t.icon as React.ReactElement}
          iconPosition={compact ? 'start' : 'top'}
          label={tr(compact ? t.short : t.label)}
          id={`tab-${t.id}`}
          aria-controls="sidebar-panel"
          data-testid={`tab-${t.id}`}
          sx={compact ? { gap: 0.5, fontSize: 12, minHeight: 48, "& .MuiTab-iconWrapper": { mr: 0 } } : { gap: 0.25, fontSize: 11.5, lineHeight: 1.2, minHeight: 58, py: 0.75, "& .MuiTab-iconWrapper": { mb: 0.25 } }}
        />
      ))}
    </Tabs>
  );
}

function useWindowDrop() {
  const importGpx = useGpxImport();
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      },
      onDragLeave: (e: React.DragEvent) => {
        if (e.currentTarget === e.target) setDragging(false);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) importGpx(f);
      },
    },
  };
}

function DropOverlay() {
  const { t } = useI18n();
  return (
    <Box sx={{ position: 'absolute', inset: 0, zIndex: 10, bgcolor: 'rgba(45,212,191,0.15)', border: '3px dashed #2dd4bf', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <Paper sx={{ px: 3, py: 2, fontWeight: 600 }}>{t('app.dropGpx')}</Paper>
    </Box>
  );
}

export function App() {
  const { t } = useI18n();
  const desktop = useMediaQuery('(min-width:900px)');
  const tab = useAppStore((s) => s.tab);
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('peek');
  const hasSummary = !!useActiveAnalysis();
  // collapsed sheet = handle (30) + tabs (48) [+ route summary (44)]
  const peekHeight = hasSummary ? 122 : 78;
  useEffect(() => {
    // keep the map's bottom controls (scale, attribution) above the collapsed sheet
    document.documentElement.style.setProperty('--bce-sheet-peek', `${peekHeight}px`);
  }, [peekHeight]);
  const drop = useWindowDrop();

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
      <TopBar />
      {desktop ? (
        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Box component="aside" sx={{ width: 400, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
            <SidebarTabs />
            <Box id="sidebar-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} sx={{ flex: 1, overflow: 'auto' }}>
              <TabContent tab={tab} />
            </Box>
          </Box>
          <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }} {...drop.handlers}>
              <MapView />
              {drop.dragging && <DropOverlay />}
            </Box>
            <AnalysisPanel />
          </Box>
        </Box>
      ) : (
        <Box component="main" sx={{ flex: 1, position: 'relative', minHeight: 0 }} {...drop.handlers}>
          <MapView />
          {drop.dragging && <DropOverlay />}
          <Paper
            elevation={12}
            data-testid="bottom-sheet"
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: sheet === 'peek' ? peekHeight : sheet === 'half' ? '48%' : '88%',
              transition: 'height .25s ease',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 4,
              pb: 'env(safe-area-inset-bottom)',
            }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', height: 30, px: 1, cursor: 'pointer', flexShrink: 0 }}
              onClick={() => setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek')}
            >
              <Box sx={{ width: sheet === 'half' ? 68 : 34 }} />
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'rgba(148,163,184,0.5)' }} />
              </Box>
              {sheet !== 'peek' && (
                <IconButton
                  size="small"
                  aria-label={t('app.collapsePanel')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSheet('peek');
                  }}
                >
                  <ExpandMoreIcon />
                </IconButton>
              )}
              {sheet !== 'full' && (
                <IconButton
                  size="small"
                  aria-label={t('app.expandPanel')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSheet(sheet === 'peek' ? 'half' : 'full');
                  }}
                >
                  <ExpandLessIcon />
                </IconButton>
              )}
            </Box>
            {sheet === 'peek' && <RouteSummaryBar onOpen={() => setSheet('half')} />}
            <Box onClick={() => sheet === 'peek' && setSheet('half')}>
              <SidebarTabs compact />
            </Box>
            <Box id="sidebar-panel" role="tabpanel" sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <TabContent tab={tab} />
              {(tab === 'planner' || tab === 'gpx') && <AnalysisPanel />}
            </Box>
          </Paper>
        </Box>
      )}
      <SettingsDialog />
      <SourcesDialog />
    </Box>
  );
}
