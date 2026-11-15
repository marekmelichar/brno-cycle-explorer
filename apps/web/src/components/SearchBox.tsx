import { useEffect, useState } from 'react';
import { Autocomplete, CircularProgress, InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GeocodeResult } from '@bce/shared';
import { api } from '../services/api';

interface Props {
  onSelect: (r: GeocodeResult) => void;
  placeholder?: string;
  size?: 'small' | 'medium';
  dense?: boolean;
  autoFocus?: boolean;
}

/** Debounced (600 ms, ≥ 3 characters) geocoding – requests only while the user types. */
export function SearchBox({ onSelect, placeholder = 'Hledat místo nebo adresu v Brně…', size = 'small', autoFocus }: Props) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 3) {
      setOptions([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.geocode(q, ctrl.signal);
        setOptions(res.results);
        setError(res.results.length ? null : 'Nic nenalezeno.');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [input]);

  return (
    <Autocomplete
      size={size}
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={error ?? (input.trim().length < 3 ? 'Zadejte alespoň 3 znaky' : 'Hledám…')}
      loading={loading}
      loadingText="Hledám…"
      onInputChange={(_, v, reason) => reason !== 'reset' && setInput(v)}
      onChange={(_, v) => v && onSelect(v)}
      blurOnSelect
      clearOnBlur={false}
      sx={{ minWidth: 220 }}
      renderOption={(props, o) => (
        <li {...props} key={o.id} style={{ fontSize: 13 }}>
          {o.label}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          autoFocus={autoFocus}
          inputProps={{ ...params.inputProps, 'aria-label': placeholder }}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
