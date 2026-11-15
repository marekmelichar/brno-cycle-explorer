import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { NORMALIZATION_TABLE, categoryLabel } from '@bce/shared';
import { useAppConfig, useInfrastructure } from '../hooks/data';
import { useAppStore } from '../store/useAppStore';
import { LineSwatch } from './LineSwatch';
import { useI18n } from '../i18n';
import { enginesDescription } from '../services/variant';

export function SourcesDialog() {
  const open = useAppStore((s) => s.sourcesOpen);
  const set = useAppStore((s) => s.set);
  const { data: config } = useAppConfig();
  const { data } = useInfrastructure();
  const { t, lang } = useI18n();
  const counts = new Map(data?.meta.distinctTypes.map((d) => [d.value, d.count]));
  return (
    <Dialog open={open} onClose={() => set({ sourcesOpen: false })} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>{t('sources.title')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2">{t('sources.types')}</Typography>
        <Box component="ol" sx={{ fontSize: 13, pl: 2.5, mt: 0.5 }}>
          <li>
            <b>{t('sources.officialT')}</b>
            {t('sources.officialA')}
            <Link href={config?.infrastructureSource} target="_blank" rel="noreferrer">
              {t('sources.service')}
            </Link>
            {t('sources.portal')}
            <Link href="https://data.brno.cz" target="_blank" rel="noreferrer">
              data.brno.cz
            </Link>
            ).
          </li>
          <li>
            <b>{t('sources.osmT')}</b>
            {t('sources.osm')}
          </li>
          <li>
            <b>{t('sources.routesT')}</b> – {config?.routing.available ? enginesDescription(config, t) : t('sources.noRouting')}.
          </li>
          <li>
            <b>{t('sources.gpxT')}</b>
            {t('sources.gpx')}
          </li>
          <li>
            <b>{t('sources.inferredT')}</b>
            {t('sources.inferred')}
          </li>
        </Box>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t('sources.limits', { geo: config?.geocoding.attribution || '—' })}
        </Typography>
        <Typography variant="subtitle2" gutterBottom>
          {t('sources.mappingA')}
          <code>typ_opatreni</code>
          {t('sources.mappingB')}
        </Typography>
        <Table size="small" aria-label={t('sources.mappingAria')}>
          <TableHead>
            <TableRow>
              <TableCell>{t('sources.colOriginal')}</TableCell>
              <TableCell>{t('sources.colCategory')}</TableCell>
              <TableCell align="right">{t('sources.colCount')}</TableCell>
              <TableCell>{t('sources.colNote')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {NORMALIZATION_TABLE.map((r) => (
              <TableRow key={String(r.original)}>
                <TableCell sx={{ fontSize: 12 }}>{r.original ?? <i>{t('sources.empty')}</i>}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <LineSwatch category={r.category} width={20} />
                    {categoryLabel(r.category, lang)}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12 }}>{counts.get(r.original) ?? 0}</TableCell>
                <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{lang === 'en' ? r.noteEn : r.note}</TableCell>
              </TableRow>
            ))}
            {data?.meta.distinctTypes
              .filter((d) => !NORMALIZATION_TABLE.some((r) => r.original === d.value))
              .map((d) => (
                <TableRow key={`new-${d.value}`}>
                  <TableCell sx={{ fontSize: 12 }}>{d.value}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{categoryLabel('unknown', lang)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12 }}>{d.count}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: 'warning.main' }}>{t('sources.newValue')}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => set({ sourcesOpen: false })}>{t('sources.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
