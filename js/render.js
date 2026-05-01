// ═══════════════════════════════════════════════════════════════════════
// js/render.js — Pure render functions and item-type accessors.
//
// All access to year-data items goes through the COMPETENCIES registry,
// not direct imports of cat-/ct- modules. State is read via state.js
// getters; this module never writes state.
// ═══════════════════════════════════════════════════════════════════════

import { COMPETENCIES } from '../data/competencies.js';
import {
  getCurrentCompetencyId, getAmbits, getCurIdx, getQIdx,
  getStuOrder, getStuNames, getStuMap,
} from './state.js';

// ── Items / ranges via registry ──
function _items() {
  const comp = COMPETENCIES[getCurrentCompetencyId()];
  return comp?.kind === 'items-based' ? comp.getItems() : null;
}

export function getQ() {
  const items = _items();
  if (items) return items.length;
  // ambits-based (mat) or 'default' fallback
  return getAmbits().reduce((s, a) => s + Math.max(1, a.questions | 0), 0);
}

export function getAmbitRanges() {
  const comp = COMPETENCIES[getCurrentCompetencyId()];
  if (comp?.kind === 'items-based') return comp.getRanges();
  // ambits-based (or 'default'): synthesise ranges from current ambits
  let start = 0;
  return getAmbits().map(a => {
    const q = Math.max(1, a.questions | 0);
    const r = { ...a, questions: q, start, end: start + q };
    start += q;
    return r;
  });
}

export function getItemType(qi) {
  const items = _items();
  return items?.[qi]?.type || 'abcd';
}

export function getItemLabel(qi) {
  const items = _items();
  return items?.[qi]?.label || String(qi + 1);
}

export function getItemBinLabels(qi) {
  const items = _items();
  return items?.[qi]?.binLabels || null;
}

export function valDisplay(val, qi) {
  if (val === '_') return '—';
  if (val === null) return '·';
  const type = getItemType(qi);
  if (type === 'vf') return val === 'A' ? 'V' : val === 'B' ? 'F' : val;
  if (type === 'bin') {
    const bl = getItemBinLabels(qi);
    if (bl) return val === 'A' ? bl[0] : val === 'B' ? bl[1] : val;
  }
  return val;  // abcd, abcde: show as-is
}

export function getAmbitForQ(qi) {
  const ranges = getAmbitRanges();
  return ranges.find(r => qi >= r.start && qi < r.end) || ranges[ranges.length - 1];
}

// ── Main render ──
export function render() {
  const Q = getQ();
  const stuOrder = getStuOrder();
  const stuNames = getStuNames();
  const stuMap   = getStuMap();
  const curIdx   = getCurIdx();
  const qIdx     = getQIdx();

  const key  = curIdx >= 0 ? stuOrder[curIdx] : null;
  const name = key ? stuNames[key] : null;
  const answers = key ? stuMap[key] : null;

  const isEmpty = stuOrder.length === 0;
  document.getElementById('btn-prev-stu').style.display  = isEmpty ? 'none' : '';
  document.getElementById('btn-next-stu').style.display  = isEmpty ? 'none' : '';
  document.getElementById('hdr-name').style.display      = isEmpty ? 'none' : '';
  document.getElementById('btn-empty-cta').style.display = isEmpty ? '' : 'none';
  document.getElementById('stu-code').textContent = key ? `#${key}` : '—';
  document.getElementById('hdr-name').textContent = name || '';

  for (let qi = 0; qi < Q; qi++) {
    const cell  = document.getElementById(`c${qi}`);
    const ansEl = document.getElementById(`a${qi}`);
    if (!cell || !ansEl) continue;
    const val = answers ? answers[qi] : null;
    cell.className = 'cell';
    cell.dataset.v = '';
    ansEl.className = 'q-a';

    const a = getAmbitForQ(qi);
    cell.style.borderLeftColor = a.color;

    if (qi === qIdx && curIdx >= 0 && qIdx < Q) {
      cell.classList.add('active');
      if (val !== null) {
        ansEl.textContent = valDisplay(val, qi);
        ansEl.dataset.val = val;
        ansEl.classList.add('preview');
      } else {
        ansEl.textContent = '';
        ansEl.dataset.val = '';
      }
    } else if (val !== null) {
      cell.classList.add('filled');
      cell.dataset.v = val;
      ansEl.textContent = valDisplay(val, qi);
      ansEl.dataset.val = val;
    } else {
      ansEl.textContent = '·';
      ansEl.dataset.val = '';
    }
  }

  const filled = answers ? answers.filter(v => v !== null).length : 0;
  document.getElementById('done-b').style.display = filled === Q ? 'inline-block' : 'none';
  document.getElementById('prog').style.width =
    answers ? `${(filled / Q) * 100}%` : '0%';
}
