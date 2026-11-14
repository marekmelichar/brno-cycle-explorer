import { useState } from 'react';
import { Box, Button, ButtonBase, ClickAwayListener, Paper, Slider, Typography } from '@mui/material';
import OpacityIcon from '@mui/icons-material/Opacity';
import { useAppStore } from '../../store/useAppStore';

export const MIN_OVERLAY_OPACITY = 0.15;

/**
 * Map control: opens a slider that sets the opacity of all overlay lines (route, infrastructure,
 * highlights), so the roads and street names underneath show through as much as the user wants.
 */
export function SeeThroughButton() {
  const value = useAppStore((s) => s.overlayOpacity);
  const set = useAppStore((s) => s.set);
  const [open, setOpen] = useState(false);
  const dimmed = value < 0.999;
  const pct = Math.round(value * 100);

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'absolute', right: 10, top: 152, zIndex: 3 }}>
        <ButtonBase
          onClick={() => setOpen(!open)}
          aria-label={`Průhlednost čar (neprůhlednost ${pct} %)`}
          aria-expanded={open}
          title="Průhlednost čar"
          data-testid="see-through-button"
          sx={{
            width: 32,
            height: 32,
            borderRadius: '4px',
            bgcolor: dimmed ? '#2dd4bf' : '#fff',
            color: dimmed ? '#06201d' : '#333',
            boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          }}
        >
          <OpacityIcon sx={{ fontSize: 20 }} />
        </ButtonBase>
        {open && (
          <Paper
            elevation={8}
            data-testid="opacity-panel"
            sx={{ position: 'absolute', right: 40, top: 0, width: 230, px: 2, pt: 1, pb: 0.5 }}
          >
            <Typography variant="caption" id="overlay-opacity-label" component="div">
              Neprůhlednost čar: <b>{pct} %</b>
            </Typography>
            <Slider
              size="small"
              min={MIN_OVERLAY_OPACITY}
              max={1}
              step={0.05}
              value={value}
              onChange={(_, v) => set({ overlayOpacity: v as number })}
              aria-labelledby="overlay-opacity-label"
              valueLabelDisplay="off"
            />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Nižší = víc vidět silnice
              </Typography>
              <Button size="small" onClick={() => set({ overlayOpacity: 1 })} disabled={!dimmed} sx={{ minWidth: 0 }}>
                100 %
              </Button>
            </Box>
          </Paper>
        )}
      </Box>
    </ClickAwayListener>
  );
}
