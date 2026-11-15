import { ButtonBase, Tooltip } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../i18n';

/** Solid route colour for the plain mode: magenta is not used by any infrastructure layer. */
export const SIMPLE_ROUTE_COLOR = '#e600a8';

/** Map control (only with a route on the map): smart colours by infrastructure ⇄ one plain colour. */
export function RouteColorButton() {
  const hasRoute = useAppStore((s) => !!s.activeRoute);
  const mode = useAppStore((s) => s.routeColorMode);
  const set = useAppStore((s) => s.set);
  const { t } = useI18n();
  if (!hasRoute) return null;
  const simple = mode === 'simple';
  const label = simple ? t('routeColor.toSmart') : t('routeColor.toSimple');
  return (
    <Tooltip title={label} placement="left">
      <ButtonBase
        onClick={() => set({ routeColorMode: simple ? 'smart' : 'simple' })}
        aria-label={label}
        aria-pressed={simple}
        data-testid="route-color-button"
        sx={{
          position: 'absolute',
          right: 10,
          top: 190,
          zIndex: 2,
          width: 32,
          height: 32,
          borderRadius: '4px',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          bgcolor: simple ? SIMPLE_ROUTE_COLOR : '#fff',
          color: simple ? '#fff' : '#333',
        }}
      >
        <PaletteIcon sx={{ fontSize: 20 }} />
      </ButtonBase>
    </Tooltip>
  );
}
