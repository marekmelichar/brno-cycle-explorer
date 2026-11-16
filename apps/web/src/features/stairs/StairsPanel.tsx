import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  Slider,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { Stair } from '@bce/shared';
import { surfaceLabel } from '@bce/geo';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../i18n';
import { usePlanToStair, useStairs, useStepsLabel } from '../../hooks/useStairs';
import { fmtDate, fmtDistance } from '../../services/format';
import { linesBounds } from '../../services/geometry';
import { mapCenter } from '../../services/mapHandle';

const LIST_LIMIT = 60;
const STAIR_COLOR = '#d21fd2';

export function StairsPanel() {
  const { t, lang } = useI18n();
  const view = useStairs();
  const filters = useAppStore((s) => s.stairFilters);
  const sort = useAppStore((s) => s.stairSort);
  const origin = useAppStore((s) => s.stairOrigin);
  const selectedId = useAppStore((s) => s.selectedStairId);
  const set = useAppStore((s) => s.set);
  const fitTo = useAppStore((s) => s.fitTo);
  const stepsLabel = useStepsLabel();
  const [locating, setLocating] = useState(false);
  const selected = view.all.find((s) => s.id === selectedId) ?? null;

  const setFilters = (p: Partial<typeof filters>) => set({ stairFilters: { ...filters, ...p } });

  const sortByDistance = () => {
    set({ stairSort: 'distance' });
    const fallback = () => {
      const c = mapCenter();
      if (c) set({ stairOrigin: { position: c, fromLocation: false } });
    };
    if (!('geolocation' in navigator)) return fallback();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set({ stairOrigin: { position: [pos.coords.longitude, pos.coords.latitude], fromLocation: true } });
      },
      () => {
        setLocating(false);
        fallback();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
    );
  };

  const select = (s: Stair) => {
    // phone: lower the sheet so the stairs are visible on the map, then show the detail
    set({ selectedStairId: s.id, ...(window.matchMedia?.('(max-width:899px)').matches ? { sheet: 'half' as const } : {}) });
    requestAnimationFrame(() => document.querySelector('[data-testid="stair-detail"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    const b = linesBounds(s.lines);
    if (b) fitTo(b);
  };

  const meta = view.data?.meta;
  return (
    <Stack spacing={1.5} sx={{ p: 2 }} data-testid="stairs-panel">
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t('stairs.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('stairs.intro')}
        </Typography>
      </Box>
      <Alert severity="info" variant="outlined" icon={<WarningAmberIcon fontSize="small" />} sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12.5 } }}>
        {t('stairs.safety')}
      </Alert>

      <Box data-testid="stairs-source">
        {view.mode === 'osm' && meta ? (
          <Typography variant="caption" color="text.secondary" component="div">
            {t('stairs.sourceOsm', { count: meta.count, date: fmtDate(meta.osmTimestamp ?? meta.lastRefreshed) })}
          </Typography>
        ) : view.pending ? (
          <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ '& .MuiAlert-message': { fontSize: 12.5 } }}>
            {t('stairs.sourcePending')}
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ '& .MuiAlert-message': { fontSize: 12.5 } }} data-testid="stairs-fallback">
            {t('stairs.sourceTiles')}
          </Alert>
        )}
      </Box>

      {selected && (
        <StairDetail
          stair={selected}
          distance={origin ? view.list.find((x) => x.stair.id === selected.id)?.distance ?? null : null}
          tileData={view.mode === 'tiles'}
          onClose={() => set({ selectedStairId: null })}
        />
      )}

      <Box>
        <Typography variant="body2" id="stairs-min-label" color={view.mode === 'osm' ? 'text.primary' : 'text.disabled'}>
          {filters.minSteps > 0 ? t('stairs.minSteps', { n: filters.minSteps }) : t('stairs.minStepsAny')}
        </Typography>
        <Slider
          size="small"
          min={0}
          max={80}
          step={5}
          value={filters.minSteps}
          disabled={view.mode !== 'osm'}
          onChange={(_, v) => setFilters({ minSteps: v as number })}
          aria-labelledby="stairs-min-label"
        />
        {view.mode !== 'osm' && (
          <Typography variant="caption" color="text.secondary">
            {t('stairs.minStepsTilesOff')}
          </Typography>
        )}
      </Box>
      <FormControlLabel
        control={<Switch size="small" checked={filters.outdoorOnly} onChange={(e) => setFilters({ outdoorOnly: e.target.checked })} />}
        label={<Typography variant="body2">{t('stairs.outdoorOnly')}</Typography>}
      />
      <FormControlLabel
        control={<Switch size="small" checked={filters.hideNoBicycle} onChange={(e) => setFilters({ hideNoBicycle: e.target.checked })} />}
        label={<Typography variant="body2">{t('stairs.hideNoBicycle')}</Typography>}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={sort}
          onChange={(_, v) => (v === 'distance' ? sortByDistance() : v && set({ stairSort: v }))}
          aria-label={t('stairs.sortLabel')}
        >
          <ToggleButton value="size">{t('stairs.sortSize')}</ToggleButton>
          <ToggleButton value="distance" data-testid="stairs-sort-distance">
            {t('stairs.sortDistance')}
          </ToggleButton>
        </ToggleButtonGroup>
        {locating && <CircularProgress size={18} />}
      </Box>
      {sort === 'distance' && origin && (
        <Typography variant="caption" color="text.secondary">
          {origin.fromLocation ? t('stairs.originLocation') : t('stairs.originMap')}
        </Typography>
      )}

      <Divider />
      <Typography variant="overline" color="text.secondary" data-testid="stairs-count">
        {t('stairs.count', { shown: Math.min(view.list.length, LIST_LIMIT), total: view.list.length })}
      </Typography>
      {view.list.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {view.mode === 'tiles' ? t('stairs.emptyTiles') : t('stairs.empty')}
        </Typography>
      )}
      <Stack spacing={1} data-testid="stairs-list">
        {view.list.slice(0, LIST_LIMIT).map(({ stair: s, distance }) => (
          <Card key={s.id} variant="outlined" sx={{ borderColor: s.id === selectedId ? STAIR_COLOR : 'divider' }}>
            <CardActionArea onClick={() => select(s)} sx={{ p: 1.25 }} data-testid="stair-item">
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="subtitle2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                  {s.name ?? t('stairs.unnamed')}
                  {stepsLabel(s) && <b> · {stepsLabel(s)}</b>}
                </Typography>
                {distance !== null && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDistance(distance)}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                {s.drop !== null && (
                  <Tooltip title={t('stairs.dropTip')}>
                    <Chip size="small" label={t('stairs.drop', { m: s.drop.toLocaleString() })} />
                  </Tooltip>
                )}
                <Chip size="small" variant="outlined" label={t('stairs.length', { d: fmtDistance(s.length) })} />
                {s.surface && <Chip size="small" variant="outlined" label={surfaceLabel(s.surface, lang)} />}
                {s.bicycle === 'no' && <Chip size="small" color="warning" variant="outlined" label={t('stairs.noBicycle')} />}
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
      {view.data?.meta.lastError && view.mode === 'tiles' && !view.pending && (
        <Typography variant="caption" color="text.secondary">
          {t('stairs.error', { msg: view.data.meta.lastError.message })}
          {view.data.meta.nextRetryAt && ` ${t('stairs.nextRetry', { time: new Date(view.data.meta.nextRetryAt).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'cs-CZ', { hour: '2-digit', minute: '2-digit' }) })}`}
        </Typography>
      )}
    </Stack>
  );
}

function StairDetail({ stair: s, distance, tileData, onClose }: { stair: Stair; distance: number | null; tileData: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const stepsLabel = useStepsLabel();
  const { plan, locating } = usePlanToStair();
  const bool = (v: boolean | null) => (v === null ? t('stairs.unknown') : v ? t('stairs.yes') : t('stairs.no'));
  const rows: Array<[string, string]> = [
    [t('stairs.attr.steps'), stepsLabel(s) ?? t('stairs.unknown')],
    [t('stairs.attr.drop'), s.drop !== null ? `≈ ${s.drop.toLocaleString()} m` : t('stairs.unknown')],
    [t('stairs.attr.length'), fmtDistance(s.length)],
    [t('stairs.attr.surface'), s.surface ? surfaceLabel(s.surface, lang) : t('stairs.unknown')],
    [t('stairs.attr.width'), s.width !== null ? `${s.width.toLocaleString()} m` : t('stairs.unknown')],
    [t('stairs.attr.handrail'), bool(s.handrail)],
    [t('stairs.attr.lit'), bool(s.lit)],
    [t('stairs.attr.ramp'), bool(s.ramp)],
    [t('stairs.attr.bicycle'), s.bicycle ?? t('stairs.unknown')],
    [t('stairs.attr.top'), s.top ? t('stairs.topKnown') : t('stairs.topUnknown')],
    ...(s.osmIds.length > 1 ? [[t('stairs.attr.flights'), String(s.osmIds.length)] as [string, string]] : []),
  ];
  return (
    <Card variant="outlined" sx={{ borderColor: STAIR_COLOR }} data-testid="stair-detail" aria-label={t('stairs.details')}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, pt: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
          {s.name ?? t('stairs.unnamed')}
          {distance !== null && (
            <Typography component="span" variant="caption" color="text.secondary">
              {' '}
              · {fmtDistance(distance)}
            </Typography>
          )}
        </Typography>
        <IconButton size="small" aria-label={t('stairs.close')} onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Table size="small">
        <TableBody>
          {rows.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell sx={{ color: 'text.secondary', width: '45%', py: 0.4 }}>{k}</TableCell>
              <TableCell sx={{ py: 0.4 }}>{v}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box sx={{ px: 1.5, py: 1 }}>
        {s.stepCountPartial && (
          <Typography variant="caption" color="text.secondary" component="div">
            {t('stairs.partialNote')}
          </Typography>
        )}
        {tileData && (
          <Typography variant="caption" color="text.secondary" component="div">
            {t('stairs.tileNote')}
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Tooltip title={t('stairs.planHereTip')}>
            <span>
              <Button size="small" variant="contained" startIcon={locating ? <CircularProgress size={14} /> : <DirectionsBikeIcon />} onClick={() => plan(s)} disabled={locating} data-testid="stair-plan">
                {t('stairs.planHere')}
              </Button>
            </span>
          </Tooltip>
          {s.osmIds[0] !== undefined && (
            <Button size="small" component={Link} href={`https://www.openstreetmap.org/way/${s.osmIds[0]}`} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon fontSize="small" />}>
              {t('stairs.openOsm')}
            </Button>
          )}
        </Stack>
      </Box>
    </Card>
  );
}
