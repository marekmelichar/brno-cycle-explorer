import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Slider, TextField, Typography } from '@mui/material';
import { DEFAULT_MATCH_OPTIONS, type MatchOptions } from '@bce/geo';
import { useAppConfig } from '../hooks/data';
import { useAppStore } from '../store/useAppStore';
import { useNotify } from './Notifier';
import { setLang, useI18n } from '../i18n';

const FIELDS: Array<{ key: keyof MatchOptions; label: string; help: string; min: number; max: number; step: number; unit: string }> = [
  { key: 'tolerance', label: 'settings.f.tolerance.label', help: 'settings.f.tolerance.help', min: 3, max: 40, step: 1, unit: 'm' },
  { key: 'maxAngle', label: 'settings.f.maxAngle.label', help: 'settings.f.maxAngle.help', min: 10, max: 60, step: 5, unit: '°' },
  { key: 'step', label: 'settings.f.step.label', help: 'settings.f.step.help', min: 2, max: 25, step: 1, unit: 'm' },
  { key: 'maxGapFill', label: 'settings.f.maxGapFill.label', help: 'settings.f.maxGapFill.help', min: 0, max: 30, step: 1, unit: 'm' },
  { key: 'minRunLength', label: 'settings.f.minRunLength.label', help: 'settings.f.minRunLength.help', min: 0, max: 60, step: 5, unit: 'm' },
];

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const opts = useAppStore((s) => s.matchOptions);
  const basemapId = useAppStore((s) => s.basemapId);
  const set = useAppStore((s) => s.set);
  const reset = useAppStore((s) => s.resetSettings);
  const { data: config } = useAppConfig();
  const notify = useNotify();
  const { t, lang } = useI18n();
  return (
    <Dialog open={open} onClose={() => set({ settingsOpen: false })} maxWidth="xs" fullWidth>
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <DialogContent>
        <TextField
          select
          fullWidth
          size="small"
          label={t('top.language')}
          value={lang}
          onChange={(e) => setLang(e.target.value as 'cs' | 'en')}
          sx={{ mt: 1, mb: 2 }}
          data-testid="lang-select"
        >
          <MenuItem value="cs">Čeština</MenuItem>
          <MenuItem value="en">English</MenuItem>
        </TextField>
        {config && (
          <TextField
            select
            fullWidth
            size="small"
            label={t('top.basemap')}
            value={basemapId ?? config.defaultBasemap}
            onChange={(e) => set({ basemapId: e.target.value })}
            sx={{ mt: 1, mb: 2 }}
          >
            {config.basemaps.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {t(`basemap.${b.id}`, { defaultValue: b.label })}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Typography variant="subtitle2" gutterBottom>
          {t('settings.matching')}
        </Typography>
        {FIELDS.map((f) => (
          <Box key={f.key} sx={{ mb: 1 }}>
            <Typography variant="body2" id={`set-${f.key}`}>
              {t(f.label)}: <b>{opts[f.key]} {f.unit}</b>
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
              {t(f.help)} {t('settings.default')}: {DEFAULT_MATCH_OPTIONS[f.key]} {f.unit}
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
            notify(t('settings.cleared'), 'success');
          }}
        >
          {t('settings.clearLocal')}
        </Button>
        <Button onClick={reset}>{t('settings.reset')}</Button>
        <Button variant="contained" onClick={() => set({ settingsOpen: false })}>
          {t('settings.done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
