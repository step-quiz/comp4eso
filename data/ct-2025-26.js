// ═══════════════════════════════════════════════════════════════════════
// data/ct-2025-26.js — Científico-tecnològica, curs 2025-26
//
// Year-variable data for the Science-Technology competency. To migrate
// to a new academic year, copy this file as `ct-YYYY-YY.js` and update
// only the items, ranges, and DC map. Then update the import paths in
// data/competencies.js and js/reports.js.
//
// Item types: 'abcd', 'abcde', 'vf', 'bin'
// 'bin' = binary with custom labels (A=1st option, B=2nd option)
// binLabels: [label_A, label_B] — short text shown in the cell
// ═══════════════════════════════════════════════════════════════════════

export const CIEN_ITEMS = [
  // Act.1 · L'Hidrogen Verd  (13 ítems)
  { label: '1',   type: 'abcd' },
  { label: '2.1', type: 'bin', binLabels: ['Av', 'In'] },   // Avantatge/Inconvenient
  { label: '2.2', type: 'bin', binLabels: ['Av', 'In'] },
  { label: '2.3', type: 'bin', binLabels: ['Av', 'In'] },
  { label: '2.4', type: 'bin', binLabels: ['Av', 'In'] },
  { label: '3',   type: 'abcd' },
  { label: '4.1', type: 'bin', binLabels: ['Ac', 'Pa'] },   // Actiu/Passiu
  { label: '4.2', type: 'bin', binLabels: ['Ac', 'Pa'] },
  { label: '4.3', type: 'bin', binLabels: ['Ac', 'Pa'] },
  { label: '4.4', type: 'bin', binLabels: ['Ac', 'Pa'] },
  { label: '5',   type: 'abcd' },
  { label: '6',   type: 'abcd' },
  { label: '7',   type: 'abcd' },
  // Act.2 · Donar Sang és Donar Vida  (14 ítems)
  { label: '8',    type: 'abcd' },
  { label: '9',    type: 'abcd' },
  { label: '10',   type: 'abcd' },
  { label: '11',   type: 'abcd' },
  { label: '12',   type: 'abcd' },
  { label: '13',   type: 'abcd' },
  { label: '14',   type: 'abcd' },
  { label: '15',   type: 'abcd' },
  { label: '16',   type: 'abcd' },
  { label: '17',   type: 'abcd' },
  { label: '18.1', type: 'abcde' },
  { label: '18.2', type: 'abcde' },
  { label: '18.3', type: 'abcde' },
  { label: '18.4', type: 'abcde' },
  // Act.3 · Observació de la Fauna Salvatge  (13 ítems)
  { label: '19',   type: 'abcd' },
  { label: '20',   type: 'abcd' },
  { label: '21',   type: 'abcd' },
  { label: '22',   type: 'abcd' },
  { label: '23.1', type: 'bin', binLabels: ['Po', 'Ne'] },  // Positiu/Negatiu
  { label: '23.2', type: 'bin', binLabels: ['Po', 'Ne'] },
  { label: '23.3', type: 'bin', binLabels: ['Po', 'Ne'] },
  { label: '23.4', type: 'bin', binLabels: ['Po', 'Ne'] },
  { label: '24.1', type: 'bin', binLabels: ['Sí', 'No'] },  // Sí/No
  { label: '24.2', type: 'bin', binLabels: ['Sí', 'No'] },
  { label: '24.3', type: 'bin', binLabels: ['Sí', 'No'] },
  { label: '24.4', type: 'bin', binLabels: ['Sí', 'No'] },
  { label: '25',   type: 'abcd' },
];
// Q=40 en total

export const CIEN_RANGES = [
  { name: "Act. 1 · L'Hidrogen Verd",            abbrev: 'ACT1', color: '#7A3090', start:  0, end: 13, questions: 13 },
  { name: 'Act. 2 · Donar Sang és Donar Vida',   abbrev: 'ACT2', color: '#C05820', start: 13, end: 27, questions: 14 },
  { name: 'Act. 3 · Observació Fauna Salvatge',  abbrev: 'ACT3', color: '#1a7040', start: 27, end: 40, questions: 13 },
];

// ═══════════════════════════════════════════════════════════════════════
// Descriptors competencials (per als informes)
// ═══════════════════════════════════════════════════════════════════════

export const CIEN_DC_MAP = [
  'DC1','DC2','DC2','DC2','DC2','DC3','DC2','DC2','DC2','DC2',  //  0-9  (Act.1 Q1-Q4.4)
  'DC2','DC1','DC4',                                             // 10-12 (Q5,Q6,Q7)
  'DC1','DC4','DC1','DC1','DC4','DC3','DC4','DC3','DC3','DC1',  // 13-22 (Act.2 Q8-Q17)
  'DC3','DC3','DC3','DC3',                                       // 23-26 (Q18.1-18.4)
  'DC2','DC2','DC2','DC1',                                       // 27-30 (Act.3 Q19-Q22)
  'DC4','DC4','DC4','DC4',                                       // 31-34 (Q23.1-23.4)
  'DC3','DC3','DC3','DC3',                                       // 35-38 (Q24.1-24.4)
  'DC4'                                                          // 39    (Q25)
];

export const CIEN_DC_INFO = {
  DC1: { label: 'Investigar i explicar fenòmens naturals',                                           color: '7A3090' },
  DC2: { label: 'Plantejar i desenvolupar projectes tecnològics',                                    color: 'C05820' },
  DC3: { label: 'Interpretar i comunicar informació de caràcter cientificotecnològic',               color: '1a7040' },
  DC4: { label: 'Proposar accions fonamentades científicament per preservar la salut i el medi ambient', color: '1A4F8A' },
};

export const CIEN_DC_ORDER = ['DC1', 'DC2', 'DC3', 'DC4'];

// ── Self-validation at module load ──
console.assert(
  CIEN_DC_MAP.length === CIEN_ITEMS.length,
  `CIEN_DC_MAP length ${CIEN_DC_MAP.length} ≠ CIEN_ITEMS length ${CIEN_ITEMS.length}`
);
CIEN_RANGES.forEach(r => console.assert(
  r.start + r.questions === r.end,
  `CIEN_RANGES[${r.abbrev}] start+questions ≠ end`
));
console.assert(
  CIEN_RANGES.reduce((s, r) => s + r.questions, 0) === CIEN_ITEMS.length,
  `CIEN_RANGES total questions ≠ CIEN_ITEMS length`
);
