// ═══════════════════════════════════════════════════════════════════════
// data/competencies.js — Stable competency registry
//
// This file is the only data-layer module imported by code outside data/.
// It bundles the year-variable items/ranges behind a uniform getter API
// and adds a discriminator so consumers can tell items-based competencies
// (CAT, CT) from ambits-based ones (MAT).
//
// `layout` is the grid column distribution: an array of columns, where
// each column is an array of range indices. Consumers (grid.js) read it
// to lay out the competency-specific 2-column grid without hardcoding.
//
// To migrate to a new academic year, only the three `import` paths below
// need to change.
// ═══════════════════════════════════════════════════════════════════════

import { CAT_ITEMS, CAT_RANGES }   from './cat-2025-26.js';
import { MAT_DEFAULT_AMBITS }      from './mat-2025-26.js';
import { CIEN_ITEMS, CIEN_RANGES } from './ct-2025-26.js';

export const COMPETENCIES = {
  cat: {
    kind:      'items-based',
    label:     'Llengua catalana',
    layout:    [[0, 1], [2]],
    getItems:  () => CAT_ITEMS,
    getRanges: () => CAT_RANGES,
  },
  mat: {
    kind:          'ambits-based',
    label:         'Matemàtiques',
    layout:        [[0, 1], [2, 3]],
    getItems:      () => null,           // ambits-based: no fixed items
    getRanges:     () => null,           // resolved at runtime via state.ambits
    defaultAmbits: MAT_DEFAULT_AMBITS,
  },
  ct: {
    kind:      'items-based',
    label:     'Científico-tecnològica',
    layout:    [[0, 1], [2]],
    getItems:  () => CIEN_ITEMS,
    getRanges: () => CIEN_RANGES,
  },
};
