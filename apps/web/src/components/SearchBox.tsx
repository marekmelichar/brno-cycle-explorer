import { useEffect, useState } from 'react';
import { Autocomplete, CircularProgress, InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GeocodeResult } from '@bce/shared';
import { api, apiErrorText } from '../services/api';
import { useI18n } from '../i18n';

interface Props {
  onSelect: (r: GeocodeResult) => void;
  placeholder?: string;
  size?: 'small' | 'medium';
  dense?: boolean;
  autoFocus?: boolean;
}

/** Debounced (600 ms, ≥ 3 characters) geocoding – requests only while the user types. */
export function SearchBox({ onSelect, placeholder: placeholderProp, size = 'small', autoFocus }: Props) {
  const { t } = useI18n();
  const placeholder = placeholderProp ?? t('search.placeholder');
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
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const map = (window as unknown as { __bceMap?: { getBounds(): { toArray(): number[][] } } }).__bceMap;
        const b = map?.getBounds().toArray();
        const res = await api.geocode(q, ctrl.signal, b ? [b[0][0], b[0][1], b[1][0], b[1][1]] : undefined);
        setOptions(res.results);
        setError(res.results.length ? null : t('search.nothing'));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(apiErrorText(e, t));
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
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
      noOptionsText={error ?? (input.trim().length < 3 ? t('search.minChars') : t('search.searching'))}
      loading={loading}
      loadingText={t('search.searching')}
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
