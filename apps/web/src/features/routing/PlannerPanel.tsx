import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  List,
  ListItem,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import RouteIcon from '@mui/icons-material/Route';
import UndoIcon from '@mui/icons-material/Undo';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import { EXAMPLE_ROUTE, type RideType, type RouteCandidate, type RoutePreference } from '@bce/shared';
import { analyzeRoute, elevationStats, scoreRoute, type RouteAnalysis, type RouteScore } from '@bce/geo';
import { api } from '../../services/api';
import { useAppConfig, useInfraIndex } from '../../hooks/data';
import { newWaypointId, useAppStore } from '../../store/useAppStore';
import { SearchBox } from '../../components/SearchBox';
import { GroupBar, RouteStats } from '../../components/RouteStats';
import { useNotify } from '../../components/Notifier';
import { useExportGpx } from '../../hooks/useRouteActions';
import { fmtDuration, fmtKm, fmtPct } from '../../services/format';
import { linesBounds } from '../../services/geometry';

const RIDE_TYPES: Array<{ id: RideType; label: string }> = [
  { id: 'leisure', label: 'Pohodová vyjížďka' },
  { id: 'urban', label: 'Městská cyklistika' },
  { id: 'ebike', label: 'E-bike' },
  { id: 'sport', label: 'Sportovní jízda' },
];
const PREFS: Array<{ id: RoutePreference; label: string }> = [
  { id: 'max_paths', label: 'Maximum cyklostezek' },
  { id: 'min_roads', label: 'Minimum silnic' },
  { id: 'min_climb', label: 'Minimum převýšení' },
  { id: 'shortest', label: 'Nejkratší trasa' },
];

interface Scored {
  c: RouteCandidate;
  analysis: RouteAnalysis | null;
  score: RouteScore | null;
  gain: number | null;
}

export function PlannerPanel() {
  const s = useAppStore();
  const notify = useNotify();
  const exportGpx = useExportGpx();
  const { data: config } = useAppConfig();
  const index = useInfraIndex();
  const routingAvailable = !!config?.routing.available;

  const scored: Scored[] = useMemo(() => {
    const minDist = Math.min(...s.candidates.map((c) => c.distance));
    const list = s.candidates.map((c) => {
      const analysis = index ? analyzeRoute([c.coordinates], index, s.matchOptions) : null;
      const gain = c.elevation ? elevationStats(c.elevation)?.gain ?? null : null;
      const score = analysis ? scoreRoute(analysis, s.preference, { elevationGain: gain, shortestDistance: minDist }) : null;
      return { c, analysis, score, gain };
    });
    return list.sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0));
  }, [s.candidates, index, s.matchOptions, s.preference]);

  const selectCandidate = (c: RouteCandidate) => {
    s.set({
      selectedCandidateId: c.id,
      activeRoute: { kind: 'calculated', name: 'Plánovaná trasa', lines: [c.coordinates], elevations: c.elevation, meta: { variant: c.variant } },
      selectedSectionId: null,
      analysisOpen: true,
    });
  };

  const routeMut = useMutation({
    mutationFn: api.route,
    onSuccess: (res) => {
      if (!res.candidates.length) {
        notify('Směrovací server nevrátil žádnou trasu.', 'warning');
        return;
      }
      useAppStore.getState().set({ candidates: res.candidates });
      // pick best-scored candidate
      const st = useAppStore.getState();
      const minDist = Math.min(...res.candidates.map((c) => c.distance));
      const best = [...res.candidates]
        .map((c) => {
          const a = index ? analyzeRoute([c.coordinates], index, st.matchOptions) : null;
          const g = c.elevation ? elevationStats(c.elevation)?.gain ?? null : null;
          return { c, sc: a ? scoreRoute(a, st.preference, { elevationGain: g, shortestDistance: minDist }).score : 0 };
        })
        .sort((a, b) => b.sc - a.sc)[0].c;
      selectCandidate(best);
      const b = linesBounds([best.coordinates]);
      if (b) st.fitTo(b);
      if (res.warnings.length) notify(res.warnings.join(' '), 'warning');
    },
    onError: (e) => notify((e as Error).message, 'error'),
  });

  const calculate = (wps = s.waypoints) => {
    if (wps.length < 2) {
      notify('Zadejte alespoň start a cíl (kliknutím do mapy).', 'info');
      return;
    }
    routeMut.mutate({ waypoints: wps.map((w) => w.position), rideType: s.rideType, preference: s.preference, roundTrip: s.roundTrip });
  };

  const loadExample = () => {
    const wps = EXAMPLE_ROUTE.waypoints.map((w) => ({ id: newWaypointId(), position: w.position, name: w.name }));
    s.set({ plannerMode: 'auto', waypoints: wps, roundTrip: false, candidates: [], selectedCandidateId: null, manualLine: [] });
    const b = linesBounds([wps.map((w) => w.position)]);
    if (b) s.fitTo(b);
    if (routingAvailable) calculate(wps);
    else notify('Body ukázkové trasy načteny. Automatické plánování není nakonfigurováno, trasa nebyla vypočtena.', 'warning');
  };

  const useManual = () => {
    if (s.manualLine.length < 2) {
      notify('Nakreslete alespoň dva body.', 'info');
      return;
    }
    s.set({
      activeRoute: { kind: 'manual', name: 'Ručně nakreslená trasa', lines: [s.manualLine], elevations: null },
      selectedSectionId: null,
      analysisOpen: true,
      candidates: [],
      selectedCandidateId: null,
    });
  };

  const saveCurrent = () => {
    const r = s.activeRoute;
    if (!r || r.kind === 'gpx') return;
    const name = `${r.kind === 'manual' ? 'Ruční' : 'Vypočtená'} trasa ${new Date().toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })}`;
    s.saveRoute({ id: `r-${Date.now()}`, name, savedAt: new Date().toISOString(), kind: r.kind, lines: r.lines, waypoints: s.waypoints });
    notify('Trasa uložena v tomto prohlížeči.', 'success');
  };

  const selected = scored.find((x) => x.c.id === s.selectedCandidateId);
  const manualActive = s.activeRoute?.kind === 'manual';

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        fullWidth
        value={s.plannerMode}
        onChange={(_, v) => v && s.set({ plannerMode: v })}
        aria-label="Režim plánování"
      >
        <ToggleButton value="auto">
          <RouteIcon fontSize="small" sx={{ mr: 0.5 }} /> Automatická trasa
        </ToggleButton>
        <ToggleButton value="manual">
          <UndoIcon fontSize="small" sx={{ mr: 0.5, transform: 'scaleX(-1)' }} /> Ruční kreslení
        </ToggleButton>
      </ToggleButtonGroup>

      {s.plannerMode === 'auto' ? (
        <>
          {config && !routingAvailable && (
            <Alert severity="warning">
              Automatické plánování není nakonfigurováno ({config.routing.description}). Ruční kreslení a analýza GPX fungují i bez něj.
            </Alert>
          )}
          {config && routingAvailable && (
            <Typography variant="caption" color="text.secondary">
              Trasy počítá {config.routing.description} po skutečné síti silnic a cest z OpenStreetMap. Výsledky se poté hodnotí podle přiřazené oficiální
              infrastruktury.
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <FormControl size="small" fullWidth>
              <InputLabel id="ride-type">Typ jízdy</InputLabel>
              <Select labelId="ride-type" label="Typ jízdy" value={s.rideType} onChange={(e) => s.set({ rideType: e.target.value as RideType, candidates: [] })}>
                {RIDE_TYPES.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="pref">Preference trasy</InputLabel>
              <Select labelId="pref" label="Preference trasy" value={s.preference} onChange={(e) => s.set({ preference: e.target.value as RoutePreference, candidates: [] })}>
                {PREFS.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <SearchBox placeholder="Přidat bod vyhledáním adresy…" onSelect={(r) => s.addWaypoint([r.lon, r.lat], r.label.split(',').slice(0, 2).join(','))} />
          <Box>
            <Typography variant="overline" color="text.secondary">
              Body trasy (zadané uživatelem)
            </Typography>
            {s.waypoints.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Klikněte do mapy pro nastavení startu, dalším kliknutím přidáte cíl a mezilehlé body.
              </Typography>
            )}
            <List dense disablePadding data-testid="waypoint-list">
              {s.waypoints.map((w, i) => (
                <ListItem
                  key={w.id}
                  disableGutters
                  secondaryAction={
                    <Box>
                      <IconButton size="small" aria-label="Posunout nahoru" disabled={i === 0} onClick={() => s.reorderWaypoint(i, i - 1)}>
                        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" aria-label="Posunout dolů" disabled={i === s.waypoints.length - 1} onClick={() => s.reorderWaypoint(i, i + 1)}>
                        <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" aria-label="Odstranit bod" onClick={() => s.removeWaypoint(w.id)}>
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  }
                  sx={{ pr: 12 }}
                >
                  <Chip
                    size="small"
                    label={i === 0 ? 'S' : i === s.waypoints.length - 1 ? 'C' : i}
                    sx={{ mr: 1, bgcolor: i === 0 ? '#16a34a' : i === s.waypoints.length - 1 ? '#dc2626' : '#0ea5e9', color: '#fff', minWidth: 28 }}
                  />
                  <TextField
                    variant="standard"
                    size="small"
                    value={w.name}
                    onChange={(e) => s.set({ waypoints: s.waypoints.map((x) => (x.id === w.id ? { ...x, name: e.target.value } : x)) })}
                    inputProps={{ 'aria-label': `Název bodu ${i + 1}`, style: { fontSize: 13 } }}
                    fullWidth
                  />
                </ListItem>
              ))}
            </List>
          </Box>
          <FormControlLabel
            control={<Switch size="small" checked={s.roundTrip} onChange={(e) => s.set({ roundTrip: e.target.checked, candidates: [] })} />}
            label={<Typography variant="body2">Okruh (návrat do startu)</Typography>}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={routeMut.isPending ? <CircularProgress size={16} color="inherit" /> : <DirectionsBikeIcon />}
              disabled={!routingAvailable || routeMut.isPending || s.waypoints.length < 2}
              onClick={() => calculate()}
              data-testid="calculate-route"
              sx={{ flex: 1 }}
            >
              {routeMut.isPending ? 'Počítám…' : 'Vypočítat trasu'}
            </Button>
            <Tooltip title="Smazat body i trasu">
              <span>
                <Button variant="outlined" onClick={s.clearPlanner} startIcon={<ClearAllIcon />} disabled={!s.waypoints.length && !s.candidates.length}>
                  Vymazat
                </Button>
              </span>
            </Tooltip>
          </Stack>
          <Button variant="text" size="small" onClick={loadExample} data-testid="load-example">
            Ukázka: {EXAMPLE_ROUTE.name}
          </Button>

          {scored.length > 0 && (
            <>
              <Divider />
              <Typography variant="overline" color="text.secondary">
                Varianty tras ({scored.length}) – seřazeno podle skóre
              </Typography>
              <Stack spacing={1} data-testid="candidates">
                {scored.map(({ c, analysis, score, gain }, i) => (
                  <Card key={c.id} variant="outlined" sx={{ borderColor: c.id === s.selectedCandidateId ? 'primary.main' : 'divider' }}>
                    <CardActionArea onClick={() => selectCandidate(c)} sx={{ p: 1.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="subtitle2">Varianta {i + 1}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {fmtKm(c.distance)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ~{fmtDuration(c.duration)}
                          {gain !== null && ` · ↑ ${Math.round(gain)} m`}
                        </Typography>
                        <Box sx={{ flex: 1 }} />
                        {score && <Chip size="small" label={`Skóre ${Math.round(score.score)}`} color={i === 0 ? 'primary' : 'default'} />}
                      </Box>
                      {analysis && (
                        <>
                          <Box sx={{ my: 0.75 }}>
                            <GroupBar analysis={analysis} height={8} />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            Se záznamem cykloopatření {fmtPct(score?.infraShare ?? 0)} · {c.variant}
                          </Typography>
                        </>
                      )}
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
              {scored[0]?.score && (
                <Typography variant="caption" color="text.secondary">
                  {scored[0].score.explanation} Skóre nezohledňuje intenzitu dopravy ani bezpečnost – tato data aplikace nemá.
                </Typography>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: 12.5 } }}>
            Ruční kreslení spojuje body přímými úsečkami. Výsledek <b>není navigovaná trasa</b> a nemusí odpovídat sjízdným cestám – slouží k rychlému náčrtu
            a analýze.
          </Alert>
          <Typography variant="body2">Vrcholů: {s.manualLine.length}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="contained" onClick={useManual} disabled={s.manualLine.length < 2}>
              Analyzovat náčrt
            </Button>
            <Button size="small" startIcon={<UndoIcon />} onClick={() => s.set({ manualLine: s.manualLine.slice(0, -1) })} disabled={!s.manualLine.length}>
              Zpět
            </Button>
            <Button
              size="small"
              color="error"
              onClick={() => s.set({ manualLine: [], activeRoute: manualActive ? null : s.activeRoute })}
              disabled={!s.manualLine.length}
            >
              Vymazat
            </Button>
          </Stack>
        </>
      )}

      {s.activeRoute && s.activeRoute.kind !== 'gpx' && (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<DownloadIcon />} onClick={exportGpx} data-testid="planner-export">
            Export GPX
          </Button>
          <Button size="small" startIcon={<SaveIcon />} onClick={saveCurrent}>
            Uložit
          </Button>
        </Stack>
      )}

      {selected?.analysis && s.activeRoute?.kind === 'calculated' && (
        <RouteStats analysis={selected.analysis} elevation={selected.c.elevation ? elevationStats(selected.c.elevation) : null} compact />
      )}

      {s.savedRoutes.length > 0 && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary">
            Uložené trasy (jen v tomto prohlížeči)
          </Typography>
          <List dense disablePadding>
            {s.savedRoutes.map((r) => (
              <ListItem
                key={r.id}
                disableGutters
                secondaryAction={
                  <IconButton size="small" aria-label="Smazat uloženou trasu" onClick={() => s.deleteSavedRoute(r.id)}>
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                }
              >
                <Button
                  size="small"
                  sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    s.set({
                      activeRoute: { kind: r.kind, name: r.name, lines: r.lines, elevations: null },
                      waypoints: r.waypoints,
                      candidates: [],
                      selectedCandidateId: null,
                      selectedSectionId: null,
                    });
                    const b = linesBounds(r.lines);
                    if (b) s.fitTo(b);
                  }}
                >
                  {r.name}
                </Button>
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Stack>
  );
}
