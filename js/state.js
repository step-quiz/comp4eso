// ═══════════════════════════════════════════════════════════════════════
// js/state.js — Single source of truth for mutable application state.
//
// All other modules read state via getters and mutate via setters; never
// re-export the `let`-bound values directly (they would be read-only at
// the import site).
// ═══════════════════════════════════════════════════════════════════════

import { COMPETENCIES } from '../data/competencies.js';

// ── Storage loaders ──
function _loadCentre() {
  try {
    const s = localStorage.getItem('cb4-centre');
    if (s) return JSON.parse(s);
  } catch (_) {}
  return { centre: 'Institut ', curs: getDefaultCurs() };
}

function _loadAmbits() {
  try {
    const s = localStorage.getItem('cb4-ambits');
    if (s) return JSON.parse(s);
  } catch (_) {}
  return COMPETENCIES.mat.defaultAmbits.map(a => ({ ...a }));
}

export function getDefaultCurs() {
  // Academic year boundary: 1 September Y → 31 August Y+1 = curs "Y-(Y+1)".
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ── Module-private state ──
let _stuMap            = {};        // key → answers[]
let _stuNames          = {};        // key → display name
let _stuOrder          = [];        // string[] — insertion order
let _curIdx            = -1;
let _qIdx              = 0;
let _stuCompletePrompt = false;
// 'default' is the pre-wizard placeholder; getters fall back to MAT shape.
let _currentCompetencyId = 'default';
let _answerKey         = null;      // string[] | null
let _lastResults       = null;
let _unsavedChanges    = false;
let _ambits            = _loadAmbits();
let _centreCfg         = _loadCentre();

// PDF runtime state (transient, not persisted)
let _pdfDoc = null;
let _pdfTotalPages = 0;
let _pdfCurrentPage = 0;
let _pdfRenderTask = null;
let _pdfResizeTimer = null;
let _pdfZoom = 1.0;

// ── Getters ──
export const getStuMap              = () => _stuMap;
export const getStuNames            = () => _stuNames;
export const getStuOrder            = () => _stuOrder;
export const getCurIdx              = () => _curIdx;
export const getQIdx                = () => _qIdx;
export const isStuCompletePrompt    = () => _stuCompletePrompt;
export const getCurrentCompetencyId = () => _currentCompetencyId;
export const getAnswerKey           = () => _answerKey;
export const getLastResults         = () => _lastResults;
export const getAmbits              = () => _ambits;
export const getCentreCfg           = () => _centreCfg;
export const isUnsaved              = () => _unsavedChanges;
export const getPdfDoc              = () => _pdfDoc;
export const getPdfTotalPages       = () => _pdfTotalPages;
export const getPdfCurrentPage      = () => _pdfCurrentPage;
export const getPdfRenderTask       = () => _pdfRenderTask;
export const getPdfResizeTimer      = () => _pdfResizeTimer;
export const getPdfZoom             = () => _pdfZoom;

// ── Setters ──
export const setStuMap              = v => { _stuMap = v; };
export const setStuNames            = v => { _stuNames = v; };
export const setStuOrder            = v => { _stuOrder = v; };
export const setCurIdx              = v => { _curIdx = v; };
export const setQIdx                = v => { _qIdx = v; };
export const setStuCompletePrompt   = v => { _stuCompletePrompt = v; };
export const setCurrentCompetencyId = v => { _currentCompetencyId = v; };
export const setAnswerKey           = v => { _answerKey = v; };
export const setLastResults         = v => { _lastResults = v; };

export const setPdfDoc              = v => { _pdfDoc = v; };
export const setPdfTotalPages       = v => { _pdfTotalPages = v; };
export const setPdfCurrentPage      = v => { _pdfCurrentPage = v; };
export const setPdfRenderTask       = v => { _pdfRenderTask = v; };
export const setPdfResizeTimer      = v => { _pdfResizeTimer = v; };
export const setPdfZoom             = v => { _pdfZoom = v; };

export function markUnsaved() { _unsavedChanges = true; }
export function markSaved()   { _unsavedChanges = false; }

// ── Granular setter for individual student answers ──
// Consumers should use this rather than mutating the object returned
// by getStuMap() directly, even though that would also work — going
// through this setter preserves the "mutate via setters" contract
// declared at the top of this file.
export function setStudentAnswer(key, qIdx, value) {
  _stuMap[key][qIdx] = value;
}

// ── Persisted state setters ──
export function setCentreCfg(cfg) {
  _centreCfg = cfg;
  try { localStorage.setItem('cb4-centre', JSON.stringify(_centreCfg)); } catch (_) {}
}

export function setAmbits(a) {
  _ambits = a;
  try { localStorage.setItem('cb4-ambits', JSON.stringify(_ambits)); } catch (_) {}
}

export function resetAmbitsToDefault() {
  setAmbits(COMPETENCIES.mat.defaultAmbits.map(a => ({ ...a })));
}
