import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#2dd4bf', contrastText: '#06201d' },
    secondary: { main: '#38bdf8' },
    background: { default: '#0b1220', paper: '#121b2b' },
    divider: 'rgba(148,163,184,0.18)',
    text: { primary: '#e6ebf2', secondary: '#9fb0c3' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSize: 13,
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { letterSpacing: '0.08em', fontWeight: 600, fontSize: 10.5 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: 12, backgroundColor: '#0f1724', border: '1px solid #334155' } } },
    MuiTab: { styleOverrides: { root: { minHeight: 44, fontSize: 12.5, padding: '6px 10px', minWidth: 0 } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
    MuiTableCell: { styleOverrides: { root: { borderColor: 'rgba(148,163,184,0.12)' } } },
  },
});
