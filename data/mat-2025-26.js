// ═══════════════════════════════════════════════════════════════════════
// data/mat-2025-26.js — Matemàtiques, curs 2025-26
//
// Year-variable data for the Mathematics competency. MAT differs from CAT
// and CT in that the ambits are user-configurable at runtime — the values
// here are seed defaults loaded into state when the user first selects MAT.
// ═══════════════════════════════════════════════════════════════════════

// Default activity ranges for MAT. The runtime value lives in state.js
// (state.ambits) and may be edited by the user via the settings UI.
export const MAT_DEFAULT_AMBITS = [
  { name: "Act. 1 · L'Ascensor",          abbrev: 'ACT1', color: '#b03020', questions: 8  },
  { name: 'Act. 2 · Els Paquets Llaunes', abbrev: 'ACT2', color: '#1a4f8a', questions: 5  },
  { name: "Act. 3 · L'Hotel",              abbrev: 'ACT3', color: '#b07000', questions: 8  },
  { name: 'Act. 4 · Botons',               abbrev: 'ACT4', color: '#2a7a3a', questions: 11 },
];

// ═══════════════════════════════════════════════════════════════════════
// Sentits matemàtics (per als informes)
// ═══════════════════════════════════════════════════════════════════════

// Mapa índex pregunta (0-31) → codi sentit matemàtic
export const MAT_SENTIT_MAP = [
  'NUM','NUM','EiM','EiM','ALG','ALG','EiM','EiM', // Q1–Q8
  'EiM','EiM','ALG','ALG','ALG','EST','EST','EST', // Q9–Q16
  'EST','ALG','ALG','ALG','ALG','NUM','EST','EiM', // Q17–Q24
  'NUM','EiM','NUM','NUM','NUM','EST','EST','EST'  // Q25–Q32
];

export const MAT_SENTIT_INFO = {
  NUM: { label: 'Sentit numèric',                color: '6B4FA0' },
  EiM: { label: 'Sentit espacial i de la mesura', color: '1A5276' },
  ALG: { label: 'Sentit algebraic',               color: '1E6B44' },
  EST: { label: 'Sentit estocàstic',              color: 'A04F10' },
};

export const SENTIT_ORDER = ['NUM', 'EiM', 'ALG', 'EST'];

// ── Self-validation at module load ──
const _matTotalQuestions = MAT_DEFAULT_AMBITS.reduce((s, a) => s + a.questions, 0);
console.assert(
  MAT_SENTIT_MAP.length === _matTotalQuestions,
  `MAT_SENTIT_MAP length ${MAT_SENTIT_MAP.length} ≠ total ambit questions ${_matTotalQuestions}`
);
