import { useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import EditRoadIcon from '@mui/icons-material/EditRoad';
import { elevationStats } from '@bce/geo';
import { useActiveAnalysis, useInfrastructure } from '../../hooks/data';
import { useAppStore } from '../../store/useAppStore';
import { useExportGpx, useGpxImport } from '../../hooks/useRouteActions';
import { RouteStats } from '../../components/RouteStats';
import { linesBounds } from '../../services/geometry';

export function GpxDropZone() {
  const importGpx = useGpxImport();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <Box
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) importGpx(f);
      }}
      sx={{
        border: '2px dashed',
        borderColor: over ? 'primary.main' : 'divider',
        bgcolor: over ? 'rgba(45,212,191,0.08)' : 'transparent',
        borderRadius: 2,
        p: 2,
        textAlign: 'center',
        transition: 'all .15s',
      }}
    >
      <UploadFileIcon color="primary" />
      <Typography variant="body2" sx={{ my: 0.5 }}>
        Přetáhněte sem soubor <b>.gpx</b>
      </Typography>
      <Button variant="contained" size="small" onClick={() => inputRef.current?.click()} data-testid="gpx-pick">
        Vybrat soubor
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        hidden
        data-testid="gpx-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importGpx(f);
          e.target.value = '';
        }}
      />
    </Box>
  );
}

export function GpxPanel() {
  const gpx = useAppStore((s) => s.gpx);
  const active = useAppStore((s) => s.activeRoute);
  const set = useAppStore((s) => s.set);
  const fitTo = useAppStore((s) => s.fitTo);
  const analysis = useActiveAnalysis();
  const exportGpx = useExportGpx();
  const { data: infra } = useInfrastructure();
  const isGpx = active?.kind === 'gpx';
  const elev = useMemo(() => (isGpx && active?.elevations ? elevationStats(active.elevations) : null), [isGpx, active]);

  const useInPlanner = () => {
    if (!gpx) return;
    const line = gpx.segments.flat().map((p) => [p.lon, p.lat] as [number, number]);
    const step = Math.max(1, Math.ceil(line.length / 400));
    const simplified = line.filter((_, i) => i % step === 0 || i === line.length - 1);
    set({ plannerMode: 'manual', manualLine: simplified, tab: 'planner', candidates: [], selectedCandidateId: null });
  };

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      <GpxDropZone />
      {!gpx && (
        <Typography variant="body2" color="text.secondary">
          Importujte svou GPX stopu (trasy i tracky, i s více segmenty). Aplikace spočítá délku, převýšení a geometricky určí, jaká část vede po zaznamenané
          cyklistické infrastruktuře.
        </Typography>
      )}
      {infra && infra.data.features.length === 0 && (
        <Alert severity="warning">Data o infrastruktuře nejsou načtena – analýzu nelze provést, zobrazí se jen trasa.</Alert>
      )}
      {gpx && (
        <>
          <Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }} data-testid="gpx-name">
                {gpx.name ?? gpx.fileName}
              </Typography>
              <Chip size="small" label="Uživatelská GPX stopa" variant="outlined" />
              {!isGpx && <Chip size="small" color="warning" label="Na mapě je jiná trasa" />}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {gpx.fileName} · {gpx.stats.validPointCount} platných bodů · {gpx.stats.segmentCount} segment(ů)
              {gpx.stats.invalidPointCount > 0 && ` · ${gpx.stats.invalidPointCount} vynecháno`}
            </Typography>
          </Box>
          {gpx.warnings.length > 0 && (
            <Alert severity="warning" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: 12 } }}>
              {gpx.warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </Alert>
          )}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {!isGpx && (
              <Button
                size="small"
                variant="contained"
                onClick={() =>
                  set({
                    activeRoute: {
                      kind: 'gpx',
                      name: gpx.name ?? gpx.fileName,
                      lines: gpx.segments.map((s) => s.map((p) => [p.lon, p.lat] as [number, number])),
                      elevations: gpx.segments.flat().map((p) => p.ele),
                    },
                    selectedSectionId: null,
                  })
                }
              >
                Zobrazit GPX
              </Button>
            )}
            <Button size="small" startIcon={<CenterFocusStrongIcon />} onClick={() => { const b = active && linesBounds(active.lines); if (b) fitTo(b); }}>
              Přiblížit
            </Button>
            <Button size="small" startIcon={<DownloadIcon />} onClick={exportGpx}>
              Export GPX
            </Button>
            <Button size="small" startIcon={<EditRoadIcon />} onClick={useInPlanner}>
              Použít v plánovači
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => set({ gpx: null, activeRoute: isGpx ? null : active, selectedSectionId: null })}
            >
              Odstranit
            </Button>
          </Stack>
          {isGpx && analysis && <RouteStats analysis={analysis} elevation={elev} />}
          {isGpx && !elev && <Typography variant="caption" color="text.secondary">Převýšení: soubor neobsahuje použitelné výškové údaje.</Typography>}
        </>
      )}
    </Stack>
  );
}
