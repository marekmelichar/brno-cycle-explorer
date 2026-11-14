import { useState } from 'react';
import { Box, Collapse, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CATEGORIES, CATEGORY_ORDER, UNMATCHED_LABEL } from '@bce/shared';
import { useAppStore } from '../../store/useAppStore';
import { LineSwatch } from '../../components/LineSwatch';

export function MapLegend() {
  const visible = useAppStore((s) => s.visibleCategories);
  const showInfra = useAppStore((s) => s.showInfra);
  const hasRoute = useAppStore((s) => !!s.activeRoute);
  const [open, setOpen] = useState(() => window.innerWidth >= 900);
  const shown = CATEGORY_ORDER.filter((c) => showInfra && visible[c]);
  return (
    <Paper
      data-testid="map-legend"
      elevation={4}
      sx={{ position: 'absolute', right: 10, bottom: 36, zIndex: 2, px: 1.25, py: 0.75, maxWidth: 270, display: { xs: 'none', sm: 'block' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography variant="overline" sx={{ flex: 1, lineHeight: 1.6 }}>
          Legenda
        </Typography>
        <IconButton size="small" onClick={() => setOpen(!open)} aria-label={open ? 'Sbalit legendu' : 'Rozbalit legendu'}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        {shown.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            Žádná vrstva není zapnutá.
          </Typography>
        )}
        {shown.map((c) => (
          <Tooltip key={c} title={CATEGORIES[c].description} placement="left">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.2 }}>
              <LineSwatch category={c} />
              <Typography variant="caption">{CATEGORIES[c].label}</Typography>
            </Box>
          </Tooltip>
        ))}
        {hasRoute && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.2, mt: 0.5 }}>
            <svg width={28} height={10} aria-hidden="true">
              <line x1={1} y1={5} x2={27} y2={5} stroke="#0b1220" strokeWidth={7} />
              <line x1={1} y1={5} x2={27} y2={5} stroke="#f1f5f9" strokeWidth={4} strokeDasharray="5 4" />
            </svg>
            <Typography variant="caption">Trasa: {UNMATCHED_LABEL}</Typography>
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, fontSize: 10.5 }}>
          Zdroj: oficiální data města Brna. Nezaznamenané úseky nemusí být nesjízdné.
        </Typography>
      </Collapse>
    </Paper>
  );
}
