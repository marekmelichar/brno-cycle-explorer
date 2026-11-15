import { useState, type ReactNode } from 'react';
import { Box, IconButton, Paper, Tab, Tabs, useMediaQuery } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import RouteIcon from '@mui/icons-material/Route';
import TimelineIcon from '@mui/icons-material/Timeline';
import BarChartIcon from '@mui/icons-material/BarChart';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { TopBar } from './components/TopBar';
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

const TABS: Array<{ id: SidebarTab; label: string; short: string; icon: ReactNode }> = [
  { id: 'map', label: 'Mapa cykloopatření', short: 'Mapa', icon: <MapIcon fontSize="small" /> },
  { id: 'planner', label: 'Plánovač trasy', short: 'Plánovač', icon: <RouteIcon fontSize="small" /> },
  { id: 'gpx', label: 'Analýza GPX', short: 'GPX', icon: <TimelineIcon fontSize="small" /> },
  { id: 'stats', label: 'Statistiky', short: 'Statistiky', icon: <BarChartIcon fontSize="small" /> },
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
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  return (
    <Tabs
      value={tab}
      onChange={(_, v) => setTab(v)}
      variant="fullWidth"
      aria-label="Panely aplikace"
      sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
    >
      {TABS.map((t) => (
        <Tab
          key={t.id}
          value={t.id}
          icon={t.icon as React.ReactElement}
          iconPosition={compact ? 'start' : 'top'}
          label={compact ? t.short : t.label}
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
  return (
    <Box sx={{ position: 'absolute', inset: 0, zIndex: 10, bgcolor: 'rgba(45,212,191,0.15)', border: '3px dashed #2dd4bf', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <Paper sx={{ px: 3, py: 2, fontWeight: 600 }}>Pusťte soubor GPX pro import a analýzu</Paper>
    </Box>
  );
}

export function App() {
  const desktop = useMediaQuery('(min-width:900px)');
  const tab = useAppStore((s) => s.tab);
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('peek');
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
              height: sheet === 'peek' ? 92 : sheet === 'half' ? '48%' : '88%',
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
              <Box sx={{ width: 34 }} />
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'rgba(148,163,184,0.5)' }} />
              </Box>
              <IconButton
                size="small"
                aria-label={sheet === 'full' ? 'Sbalit panel' : 'Rozbalit panel'}
                onClick={(e) => {
                  e.stopPropagation();
                  setSheet(sheet === 'full' ? 'peek' : sheet === 'half' ? 'full' : 'half');
                }}
              >
                {sheet === 'full' ? <ExpandMoreIcon /> : <ExpandLessIcon />}
              </IconButton>
            </Box>
            <Box onClick={() => sheet === 'peek' && setSheet('half')}>
              <SidebarTabs compact />
            </Box>
            <Box id="sidebar-panel" role="tabpanel" sx={{ flex: 1, overflow: 'auto' }}>
              <TabContent tab={tab} />
              <AnalysisPanel />
            </Box>
          </Paper>
        </Box>
      )}
      <SettingsDialog />
      <SourcesDialog />
    </Box>
  );
}
