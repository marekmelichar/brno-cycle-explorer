import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Slider, TextField, Typography } from '@mui/material';
import { DEFAULT_MATCH_OPTIONS, type MatchOptions } from '@bce/geo';
import { useAppConfig } from '../hooks/data';
import { useAppStore } from '../store/useAppStore';
import { useNotify } from './Notifier';

const FIELDS: Array<{ key: keyof MatchOptions; label: string; help: string; min: number; max: number; step: number; unit: string }> = [
  { key: 'tolerance', label: 'Tolerance vzdálenosti', help: 'Max. boční odstup trasy od linie opatření.', min: 3, max: 40, step: 1, unit: 'm' },
  { key: 'maxAngle', label: 'Max. odchylka směru', help: 'Větší odchylka = křížení, ne souběh.', min: 10, max: 60, step: 5, unit: '°' },
  { key: 'step', label: 'Délka analyzovaného kroku', help: 'Trasa se dělí na úseky této délky.', min: 2, max: 25, step: 1, unit: 'm' },
  { key: 'maxGapFill', label: 'Překlenutí mezer', help: 'Mezery mezi úseky stejné kategorie do této délky se přiřadí (střední jistota).', min: 0, max: 30, step: 1, unit: 'm' },
  { key: 'minRunLength', label: 'Min. délka souběhu', help: 'Kratší souběhy se považují za šum / křížení.', min: 0, max: 60, step: 5, unit: 'm' },
];

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const opts = useAppStore((s) => s.matchOptions);
  const basemapId = useAppStore((s) => s.basemapId);
  const set = useAppStore((s) => s.set);
  const reset = useAppStore((s) => s.resetSettings);
  const { data: config } = useAppConfig();
  const notify = useNotify();
  return (
    <Dialog open={open} onClose={() => set({ settingsOpen: false })} maxWidth="xs" fullWidth>
      <DialogTitle>Nastavení</DialogTitle>
      <DialogContent>
        {config && (
          <TextField
            select
            fullWidth
            size="small"
            label="Mapový podklad"
            value={basemapId ?? config.defaultBasemap}
            onChange={(e) => set({ basemapId: e.target.value })}
            sx={{ mt: 1, mb: 2 }}
          >
            {config.basemaps.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Typography variant="subtitle2" gutterBottom>
          Párování trasy s infrastrukturou
        </Typography>
        {FIELDS.map((f) => (
          <Box key={f.key} sx={{ mb: 1 }}>
            <Typography variant="body2" id={`set-${f.key}`}>
              {f.label}: <b>{opts[f.key]} {f.unit}</b>
            </Typography>
            <Slider
              size="small"
              min={f.min}
              max={f.max}
              step={f.step}
              value={opts[f.key]}
              onChange={(_, v) => set({ matchOptions: { ...opts, [f.key]: v as number } })}
              aria-labelledby={`set-${f.key}`}
            />
            <Typography variant="caption" color="text.secondary">
              {f.help} Výchozí: {DEFAULT_MATCH_OPTIONS[f.key]} {f.unit}
            </Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button
          color="error"
          onClick={() => {
            localStorage.removeItem('bce-settings-v1');
            set({ savedRoutes: [] });
            reset();
            notify('Lokálně uložená data byla smazána.', 'success');
          }}
        >
          Smazat lokální data
        </Button>
        <Button onClick={reset}>Výchozí</Button>
        <Button variant="contained" onClick={() => set({ settingsOpen: false })}>
          Hotovo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
