// ═══════════════════════════════════════════════════════════════════════
// js/ui.js — Generic UI helpers: toast, FAQ accordion, dropdown menus,
// global ESC handler, beforeunload guard.
//
// Note: markUnsaved/markSaved live in state.js (they mutate state). This
// module only consumes isUnsaved() to wire beforeunload.
// ═══════════════════════════════════════════════════════════════════════

import { isUnsaved } from './state.js';

// `closeSettings` and `closeKeyEditor` are wired late via setters from
// init.js to break what would otherwise be import cycles
// (key-editor.js → ui.js for showToast, and ui.js → key-editor.js for
// closeKeyEditor).
let _closeSettings  = () => {};
let _closeKeyEditor = () => {};
export function setCloseSettingsFn(fn)  { _closeSettings  = fn; }
export function setCloseKeyEditorFn(fn) { _closeKeyEditor = fn; }

let _toastTimer = null;
export function showToast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ── FAQ ──
export function openFaq()  { document.getElementById('faq-overlay').classList.remove('off'); }
export function closeFaq() { document.getElementById('faq-overlay').classList.add('off'); }

export function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = btn.classList.contains('open');
  document.querySelectorAll('.faq-q').forEach(b => {
    b.classList.remove('open');
    b.nextElementSibling.classList.remove('open');
  });
  if (!isOpen) { btn.classList.add('open'); answer.classList.add('open'); }
}

// ── Dropdown logic ──
export function toggleDropdown(id) {
  document.querySelectorAll('.dropdown').forEach(d => {
    if (d.id !== id) d.classList.remove('open');
  });
  document.getElementById(id).classList.toggle('open');
}

export function closeDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
}

// ── Generic overlay close (delegates to specialised closers when needed) ──
export function closeOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'cfg-overlay') { _closeSettings(); return; }
  if (id === 'key-overlay') { _closeKeyEditor(); return; }
  el.classList.add('off');
}

// ── Init listeners ──
export function initUiListeners() {
  // Click-outside closes dropdowns
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown')) closeDropdowns();
  });

  // FAQ ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('faq-overlay').classList.contains('off')) {
      e.preventDefault(); closeFaq();
    }
  });

  // beforeunload guard
  window.addEventListener('beforeunload', e => {
    if (isUnsaved()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Global ESC handler (capture phase, runs before others)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.dropdown.open')) {
      e.preventDefault(); closeDropdowns(); return;
    }
    const res = document.getElementById('results-overlay');
    if (res && !res.classList.contains('off')) {
      e.preventDefault(); res.classList.add('off'); return;
    }
    const cor = document.getElementById('correct-overlay');
    if (cor && !cor.classList.contains('off')) {
      e.preventDefault(); cor.classList.add('off'); return;
    }
    const cfg = document.getElementById('cfg-overlay');
    if (cfg && !cfg.classList.contains('off')) {
      e.preventDefault(); _closeSettings(); return;
    }
    // (stu-overlay, key-overlay, pdf-prompt, faq-overlay have their own handlers)
  }, true);
}
