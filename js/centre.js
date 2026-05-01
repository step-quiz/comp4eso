// ═══════════════════════════════════════════════════════════════════════
// js/centre.js — Centre + curs modal and autocomplete.
//
// State (centreCfg) lives in state.js; this module only handles the UI.
// `pendingAfterCentre` is local to this module — when set, saving the
// modal triggers the deferred report generation.
// ═══════════════════════════════════════════════════════════════════════

import { getCentreCfg, setCentreCfg, getDefaultCurs } from './state.js';

const CENTRE_SUGGESTIONS = ['Institut Miquel Tarradell'];

let _pendingAfterCentre = false;
export function setPendingAfterCentre(v) { _pendingAfterCentre = !!v; }
export function isPendingAfterCentre() { return _pendingAfterCentre; }

// `generateInformes` lives in reports.js — set via setter to avoid cycle
let _generateInformes = () => {};
export function setGenerateInformesFn(fn) { _generateInformes = fn; }

export function openCentreModal() {
  const cfg = getCentreCfg();
  document.getElementById('centre-inp').value = cfg.centre;
  document.getElementById('curs-inp').value   = cfg.curs;
  document.getElementById('centre-overlay').classList.remove('off');
  setTimeout(() => document.getElementById('centre-inp').focus(), 40);
}

export function closeCentreModal() {
  document.getElementById('centre-overlay').classList.add('off');
}

export function saveCentreModal() {
  const centre = document.getElementById('centre-inp').value.trim() || 'Institut';
  const curs   = document.getElementById('curs-inp').value.trim()   || getDefaultCurs();
  setCentreCfg({ centre, curs });
  closeCentreModal();
  if (_pendingAfterCentre) {
    _pendingAfterCentre = false;
    _generateInformes();
  }
}

// `updateCentreFromWizard` is the wizard-time handler that mirrors the
// fields into state. Defined in startup.js. We accept a callback for
// the same purpose during inline-typing of the centre name.
let _onCentreChanged = () => {};
export function setOnCentreChanged(fn) { _onCentreChanged = fn; }

export function centreAc(inp, acId) {
  _onCentreChanged();
  const val = inp.value;
  const ac  = document.getElementById(acId);
  const matches = CENTRE_SUGGESTIONS.filter(s =>
    val.length >= 2 && s.toLowerCase().includes(val.toLowerCase())
  );
  if (!matches.length) { ac.classList.remove('show'); ac.innerHTML = ''; return; }
  ac.innerHTML = matches.map(s =>
    `<div class="centre-ac-item" data-val="${s}">${s}</div>`
  ).join('');
  // Wire mousedown listeners (no inline handlers in modules)
  ac.querySelectorAll('.centre-ac-item').forEach(item => {
    item.addEventListener('mousedown', e => pickCentreAc(e, acId));
  });
  ac.classList.add('show');
}

export function pickCentreAc(e, acId) {
  e.preventDefault();
  const val = e.currentTarget.dataset.val;
  const ac  = document.getElementById(acId);
  const inp = ac.previousElementSibling;
  inp.value = val;
  hideCentreAc(acId);
  _onCentreChanged();
}

export function hideCentreAc(acId) {
  document.getElementById(acId).classList.remove('show');
}

export function centreAcKey(e, acId) {
  const ac    = document.getElementById(acId);
  const items = ac.querySelectorAll('.centre-ac-item');
  if (!items.length) return;
  const active = ac.querySelector('.centre-ac-item.active');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = active ? active.nextElementSibling : items[0];
    if (active) active.classList.remove('active');
    if (next) next.classList.add('active');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = active ? active.previousElementSibling : items[items.length - 1];
    if (active) active.classList.remove('active');
    if (prev) prev.classList.add('active');
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (active) { e.preventDefault(); active.dispatchEvent(new MouseEvent('mousedown')); }
  } else if (e.key === 'Escape') {
    hideCentreAc(acId);
  }
}

export function initCentreModalKeydown() {
  document.addEventListener('keydown', e => {
    const open = !document.getElementById('centre-overlay').classList.contains('off');
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); closeCentreModal(); }
    if (e.key === 'Enter')  { e.preventDefault(); saveCentreModal(); }
  });
}
