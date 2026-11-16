import { useEffect, useMemo, useRef } from 'react';
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
  Slider,
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import ShareIcon from '@mui/icons-material/Share';
import { EXAMPLE_ROUTE, type RideType, type RouteCandidate, type RoutePreference, type RouteResponse } from '@bce/shared';
import { analyzeRoute, elevationStats, scoreRoute, type RouteAnalysis, type RouteScore } from '@bce/geo';
import { api, ApiError, apiErrorText } from '../../services/api';
import { engineLabel, enginesDescription, variantLabel } from '../../services/variant';
import { useAppConfig, useInfraIndex } from '../../hooks/data';
import { newWaypointId, useAppStore } from '../../store/useAppStore';
import { SearchBox } from '../../components/SearchBox';
import { GroupBar, RouteStats } from '../../components/RouteStats';
import { useNotify } from '../../components/Notifier';
import { useI18n } from '../../i18n';
import { useExportGpx } from '../../hooks/useRouteActions';
import { useCanSharePlan, useLocationStart, useSharePlan } from '../../hooks/usePlanSharing';
import { fmtDistance, fmtDuration, fmtKm, fmtPct } from '../../services/format';
import { unverifiedOsmBreakdown } from '../../services/osm';
import { linesBounds } from '../../services/geometry';

const RIDE_TYPES: Array<{ id: RideType; label: string }> = [
  { id: 'leisure', label: 'planner.ride.leisure' },
  { id: 'urban', label: 'planner.ride.urban' },
  { id: 'ebike', label: 'planner.ride.ebike' },
  { id: 'sport', label: 'planner.ride.sport' },
];
const PREFS: Array<{ id: RoutePreference; label: string }> = [
  { id: 'max_paths', label: 'planner.pref.max_paths' },
  { id: 'min_roads', label: 'planner.pref.min_roads' },
  { id: 'min_climb', label: 'planner.pref.min_climb' },
  { id: 'shortest', label: 'planner.pref.shortest' },
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
  const { t, lang } = useI18n();
  const exportGpx = useExportGpx();
  const sharePlan = useSharePlan();
  const canShare = useCanSharePlan();
  const locationStart = useLocationStart();
  const { data: config } = useAppConfig();
  const index = useInfraIndex();
  const routingAvailable = !!config?.routing.available;
  const engines = config?.routing.engines ?? [];
  const engine = engines.some((e) => e.id === s.engine) ? s.engine : config?.routing.defaultEngine ?? null;

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
      activeRoute: { kind: 'calculated', name: t('planner.plannedName'), lines: [c.coordinates], elevations: c.elevation, meta: { variant: variantLabel(c, t) }, osm: c.osm ?? null, engineDistance: c.distance },
      selectedSectionId: null,
      analysisOpen: true,
    });
  };

  const routeMut = useMutation({ mutationFn: api.route });

  const handleRouteResult = (res: RouteResponse, fit: boolean) => {
    if (!res.candidates.length) {
      notify(t('planner.noRoute'), 'warning');
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
    if (fit) {
      const b = linesBounds([best.coordinates]);
      if (b) st.fitTo(b);
    }
    if (res.warnings.length) notify(res.warnings.join(' '), 'warning');
  };

  /** fit: zoom to the result (explicit calculations); automatic recalculations keep the view. */
  const calculate = (wps = s.waypoints, fit = true) => {
    const loop = s.roundTrip && wps.length === 1;
    if (wps.length < 2 && !loop) {
      notify(t('planner.needTwo'), 'info');
      return;
    }
    s.set({ routeDirty: false });
    // TanStack Query runs per-call callbacks only for the latest mutate(): older responses are dropped.
    routeMut.mutate(
      {
        waypoints: wps.map((w) => w.position),
        rideType: s.rideType,
        preference: s.preference,
        roundTrip: s.roundTrip,
        engine: engine ?? undefined,
        ...(loop ? { targetDistance: s.targetKm * 1000 } : {}),
      },
      {
        onSuccess: (res) => handleRouteResult(res, fit),
        onError: (e) => {
          const retry = { label: t('planner.retry'), onClick: () => calculate(useAppStore.getState().waypoints, fit) };
          if (e instanceof ApiError && (e.code === 'network' || e.code === 'timeout')) {
            // Phones drop requests when the browser goes to the background: recalculate on return.
            interruptedRef.current = true;
            notify(t('planner.interrupted'), 'warning', retry);
          } else {
            notify(apiErrorText(e, t), 'error', retry);
          }
        },
      },
    );
  };

  // After a dropped connection, recalculate as soon as the page is visible again.
  const interruptedRef = useRef(false);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !interruptedRef.current) return;
      interruptedRef.current = false;
      useAppStore.getState().set({ routeDirty: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);

  // Automatic (re)calculation once there are two points, whenever points or options change.
  useEffect(() => {
    const enough = s.waypoints.length >= 2 || (s.roundTrip && s.waypoints.length === 1);
    if (!s.routeDirty || s.plannerMode !== 'auto' || !routingAvailable || !enough) return;
    const t = setTimeout(() => calculate(useAppStore.getState().waypoints, false), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.routeDirty, s.waypoints, s.roundTrip, s.rideType, s.preference, engine, s.plannerMode, routingAvailable]);

  const loadExample = () => {
    const wps = EXAMPLE_ROUTE.waypoints.map((w) => ({ id: newWaypointId(), position: w.position, name: w.name }));
    s.set({ plannerMode: 'auto', waypoints: wps, roundTrip: false, candidates: [], selectedCandidateId: null, manualLine: [], routeDirty: false });
    const b = linesBounds([wps.map((w) => w.position)]);
    if (b) s.fitTo(b);
    if (routingAvailable) calculate(wps);
    else notify(t('planner.exampleNoRouting'), 'warning');
  };

  const useManual = () => {
    if (s.manualLine.length < 2) {
      notify(t('planner.needTwoManual'), 'info');
      return;
    }
    s.set({
      activeRoute: { kind: 'manual', name: t('planner.manualName'), lines: [s.manualLine], elevations: null },
      selectedSectionId: null,
      analysisOpen: true,
      candidates: [],
      selectedCandidateId: null,
    });
  };

  const saveCurrent = () => {
    const r = s.activeRoute;
    if (!r || r.kind === 'gpx') return;
    const when = new Date().toLocaleString(lang === 'en' ? 'en-GB' : 'cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
    const name = r.kind === 'manual' ? t('planner.savedNameManual', { when }) : t('planner.savedNameCalc', { when });
    s.saveRoute({ id: `r-${Date.now()}`, name, savedAt: new Date().toISOString(), kind: r.kind, lines: r.lines, waypoints: s.waypoints });
    notify(t('planner.saved'), 'success');
  };

  const selected = scored.find((x) => x.c.id === s.selectedCandidateId);
  const osmBreakdown = s.activeRoute?.kind === 'calculated' ? unverifiedOsmBreakdown(s.activeRoute, selected?.analysis ?? null) : null;
  const manualActive = s.activeRoute?.kind === 'manual';

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        fullWidth
        value={s.plannerMode}
        onChange={(_, v) => v && s.set({ plannerMode: v })}
        aria-label={t('planner.mode')}
      >
        <ToggleButton value="auto">
          <RouteIcon fontSize="small" sx={{ mr: 0.5 }} /> {t('planner.modeAuto')}
        </ToggleButton>
        <ToggleButton value="manual">
          <UndoIcon fontSize="small" sx={{ mr: 0.5, transform: 'scaleX(-1)' }} /> {t('planner.modeManual')}
        </ToggleButton>
      </ToggleButtonGroup>

      {s.plannerMode === 'auto' ? (
        <>
          {config && !routingAvailable && (
            <Alert severity="warning">
              {t('planner.notConfigured', { desc: enginesDescription(config, t) })}
            </Alert>
          )}
          {config && routingAvailable && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {t('planner.autoInfo')}
              </Typography>
              <Tooltip
                enterTouchDelay={0}
                leaveTouchDelay={6000}
                title={t('planner.howTip', { desc: enginesDescription(config, t) })}
              >
                <IconButton size="small" aria-label={t('planner.how')}>
                  <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          {engines.length > 1 && (
            <FormControl size="small" fullWidth>
              <InputLabel id="engine">{t('planner.engine')}</InputLabel>
              <Select labelId="engine" label={t('planner.engine')} value={engine ?? ''} onChange={(e) => s.set({ engine: e.target.value, candidates: [], routeDirty: true })} data-testid="engine-select">
                {engines.map((e) => (
                  <MenuItem key={e.id} value={e.id}>
                    {engineLabel(e, t)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Stack direction="row" spacing={1}>
            <FormControl size="small" fullWidth>
              <InputLabel id="ride-type">{t('planner.rideType')}</InputLabel>
              <Select labelId="ride-type" label={t('planner.rideType')} value={s.rideType} onChange={(e) => s.set({ rideType: e.target.value as RideType, candidates: [], routeDirty: true })}>
                {RIDE_TYPES.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {t(r.label)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="pref">{t('planner.preference')}</InputLabel>
              <Select labelId="pref" label={t('planner.preference')} value={s.preference} onChange={(e) => s.set({ preference: e.target.value as RoutePreference, candidates: [], routeDirty: true })}>
                {PREFS.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {t(r.label)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <SearchBox placeholder={t('planner.addSearch')} onSelect={(r) => s.addWaypoint([r.lon, r.lat], r.label.split(',').slice(0, 2).join(','))} />
            </Box>
            <Tooltip title={locationStart.locating ? t('planner.locating') : t('planner.myLocationTip')}>
              <span>
                <IconButton aria-label={t('planner.myLocationTip')} onClick={locationStart.start} disabled={locationStart.locating} data-testid="location-start">
                  {locationStart.locating ? <CircularProgress size={20} /> : <MyLocationIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">
              {t('planner.points')}
            </Typography>
            {s.waypoints.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('planner.pointsEmpty')}
              </Typography>
            )}
            <List dense disablePadding data-testid="waypoint-list">
              {s.waypoints.map((w, i) => (
                <ListItem
                  key={w.id}
                  disableGutters
                  secondaryAction={
                    <Box>
                      <IconButton size="small" aria-label={t('planner.up')} disabled={i === 0} onClick={() => s.reorderWaypoint(i, i - 1)}>
                        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" aria-label={t('planner.down')} disabled={i === s.waypoints.length - 1} onClick={() => s.reorderWaypoint(i, i + 1)}>
                        <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" aria-label={t('planner.removePoint')} onClick={() => s.removeWaypoint(w.id)}>
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  }
                  sx={{ pr: 12 }}
                >
                  <Chip
                    size="small"
                    label={i === 0 ? t('wp.start') : i === s.waypoints.length - 1 ? t('wp.end') : i}
                    sx={{ mr: 1, bgcolor: i === 0 ? '#16a34a' : i === s.waypoints.length - 1 ? '#dc2626' : '#0ea5e9', color: '#fff', minWidth: 28 }}
                  />
                  <TextField
                    variant="standard"
                    size="small"
                    value={w.name}
                    onChange={(e) => s.set({ waypoints: s.waypoints.map((x) => (x.id === w.id ? { ...x, name: e.target.value, autoName: false } : x)) })}
                    inputProps={{ 'aria-label': t('planner.pointName', { n: i + 1 }), style: { fontSize: 13 } }}
                    fullWidth
                  />
                </ListItem>
              ))}
            </List>
          </Box>
          <FormControlLabel
            control={<Switch size="small" checked={s.roundTrip} onChange={(e) => s.set({ roundTrip: e.target.checked, candidates: [], routeDirty: true })} />}
            label={<Typography variant="body2">{t('planner.roundTrip')}</Typography>}
          />
          {s.roundTrip && (
            <Box data-testid="loop-length">
              <Typography variant="body2" id="loop-length-label">
                {t('planner.loopLength', { km: s.targetKm })}
              </Typography>
              <Slider
                size="small"
                min={5}
                max={100}
                step={1}
                value={s.targetKm}
                onChange={(_, v) => s.set({ targetKm: v as number })}
                onChangeCommitted={() => s.set({ candidates: [], routeDirty: true })}
                aria-labelledby="loop-length-label"
              />
              <Typography variant="caption" color="text.secondary">
                {s.waypoints.length <= 1 ? t('planner.loopHintOne') : t('planner.loopHintMany')}
              </Typography>
            </Box>
          )}
          <Button variant="text" size="small" onClick={loadExample} data-testid="load-example">
            {t('planner.example', { name: EXAMPLE_ROUTE.name })}
          </Button>

          {scored.length > 0 && (
            <>
              <Divider />
              <Typography variant="overline" color="text.secondary">
                {t('planner.variants', { n: scored.length })}
              </Typography>
              <Stack spacing={1} data-testid="candidates">
                {scored.map(({ c, analysis, score, gain }, i) => (
                  <Card key={c.id} variant="outlined" sx={{ borderColor: c.id === s.selectedCandidateId ? 'primary.main' : 'divider' }}>
                    <CardActionArea onClick={() => selectCandidate(c)} sx={{ p: 1.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" noWrap>
                            {t('planner.variant', { n: i + 1 })} · <b>{fmtKm(c.distance)}</b>
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap component="div">
                            ~{fmtDuration(c.duration)}
                            {gain !== null && ` · ↑ ${Math.round(gain)} m`}
                            {c.targetDistance ? ` · ${t('planner.loopTarget', { km: fmtKm(c.targetDistance) })}` : ''}
                          </Typography>
                        </Box>
                        {score && <Chip size="small" label={t('planner.score', { v: Math.round(score.score) })} color={i === 0 ? 'primary' : 'default'} />}
                      </Box>
                      {analysis && (
                        <>
                          <Box sx={{ my: 0.75 }}>
                            <GroupBar analysis={analysis} height={8} />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('planner.withRecord', { pct: fmtPct(score?.infraShare ?? 0), variant: variantLabel(c, t) })}
                          </Typography>
                        </>
                      )}
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
              {scored[0]?.score && (
                <Typography variant="caption" color="text.secondary">
                  {t(`score.${scored[0].score.explanation}`)}{t('planner.scoreNote')}
                </Typography>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { fontSize: 12.5 } }}>
            {t('planner.manualInfoA')}
            <b>{t('planner.manualInfoB')}</b>
            {t('planner.manualInfoC')}
          </Alert>
          <Typography variant="body2">{t('planner.vertices', { n: s.manualLine.length })}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="contained" onClick={useManual} disabled={s.manualLine.length < 2}>
              {t('planner.analyseSketch')}
            </Button>
            <Button size="small" startIcon={<UndoIcon />} onClick={() => s.set({ manualLine: s.manualLine.slice(0, -1) })} disabled={!s.manualLine.length}>
              {t('planner.undo')}
            </Button>
            <Button
              size="small"
              color="error"
              onClick={() => s.set({ manualLine: [], activeRoute: manualActive ? null : s.activeRoute })}
              disabled={!s.manualLine.length}
            >
              {t('planner.clear')}
            </Button>
          </Stack>
        </>
      )}

      {s.activeRoute && s.activeRoute.kind !== 'gpx' && (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<DownloadIcon />} onClick={exportGpx} data-testid="planner-export">
            {t('planner.export')}
          </Button>
          <Button size="small" startIcon={<SaveIcon />} onClick={saveCurrent}>
            {t('planner.save')}
          </Button>
          {canShare && (
            <Tooltip title={t('planner.shareTip')}>
              <Button size="small" startIcon={<ShareIcon />} onClick={sharePlan} data-testid="planner-share">
                {t('planner.share')}
              </Button>
            </Tooltip>
          )}
        </Stack>
      )}

      {selected?.analysis && s.activeRoute?.kind === 'calculated' && (
        <RouteStats analysis={selected.analysis} elevation={selected.c.elevation ? elevationStats(selected.c.elevation) : null} compact />
      )}

      {osmBreakdown && osmBreakdown.length > 0 && (
        <Box data-testid="osm-breakdown">
          <Typography variant="overline" color="text.secondary">
            {t('planner.osmTitle')}
          </Typography>
          {osmBreakdown.map((b) => (
            <Box key={b.cls} sx={{ display: 'flex', fontSize: 13 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {b.label}
              </Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtDistance(b.length)}
              </Typography>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">
            {t('planner.osmNote')}
          </Typography>
        </Box>
      )}

      {s.savedRoutes.length > 0 && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary">
            {t('planner.savedRoutes')}
          </Typography>
          <List dense disablePadding>
            {s.savedRoutes.map((r) => (
              <ListItem
                key={r.id}
                disableGutters
                secondaryAction={
                  <IconButton size="small" aria-label={t('planner.deleteSaved')} onClick={() => s.deleteSavedRoute(r.id)}>
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

      {s.plannerMode === 'auto' && (
        <Box
          data-testid="planner-actions"
          sx={{
            position: 'sticky',
            bottom: 0,
            mx: -2,
            mb: -2,
            px: 2,
            py: 1,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap data-testid="planner-status" sx={{ fontWeight: selected ? 700 : 400 }}>
              {routeMut.isPending
                ? s.roundTrip && s.waypoints.length === 1
                  ? t('planner.st.loops')
                  : t('planner.st.calculating')
                : s.waypoints.length === 0
                  ? s.roundTrip
                    ? t('planner.st.tapLoop')
                    : t('planner.st.tapStart')
                  : s.waypoints.length === 1 && !s.roundTrip
                    ? t('planner.st.tapEnd')
                    : selected
                      ? `${fmtKm(selected.c.distance)} · ~${fmtDuration(selected.c.duration)}`
                      : !routingAvailable
                        ? t('planner.st.unavailable')
                        : t('planner.st.none')}
            </Typography>
            {selected?.analysis && !routeMut.isPending && (
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {t('planner.st.offRoad', { pct: fmtPct(selected.analysis.byGroup.filter((g) => g.key === 'dedicated' || g.key === 'shared').reduce((a, g) => a + g.share, 0)) })}
                {scored.length > 1 && t('planner.st.more', { n: scored.length })}
              </Typography>
            )}
          </Box>
          {routeMut.isPending && <CircularProgress size={20} />}
          <Tooltip title={t('planner.recalc')}>
            <span>
              <IconButton
                aria-label={t('planner.recalc')}
                data-testid="calculate-route"
                disabled={!routingAvailable || routeMut.isPending || (s.waypoints.length < 2 && !(s.roundTrip && s.waypoints.length === 1))}
                onClick={() => calculate()}
              >
                <DirectionsBikeIcon />
              </IconButton>
            </span>
          </Tooltip>
          {canShare && (
            <Tooltip title={t('planner.shareTip')}>
              <IconButton aria-label={t('planner.share')} onClick={sharePlan} data-testid="planner-share-icon">
                <ShareIcon />
              </IconButton>
            </Tooltip>
          )}
          {s.activeRoute && s.activeRoute.kind !== 'gpx' && (
            <Tooltip title={t('planner.export')}>
              <IconButton aria-label={t('planner.exportGpx')} onClick={exportGpx}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t('planner.clearTip')}>
            <span>
              <IconButton aria-label={t('planner.clearPlan')} onClick={s.clearPlanner} disabled={!s.waypoints.length && !s.candidates.length}>
                <ClearAllIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}
    </Stack>
  );
}
