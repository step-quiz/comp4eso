// ═══════════════════════════════════════════════════════════════════════
// data/cat-2025-26.js — Llengua catalana, curs 2025-26
//
// Year-variable data for the Catalan competency. To migrate to a new
// academic year, copy this file as `cat-YYYY-YY.js` and update only the
// items, ranges, and process map. Then update the import paths in
// data/competencies.js and js/reports.js.
// ═══════════════════════════════════════════════════════════════════════

export const CAT_ITEMS = [
  // Comprensió Oral Q1-10
  ...Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), type: 'abcd' })),
  // Comprensió Escrita Text 1: Q11-13 (abcd)
  { label: '11', type: 'abcd' }, { label: '12', type: 'abcd' }, { label: '13', type: 'abcd' },
  // Q14.1-14.4 (V/F)
  { label: '14.1', type: 'vf' }, { label: '14.2', type: 'vf' },
  { label: '14.3', type: 'vf' }, { label: '14.4', type: 'vf' },
  // Q15-22 (abcd)
  ...Array.from({ length: 8 }, (_, i) => ({ label: String(i + 15), type: 'abcd' })),
  // Comprensió Escrita Text 2: Q23-26 (abcd)
  ...Array.from({ length: 4 }, (_, i) => ({ label: String(i + 23), type: 'abcd' })),
  // Q27.1-27.4 (V/F)
  { label: '27.1', type: 'vf' }, { label: '27.2', type: 'vf' },
  { label: '27.3', type: 'vf' }, { label: '27.4', type: 'vf' },
  // Q28-38 (abcd)
  ...Array.from({ length: 11 }, (_, i) => ({ label: String(i + 28), type: 'abcd' })),
];

// indices: CO=0-9, CE1=10-24, CE2=25-43
export const CAT_RANGES = [
  { name: 'Comprensió Oral',        abbrev: 'CO',  color: '#b03020', start:  0, end: 10, questions: 10 },
  { name: 'Comprensió Escrita (1)', abbrev: 'CE1', color: '#1a4f8a', start: 10, end: 25, questions: 15 },
  { name: 'Comprensió Escrita (2)', abbrev: 'CE2', color: '#2a7a3a', start: 25, end: 44, questions: 19 },
];

// ═══════════════════════════════════════════════════════════════════════
// Processos cognitius (per als informes)
// ═══════════════════════════════════════════════════════════════════════

// Mapa índex pregunta (0-43) → codi procés cognitiu
// Font: taula 2.1 del document de referència CB4 Llengua Catalana
export const CAT_PROCESS_MAP = [
  'LOI','RID','III','LOI','III','RID','RID','III','RVC','RVC',  // 0-9   Q1-Q10  (CO)
  'RID','III','LOI','RID','RID','RID','RID','III','RID','III',  // 10-19 Q11-Q20 (CE1)
  'III','LOI','RID','RVC','RVC','RID','III','RID','LOI','RID',  // 20-29 Q21-Q27.1 (CE1+CE2)
  'RID','RID','RID','III','III','LOI','LOI','III','RID','RID',  // 30-39 Q27.2-Q34 (CE2)
  'RVC','RVC','RVC','III'                                        // 40-43 Q35-Q38 (CE2)
];

export const CAT_PROCESS_INFO = {
  LOI: { label: 'Localitzar i obtenir informació',                color: 'B03020' },
  RID: { label: 'Realitzar inferències directes',                 color: '1A4F8A' },
  III: { label: 'Integrar i interpretar idees i informacions',    color: '2A7A3A' },
  RVC: { label: 'Reflexionar i valorar continguts i informacions', color: '7A20B0' },
};

export const CAT_PROCESS_ORDER = ['LOI', 'RID', 'III', 'RVC'];

// ── Self-validation at module load ──
console.assert(
  CAT_PROCESS_MAP.length === CAT_ITEMS.length,
  `CAT_PROCESS_MAP length ${CAT_PROCESS_MAP.length} ≠ CAT_ITEMS length ${CAT_ITEMS.length}`
);
CAT_RANGES.forEach(r => console.assert(
  r.start + r.questions === r.end,
  `CAT_RANGES[${r.abbrev}] start+questions ≠ end`
));
console.assert(
  CAT_RANGES.reduce((s, r) => s + r.questions, 0) === CAT_ITEMS.length,
  `CAT_RANGES total questions ≠ CAT_ITEMS length`
);
