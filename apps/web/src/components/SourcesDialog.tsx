import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { CATEGORIES, NORMALIZATION_TABLE } from '@bce/shared';
import { useAppConfig, useInfrastructure } from '../hooks/data';
import { useAppStore } from '../store/useAppStore';
import { LineSwatch } from './LineSwatch';

export function SourcesDialog() {
  const open = useAppStore((s) => s.sourcesOpen);
  const set = useAppStore((s) => s.set);
  const { data: config } = useAppConfig();
  const { data } = useInfrastructure();
  const counts = new Map(data?.meta.distinctTypes.map((d) => [d.value, d.count]));
  return (
    <Dialog open={open} onClose={() => set({ sourcesOpen: false })} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Zdroje dat a spolehlivost</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2">Typy dat v aplikaci</Typography>
        <Box component="ol" sx={{ fontSize: 13, pl: 2.5, mt: 0.5 }}>
          <li>
            <b>Oficiální evidovaná infrastruktura</b> – ArcGIS FeatureServer města Brna „Realizovaná cykloopatření“ (
            <Link href={config?.infrastructureSource} target="_blank" rel="noreferrer">
              služba
            </Link>
            , portál <Link href="https://data.brno.cz" target="_blank" rel="noreferrer">data.brno.cz</Link>).
          </li>
          <li>
            <b>Síťová data OSM</b> – mapový podklad OpenFreeMap / OpenMapTiles a směrovací graf (© přispěvatelé OpenStreetMap, ODbL).
          </li>
          <li>
            <b>Vypočtené trasy</b> – {config?.routing.available ? config.routing.description : 'směrování není nakonfigurováno'}.
          </li>
          <li>
            <b>Uživatelské GPX stopy</b> – zpracovávají se pouze ve vašem prohlížeči, na server se neodesílají.
          </li>
          <li>
            <b>Geometricky odvozené klasifikace</b> – přiřazení úseků trasy ke kategoriím podle vzdálenosti, směru a souběhu s oficiálními liniemi. Nejde o
            ověření v terénu.
          </li>
        </Box>
        <Typography variant="body2" color="text.secondary" paragraph>
          Městská data neobsahují všechny cesty, kde je jízda na kole povolená. Úsek bez záznamu je označen „Neověřeno / bez odpovídajícího záznamu“ – není tím
          řečeno, že jde o silnici, že je nebezpečný či nesjízdný. Vyhledávání adres: {config?.geocoding.attribution || '—'}.
        </Typography>
        <Typography variant="subtitle2" gutterBottom>
          Převodní tabulka <code>typ_opatreni</code> → kategorie (ověřeno proti živé službě)
        </Typography>
        <Table size="small" aria-label="Převodní tabulka kategorií">
          <TableHead>
            <TableRow>
              <TableCell>Původní hodnota</TableCell>
              <TableCell>Kategorie v aplikaci</TableCell>
              <TableCell align="right">Záznamů</TableCell>
              <TableCell>Poznámka</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {NORMALIZATION_TABLE.map((r) => (
              <TableRow key={String(r.original)}>
                <TableCell sx={{ fontSize: 12 }}>{r.original ?? <i>(nevyplněno)</i>}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <LineSwatch category={r.category} width={20} />
                    {CATEGORIES[r.category].label}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12 }}>{counts.get(r.original) ?? 0}</TableCell>
                <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{r.note}</TableCell>
              </TableRow>
            ))}
            {data?.meta.distinctTypes
              .filter((d) => !NORMALIZATION_TABLE.some((r) => r.original === d.value))
              .map((d) => (
                <TableRow key={`new-${d.value}`}>
                  <TableCell sx={{ fontSize: 12 }}>{d.value}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{CATEGORIES.unknown.label}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12 }}>{d.count}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: 'warning.main' }}>Nová hodnota, kterou převodní tabulka nezná.</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => set({ sourcesOpen: false })}>Zavřít</Button>
      </DialogActions>
    </Dialog>
  );
}
