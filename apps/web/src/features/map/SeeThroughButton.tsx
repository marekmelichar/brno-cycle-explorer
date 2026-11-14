import { ButtonBase, Tooltip } from '@mui/material';
import OpacityIcon from '@mui/icons-material/Opacity';
import { useAppStore } from '../../store/useAppStore';

/** Map control: toggles see-through overlay lines so the roads underneath stay visible. */
export function SeeThroughButton() {
  const on = useAppStore((s) => s.seeThrough);
  const set = useAppStore((s) => s.set);
  const label = on ? 'Plné čáry' : 'Průhledné čáry (zobrazit silnice pod nimi)';
  return (
    <Tooltip title={label} placement="left">
      <ButtonBase
        onClick={() => set({ seeThrough: !on })}
        aria-label={label}
        aria-pressed={on}
        data-testid="see-through-button"
        sx={{
          position: 'absolute',
          right: 10,
          // under zoom + location controls; on phones also under the legend button
          top: { xs: 190, sm: 152 },
          zIndex: 2,
          width: 32,
          height: 32,
          borderRadius: '4px',
          bgcolor: on ? '#2dd4bf' : '#fff',
          color: on ? '#06201d' : '#333',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
        }}
      >
        <OpacityIcon sx={{ fontSize: 20 }} />
      </ButtonBase>
    </Tooltip>
  );
}
