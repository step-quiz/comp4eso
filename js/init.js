// ═══════════════════════════════════════════════════════════════════════
// js/init.js — Application bootstrap.
//
// Responsibilities:
//   1. Load persisted keyboard config.
//   2. Wire setter-injection callbacks to break circular module imports.
//   3. Initialise PDF worker, build the grid, render initial state.
//   4. Attach all DOM event handlers that previously lived as inline
//      `onclick="…"` / `onchange="…"` attributes in the HTML.
//   5. Show the startup wizard.
//
// This file is the single entry point loaded as a module by index.html.
// All other modules are imported from here, directly or transitively.
// ═══════════════════════════════════════════════════════════════════════

import { loadKeyCfg, initSettingsKeyHandler, openSettings, saveCfgSettings, resetKeys } from './keyboard.js';
import { buildGrid } from './grid.js';
import { render } from './render.js';
import {
  initPdfWorker, initPdfResizeListener, setOpenModalFn,
  togglePdfPane, loadPdfFile, changePdfZoom,
} from './pdf-viewer.js';
import {
  openModal, confirmStudent, clearAllData, editNameInline,
  initStudentModalListeners,
} from './student-modal.js';
import { prevStu, nextStu } from './navigation.js';
import {
  openKeyEditor, closeKeyEditor, saveKeyAndMaybeDownload, loadKeyTxt,
  setApplyCompetencyFn as setKeyEditorApplyCompetency,
  initKeyEditorKeyboard,
} from './key-editor.js';
import { openCorrect, doCorrect } from './scoring.js';
import {
  exportRespostes, importRespostes, dlResultsXLSX,
  setApplyCompetencyFn as setExportApplyCompetency,
} from './export.js';
import {
  showToast, openFaq, closeFaq, toggleFaq,
  toggleDropdown, closeDropdowns, closeOverlay,
  initUiListeners,
  setCloseSettingsFn, setCloseKeyEditorFn,
} from './ui.js';
import {
  openCentreModal, closeCentreModal, saveCentreModal,
  centreAc, hideCentreAc, centreAcKey,
  setGenerateInformesFn, setOnCentreChanged,
  initCentreModalKeydown,
} from './centre.js';
import {
  startupSel, applyCompetency, startApp, acceptWarning, selectOpt,
  updateCentreFromWizard, initStartupPrefill,
} from './startup.js';
import { generateInformes } from './reports.js';
import { closeSettings } from './keyboard.js';
import { initMainKeyboard } from './main-keyboard.js';

// ─── 1. Wire setter-injection callbacks ───────────────────────────────
setOpenModalFn(openModal);
setKeyEditorApplyCompetency(applyCompetency);
setExportApplyCompetency(applyCompetency);
setGenerateInformesFn(generateInformes);
setOnCentreChanged(updateCentreFromWizard);
setCloseSettingsFn(closeSettings);
setCloseKeyEditorFn(closeKeyEditor);

// ─── 2. Initial setup ─────────────────────────────────────────────────
loadKeyCfg();
initPdfWorker();
buildGrid();
render();

// ─── 3. Initialise listeners owned by feature modules ─────────────────
initSettingsKeyHandler();
initStudentModalListeners();
initKeyEditorKeyboard();
initCentreModalKeydown();
initPdfResizeListener();
initUiListeners();
initMainKeyboard();

// ─── 4. Wire DOM event handlers (replacing inline `on*=` attributes) ──
function on(id, evt, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}

// Header buttons
on('btn-prev-stu',  'click', prevStu);
on('btn-next-stu',  'click', nextStu);
on('btn-empty-cta', 'click', openModal);
on('hdr-name',      'click', editNameInline);

// Dropdown triggers
on('dd-accions-trigger', 'click', () => toggleDropdown('dd-accions'));
on('dd-cfg-trigger',     'click', () => toggleDropdown('dd-cfg'));

// Dropdown items — Accions
on('dd-import-xlsx', 'click', () => { closeDropdowns(); document.getElementById('import-xlsx-file').click(); });
on('dd-export-xlsx', 'click', () => { closeDropdowns(); exportRespostes(); });
on('btn-correct',    'click', () => { closeDropdowns(); openCorrect(); });
on('dd-key-editor',  'click', () => { closeDropdowns(); openKeyEditor(); });
on('btn-pdf-toggle', 'click', () => { closeDropdowns(); togglePdfPane(); });
on('dd-clear-data',  'click', () => { closeDropdowns(); clearAllData(); });

// Dropdown items — Configuració
on('dd-centre',   'click', () => { closeDropdowns(); openCentreModal(); });
on('dd-settings', 'click', () => { closeDropdowns(); openSettings(); });
on('dd-faq',      'click', () => { closeDropdowns(); openFaq(); });

// File inputs (hidden)
on('import-xlsx-file', 'change', e => importRespostes(e.target));
on('key-txt-file',     'change', e => loadKeyTxt(e.target));
on('pdf-file',         'change', e => loadPdfFile(e.target));

// Startup wizard
on('startup-go', 'click', startApp);
document.querySelectorAll('.sopt').forEach(btn => {
  btn.addEventListener('click', () => selectOpt(btn));
});
on('sw-centre', 'input',   e => centreAc(e.target, 'sw-ac'));
on('sw-centre', 'keydown', e => centreAcKey(e, 'sw-ac'));
on('sw-centre', 'blur',    () => setTimeout(() => hideCentreAc('sw-ac'), 150));
on('sw-curs',   'input',   updateCentreFromWizard);
on('sw-curs',   'change',  updateCentreFromWizard);

// Warning modal
on('btn-accept-warning', 'click', acceptWarning);

// Student modal
on('btn-confirm-student', 'click', confirmStudent);

// PDF zoom buttons
on('btn-pdf-zoom-out', 'click', () => changePdfZoom(-0.15));
on('btn-pdf-zoom-in',  'click', () => changePdfZoom(+0.15));

// Settings modal
on('btn-save-cfg',  'click', saveCfgSettings);
on('btn-reset-keys','click', resetKeys);

// Centre modal
on('btn-save-centre',  'click', saveCentreModal);
on('btn-cancel-centre','click', closeCentreModal);
on('centre-inp', 'input',   e => centreAc(e.target, 'modal-ac'));
on('centre-inp', 'keydown', e => centreAcKey(e, 'modal-ac'));
on('centre-inp', 'blur',    () => setTimeout(() => hideCentreAc('modal-ac'), 150));

// Key editor
on('btn-load-key-txt', 'click', () => document.getElementById('key-txt-file').click());
on('btn-save-key',     'click', saveKeyAndMaybeDownload);

// Correct modal
on('btn-do-correct',     'click', doCorrect);
on('btn-close-correct',  'click', () => document.getElementById('correct-overlay').classList.add('off'));

// Results modal
on('btn-close-results',   'click', () => document.getElementById('results-overlay').classList.add('off'));
on('btn-dl-results-xlsx', 'click', dlResultsXLSX);
on('btn-gen-informes',    'click', generateInformes);

// FAQ modal
on('btn-close-faq', 'click', closeFaq);
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => toggleFaq(btn));
});

// Backdrop click-to-close: any overlay element with data-backdrop-close="<id>"
document.querySelectorAll('.overlay').forEach(ov => {
  if (!ov.dataset.backdropClose) return;
  const closer = ov.dataset.backdropClose;
  ov.addEventListener('click', e => {
    if (e.target === ov) {
      if (closer === 'self') ov.classList.add('off');
      else closeOverlay(closer);
    }
  });
});

// ─── 5. Show startup wizard ───────────────────────────────────────────
initStartupPrefill();
document.getElementById('comp-overlay').classList.remove('off');
