import { useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  List,
  ListItemButton,
  useMediaQuery,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import { CATEGORIES, UNMATCHED_COLOR } from '@bce/shared';
import { useActiveAnalysis } from '../../hooks/data';
import { useAppStore } from '../../store/useAppStore';
import { fmtDistance, fmtKm, fmtPct } from '../../services/format';
import { GroupBar, QualityChip } from '../../components/RouteStats';
import { linesBounds } from '../../services/geometry';
import { sectionLabel, sectionOsm } from '../../services/osm';

const KIND_LABEL = { gpx: 'Importovaná GPX stopa', calculated: 'Vypočtená trasa (OSM)', manual: 'Ručně nakreslená trasa (nenavigovaná)' } as const;

export function SectionDetail() {
  const analysis = useActiveAnalysis();
  const id = useAppStore((s) => s.selectedSectionId);
  const set = useAppStore((s) => s.set);
  const active = useAppStore((s) => s.activeRoute);
  const sec = analysis?.sections.find((s) => s.id === id);
  if (!sec || !analysis) return null;
  const osm = sectionOsm(active, analysis, sec);
  const pieces = analysis.pieces.filter((p) => p.startDistance >= sec.startDistance - 0.01 && p.startDistance < sec.startDistance + sec.length - 0.01);
  const cands = new Map<number, { cat: string; reason?: string; d: number; a: number; acc: boolean }>();
  for (const p of pieces) for (const c of p.candidates) if (!cands.has(c.featureId)) cands.set(c.featureId, { cat: CATEGORIES[c.category].label, reason: c.rejectReason, d: c.distance, a: c.angle, acc: c.accepted });
  return (
    <Box sx={{ p: 1.5, borderLeft: { md: '1px solid' }, borderColor: { md: 'divider' }, minWidth: 0 }} data-testid="section-detail">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: sec.category ? CATEGORIES[sec.category].color : UNMATCHED_COLOR }} />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Úsek {sec.id + 1}: {sec.label}
        </Typography>
        <IconButton size="small" aria-label="Zavřít detail úseku" onClick={() => set({ selectedSectionId: null })}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {fmtDistance(sec.length)} od {fmtKm(sec.startDistance)} · jistota: {sec.confidence === 'high' ? 'vysoká' : sec.confidence === 'medium' ? 'střední' : '—'}
        {sec.meanDistance !== null && ` · průměrný odstup ${sec.meanDistance.toFixed(1)} m`}
        {sec.maxAngle !== null && ` · max. odchylka směru ${sec.maxAngle.toFixed(0)}°`}
        {sec.featureIds.length > 0 && ` · záznamy #${sec.featureIds.slice(0, 6).join(', #')}`}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, fontSize: 12.5 }}>
        Proč: {sec.reasons[0]}
      </Typography>
      {osm && (
        <Box sx={{ mt: 0.75, p: 1, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.04)' }} data-testid="section-osm">
          <Typography variant="caption" component="div" sx={{ fontWeight: 600 }}>
            OpenStreetMap: {osm.text}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {Object.entries(osm.tags)
              .filter(([k]) => !/^(reversedirection|estimated_)/.test(k))
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ')}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            Data OSM z vypočtené trasy (BRouter){osm.share < 0.9 ? `, pokrývá ${Math.round(osm.share * 100)} % úseku` : ''}. Nejde o oficiální záznam města.
          </Typography>
        </Box>
      )}
      {cands.size > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Posouzené blízké záznamy:
          </Typography>
          {[...cands.entries()].slice(0, 5).map(([fid, c]) => (
            <Typography key={fid} variant="caption" component="div" sx={{ color: c.acc ? 'success.light' : 'text.secondary' }}>
              #{fid} {c.cat}: {c.d.toFixed(1)} m, {c.a.toFixed(0)}° – {c.acc ? 'vyhovuje' : `zamítnuto (${c.reason})`}
            </Typography>
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        Klasifikace je geometricky odvozená z polohy trasy vůči oficiálním záznamům, nejde o ověření v terénu.
      </Typography>
    </Box>
  );
}

export function AnalysisPanel() {
  const active = useAppStore((s) => s.activeRoute);
  const open = useAppStore((s) => s.analysisOpen);
  const selectedId = useAppStore((s) => s.selectedSectionId);
  const set = useAppStore((s) => s.set);
  const fitTo = useAppStore((s) => s.fitTo);
  const analysis = useActiveAnalysis();
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const sections = useMemo(() => analysis?.sections ?? [], [analysis]);
  const mobile = useMediaQuery('(max-width:899px)');

  useEffect(() => {
    if (selectedId !== null) rowRefs.current[selectedId]?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  if (!active) return null;
  if (mobile) return <MobileSectionList />;
  return (
    <Paper square elevation={8} data-testid="analysis-panel" sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.75, minHeight: 44 }}>
        <Typography variant="subtitle2" noWrap sx={{ maxWidth: 260 }}>
          {active.name}
        </Typography>
        <Chip size="small" variant="outlined" label={active.kind === 'calculated' && active.meta?.variant ? `Vypočtená trasa · ${String(active.meta.variant).split(':')[0]}` : KIND_LABEL[active.kind]} />
        {analysis ? (
          <>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {fmtKm(analysis.totalLength)}
            </Typography>
            <Box sx={{ flex: 1, minWidth: 80 }}>
              <GroupBar analysis={analysis} height={10} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', display: { xs: 'none', lg: 'block' } }}>
              stezky mimo vozovku {fmtPct((analysis.byGroup.find((g) => g.key === 'dedicated')?.share ?? 0) + (analysis.byGroup.find((g) => g.key === 'shared')?.share ?? 0))}
            </Typography>
            <QualityChip analysis={analysis} />
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            Analýza není k dispozici (chybí data infrastruktury).
          </Typography>
        )}
        <Tooltip title={open ? 'Sbalit analýzu' : 'Rozbalit analýzu úseků'}>
          <IconButton size="small" onClick={() => set({ analysisOpen: !open })} aria-label={open ? 'Sbalit analýzu' : 'Rozbalit analýzu'} aria-expanded={open}>
            {open ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={open && !!analysis}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: selectedId !== null ? '1fr 380px' : '1fr' }, maxHeight: 230, borderTop: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ overflow: 'auto', maxHeight: 230 }}>
            <Table size="small" stickyHeader aria-label="Úseky analyzované trasy">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Klasifikace</TableCell>
                  <TableCell align="right">Od</TableCell>
                  <TableCell align="right">Délka</TableCell>
                  <TableCell>Jistota</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sections.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    selected={s.id === selectedId}
                    ref={(el) => {
                      rowRefs.current[s.id] = el;
                    }}
                    onClick={() => {
                      set({ selectedSectionId: s.id });
                      const b = linesBounds([s.coordinates]);
                      if (b) fitTo(b);
                    }}
                    sx={{ cursor: 'pointer' }}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && set({ selectedSectionId: s.id })}
                  >
                    <TableCell sx={{ py: 0.25 }}>{s.id + 1}</TableCell>
                    <TableCell sx={{ py: 0.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: s.category ? CATEGORIES[s.category].color : UNMATCHED_COLOR, flexShrink: 0 }} />
                        {sectionLabel(active, analysis, s)}
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.25, fontVariantNumeric: 'tabular-nums' }}>{fmtKm(s.startDistance)}</TableCell>
                    <TableCell align="right" sx={{ py: 0.25, fontVariantNumeric: 'tabular-nums' }}>{fmtDistance(s.length)}</TableCell>
                    <TableCell sx={{ py: 0.25 }}>{s.confidence === 'high' ? 'vysoká' : s.confidence === 'medium' ? 'střední' : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {selectedId !== null && <SectionDetail />}
        </Box>
      </Collapse>
    </Paper>
  );
}

/** Phone layout: compact one-line rows instead of the table; the tapped section's detail opens inline. */
function MobileSectionList() {
  const active = useAppStore((s) => s.activeRoute);
  const selectedId = useAppStore((s) => s.selectedSectionId);
  const set = useAppStore((s) => s.set);
  const fitTo = useAppStore((s) => s.fitTo);
  const analysis = useActiveAnalysis();
  if (!active || !analysis) return null;
  return (
    <Box data-testid="analysis-panel" sx={{ borderTop: '1px solid', borderColor: 'divider', pb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ px: 2, display: 'block', pt: 1 }}>
        Úseky trasy ({analysis.sections.length})
      </Typography>
      <List dense disablePadding data-testid="section-list">
        {analysis.sections.map((s) => (
          <Box key={s.id}>
            <ListItemButton
              selected={s.id === selectedId}
              onClick={() => {
                const again = s.id === selectedId;
                set({ selectedSectionId: again ? null : s.id });
                if (!again) {
                  const b = linesBounds([s.coordinates]);
                  if (b) fitTo(b);
                }
              }}
              sx={{ px: 2, py: 0.5, gap: 1.25 }}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', flexShrink: 0, bgcolor: s.category ? CATEGORIES[s.category].color : UNMATCHED_COLOR }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {sectionLabel(active, analysis, s)}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  od {fmtKm(s.startDistance)}
                  {s.confidence !== 'none' && ` · jistota ${s.confidence === 'high' ? 'vysoká' : 'střední'}`}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {fmtDistance(s.length)}
              </Typography>
            </ListItemButton>
            {s.id === selectedId && <SectionDetail />}
          </Box>
        ))}
      </List>
    </Box>
  );
}
