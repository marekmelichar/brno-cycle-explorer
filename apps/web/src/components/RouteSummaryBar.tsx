import { Box, ButtonBase, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useActiveAnalysis } from '../hooks/data';
import { useAppStore } from '../store/useAppStore';
import { fmtKm, fmtPct } from '../services/format';
import { GroupBar } from './RouteStats';

/** One-line route summary for the collapsed mobile sheet; tapping it opens the sheet. */
export function RouteSummaryBar({ onOpen }: { onOpen: () => void }) {
  const active = useAppStore((s) => s.activeRoute);
  const analysis = useActiveAnalysis();
  if (!active || !analysis) return null;
  const offRoad = analysis.byGroup.filter((g) => g.key === 'dedicated' || g.key === 'shared').reduce((a, g) => a + g.share, 0);
  return (
    <ButtonBase
      onClick={onOpen}
      data-testid="peek-summary"
      aria-label={`Trasa ${fmtKm(analysis.totalLength)}, mimo vozovku ${fmtPct(offRoad)}. Zobrazit podrobnosti.`}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, height: 44, width: '100%', textAlign: 'left', flexShrink: 0 }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        {fmtKm(analysis.totalLength)}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 40 }}>
        <GroupBar analysis={analysis} height={8} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        mimo vozovku {fmtPct(offRoad)}
      </Typography>
      <ExpandLessIcon fontSize="small" />
    </ButtonBase>
  );
}
