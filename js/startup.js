// ═══════════════════════════════════════════════════════════════════════
// js/startup.js — Startup wizard, applyCompetency, deferred-action plumbing.
//
// Owns the 'pendingAfterKey' / 'pendingAfterWarning' flags that tie the
// startup flow together (centre → key/student → pdf).
// ═══════════════════════════════════════════════════════════════════════

import { COMPETENCIES } from '../data/competencies.js';
import {
  setCurrentCompetencyId, setAmbits, setCentreCfg, getCentreCfg, getDefaultCurs,
} from './state.js';
import { buildGrid } from './grid.js';
import { render } from './render.js';
import {
  openKeyEditor,
  setPendingAfterKey, getPendingAfterKey,
  setAfterKeyEditorFn,
} from './key-editor.js';
import { openModal } from './student-modal.js';

export const startupSel = { comp: null, key: null, pdf: null };

let _pendingAfterWarning = null;

export function updateCentreFromWizard() {
  const centre = (document.getElementById('sw-centre').value.trim()) || 'Institut';
  const curs   = (document.getElementById('sw-curs').value.trim())   || getDefaultCurs();
  setCentreCfg({ centre, curs });
}

export function selectOpt(btn) {
  const col = btn.dataset.col;
  document.querySelectorAll(`.sopt[data-col="${col}"]`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  startupSel[col] = btn.dataset.val;
  const allDone = startupSel.comp && startupSel.key;
  document.getElementById('startup-go').disabled = !allDone;
}

export function applyCompetency(id) {
  setCurrentCompetencyId(id);
  const comp = COMPETENCIES[id];
  if (comp && comp.kind === 'ambits-based' && comp.defaultAmbits) {
    setAmbits(comp.defaultAmbits.map(a => ({ ...a })));
  }
  buildGrid();
  render();
}

export function startApp() {
  const { comp, key } = startupSel;
  applyCompetency(comp);
  document.getElementById('comp-overlay').classList.add('off');
  _pendingAfterWarning = key;
  document.getElementById('warning-overlay').classList.remove('off');
}

export function acceptWarning() {
  document.getElementById('warning-overlay').classList.add('off');
  const key = _pendingAfterWarning;
  _pendingAfterWarning = null;
  if (key === 'now') {
    setPendingAfterKey('student');
    openKeyEditor();
  } else {
    openModal();
  }
}

export function afterKeyEditor() {
  const pending = getPendingAfterKey();
  if (pending === 'pdf') {
    setPendingAfterKey(null);
    document.getElementById('pdf-prompt-overlay').classList.remove('off');
  } else if (pending === 'student') {
    setPendingAfterKey(null);
    openModal();
  }
}

// Wire the after-key callback used by closeKeyEditor()
setAfterKeyEditorFn(afterKeyEditor);

export function initStartupPrefill() {
  const cfg = getCentreCfg();
  document.getElementById('sw-centre').value =
    cfg.centre !== 'Institut' ? cfg.centre : '';
  document.getElementById('sw-curs').value = cfg.curs;
}
