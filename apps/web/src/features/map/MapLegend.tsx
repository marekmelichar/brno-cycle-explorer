import { useState } from 'react';
import { Box, ButtonBase, Collapse, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import { CATEGORIES, CATEGORY_ORDER, UNMATCHED_LABEL } from '@bce/shared';
import { useAppStore } from '../../store/useAppStore';
import { LineSwatch } from '../../components/LineSwatch';

function LegendContent() {
  const visible = useAppStore((s) => s.visibleCategories);
  const showInfra = useAppStore((s) => s.showInfra);
  const hasRoute = useAppStore((s) => !!s.activeRoute);
  // With a route on the map, the route uses the same colours, so list every class it can show.
  const shown = CATEGORY_ORDER.filter((c) => c !== 'not_infrastructure' && (hasRoute || (showInfra && visible[c])));
  return (
    <>
      {hasRoute && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.5 }}>
          Barva úseku trasy = typ oficiálního opatření, po kterém vede.
        </Typography>
      )}
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
          <svg width={28} height={10} aria-hidden="true" style={{ flexShrink: 0 }}>
            <line x1={1} y1={5} x2={27} y2={5} stroke="#0b1220" strokeWidth={7} />
            <line x1={1} y1={5} x2={27} y2={5} stroke="#f1f5f9" strokeWidth={4} strokeDasharray="5 4" />
          </svg>
          <Typography variant="caption">Trasa: {UNMATCHED_LABEL}</Typography>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, fontSize: 10.5 }}>
        Zdroj: oficiální data města Brna. Nezaznamenané úseky nemusí být nesjízdné. Klepnutím na úsek zobrazíte detail.
      </Typography>
    </>
  );
}

export function MapLegend() {
  const [open, setOpen] = useState(() => window.innerWidth >= 900);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      {/* Desktop / tablet: collapsible panel bottom-right */}
      <Paper
        data-testid="map-legend"
        elevation={4}
        sx={{ position: 'absolute', right: 10, bottom: 36, zIndex: 2, px: 1.25, py: 0.75, maxWidth: 270, maxHeight: 'calc(100% - 240px)', overflowY: 'auto', display: { xs: 'none', sm: 'block' } }}
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
          <LegendContent />
        </Collapse>
      </Paper>

      {/* Phone: a map-control-style button under the zoom/location controls, opening an overlay */}
      <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
        {!mobileOpen && (
          <ButtonBase
            onClick={() => setMobileOpen(true)}
            aria-label="Zobrazit legendu"
            data-testid="legend-button"
            sx={{
              position: 'absolute',
              right: 10,
              top: 152,
              zIndex: 2,
              width: 32,
              height: 32,
              bgcolor: '#fff',
              color: '#333',
              borderRadius: '4px',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
            }}
          >
            <FormatListBulletedIcon sx={{ fontSize: 20 }} />
          </ButtonBase>
        )}
        {mobileOpen && (
          <Paper
            elevation={8}
            data-testid="map-legend-mobile"
            sx={{
              position: 'absolute',
              left: 10,
              right: 10,
              top: 10,
              zIndex: 6,
              px: 1.5,
              py: 1,
              maxHeight: 'calc(100% - 130px)',
              overflow: 'auto',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="overline" sx={{ flex: 1 }}>
                Legenda
              </Typography>
              <IconButton size="small" onClick={() => setMobileOpen(false)} aria-label="Zavřít legendu">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            <LegendContent />
          </Paper>
        )}
      </Box>
    </>
  );
}
