// ═══════════════════════════════════════════════════════════════════════
// js/keyboard.js — Keyboard configuration store and settings UI.
//
// Owns the `keyCfg` map (which key triggers which answer action) plus
// its persistence (localStorage key 'cb4-keys-v2'), and the settings
// overlay UI.
// ═══════════════════════════════════════════════════════════════════════

export const DEFAULT_KEYS = {
  A: '1', B: '2', C: '3', D: '4', E: '5',
  V: '1', F: '2',
  blank: '0', erase: 'x',
};

export const ACTION_META = [
  { id: 'A',     label: 'Resposta A',         hint: 'lletra de resposta' },
  { id: 'B',     label: 'Resposta B',         hint: 'lletra de resposta' },
  { id: 'C',     label: 'Resposta C',         hint: 'lletra de resposta' },
  { id: 'D',     label: 'Resposta D',         hint: 'lletra de resposta' },
  { id: 'E',     label: 'Resposta E (abcde)', hint: 'preguntes amb 5 opcions' },
  { id: 'V',     label: 'Verdader (V/F)',     hint: 'preguntes vertader/fals' },
  { id: 'F',     label: 'Fals (V/F)',         hint: 'preguntes vertader/fals' },
  { id: 'blank', label: 'En blanc / Invàlid', hint: 'sense resposta vàlida' },
  { id: 'erase', label: 'Esborra ←',          hint: 'esborra casella anterior' },
];

export const FORBIDDEN = new Set([
  'Enter', 'Tab', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Backspace', 'Delete',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'Control','Alt','Shift','Meta','CapsLock','AltGraph',
]);

const CONFLICT_GROUPS = [
  ['A', 'B', 'C', 'D', 'E', 'blank', 'erase'],
  ['V', 'F', 'blank', 'erase'],
];

let keyCfg      = { ...DEFAULT_KEYS };
let keyCfgDraft = {};
let cfgActiveRow = 0;

export function getKeyCfg() { return keyCfg; }

export function loadKeyCfg() {
  try {
    const s = localStorage.getItem('cb4-keys-v2');
    if (s) Object.assign(keyCfg, JSON.parse(s));
  } catch (_) {}
}

function saveKeyCfg() {
  try { localStorage.setItem('cb4-keys-v2', JSON.stringify(keyCfg)); } catch (_) {}
}

export function displayKey(k) {
  if (k === ' ') return 'Esp';
  if (k === ',' || k === '.') return k;
  return k.toUpperCase();
}

export function normalizeKey(e) {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

function getConflictingActions(cfg) {
  cfg = cfg || keyCfgDraft;
  const conflicting = new Set();
  for (const group of CONFLICT_GROUPS) {
    const count = {};
    for (const id of group) {
      const k = cfg[id];
      (count[k] = count[k] || []).push(id);
    }
    for (const ids of Object.values(count)) {
      if (ids.length > 1) ids.forEach(id => conflicting.add(id));
    }
  }
  return conflicting;
}

export function openSettings() {
  keyCfgDraft = { ...keyCfg };
  cfgActiveRow = 0;
  renderCfgTable();
  document.getElementById('cfg-overlay').classList.remove('off');
}

export function closeSettings() {
  document.getElementById('cfg-overlay').classList.add('off');
  // draft discarded
}

export function saveCfgSettings() {
  const conflicts = getConflictingActions(keyCfgDraft);
  if (conflicts.size > 0) return;
  keyCfg = { ...keyCfgDraft };
  saveKeyCfg();
  closeSettings();
}

function renderCfgTable() {
  const conflicts = getConflictingActions(keyCfgDraft);
  const table = document.getElementById('cfg-table');

  // Header
  const headerHtml = `
    <div class="cfg-row-hdr">
      <span>Tecla</span><span>Acció</span>
    </div>`;

  // Rows (no inline onclick; we'll attach listeners after)
  const rowsHtml = ACTION_META.map((a, i) => {
    const k = keyCfgDraft[a.id];
    const isActive    = i === cfgActiveRow;
    const hasConflict = conflicts.has(a.id);
    const classes = ['cfg-row2',
      isActive    ? 'cfg-active'   : '',
      hasConflict ? 'cfg-conflict' : '',
    ].filter(Boolean).join(' ');

    const badge = isActive
      ? `<span>${k ? displayKey(k) : ''}</span><span class="cfg-blink">|</span>`
      : `<span>${k ? displayKey(k) : '?'}</span>`;

    return `<div class="${classes}" data-row="${i}">
      <div class="cfg-key-cell"><div class="cfg-keybadge">${badge}</div></div>
      <div class="cfg-act-cell">${a.label}</div>
    </div>`;
  }).join('');

  table.innerHTML = headerHtml + rowsHtml;

  // Wire row clicks
  table.querySelectorAll('.cfg-row2').forEach(rowEl => {
    rowEl.addEventListener('click', () => {
      cfgActiveRow = parseInt(rowEl.dataset.row, 10) || 0;
      renderCfgTable();
    });
  });

  const msg = document.getElementById('cfg-conflict-msg');
  const saveBtn = document.getElementById('btn-save-cfg');
  const emptyKeys = ACTION_META.filter(a => !keyCfgDraft[a.id]);
  if (conflicts.size > 0) {
    const names = ACTION_META.filter(a => conflicts.has(a.id)).map(a => a.label);
    msg.textContent = `⚠ Conflicte de tecles: ${names.join(', ')}`;
    msg.classList.add('on');
    if (saveBtn) saveBtn.disabled = true;
  } else if (emptyKeys.length > 0) {
    msg.textContent = `⚠ Tecles sense assignar: ${emptyKeys.map(a => a.label).join(', ')}`;
    msg.classList.add('on');
    if (saveBtn) saveBtn.disabled = true;
  } else {
    msg.classList.remove('on');
    if (saveBtn) saveBtn.disabled = false;
  }
}

export function resetKeys() {
  keyCfgDraft = { ...DEFAULT_KEYS };
  renderCfgTable();
}

// ── Settings overlay keyboard handler ──
export function initSettingsKeyHandler() {
  document.addEventListener('keydown', e => {
    const cfgOpen = !document.getElementById('cfg-overlay').classList.contains('off');
    if (!cfgOpen) return;
    if (e.key === 'Escape') return; // global handler closes
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'ArrowDown') {
      cfgActiveRow = Math.min(cfgActiveRow + 1, ACTION_META.length - 1);
      renderCfgTable(); return;
    }
    if (e.key === 'ArrowUp') {
      cfgActiveRow = Math.max(cfgActiveRow - 1, 0);
      renderCfgTable(); return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      keyCfgDraft[ACTION_META[cfgActiveRow].id] = null;
      renderCfgTable(); return;
    }

    if (FORBIDDEN.has(e.key)) return;

    keyCfgDraft[ACTION_META[cfgActiveRow].id] = normalizeKey(e);
    cfgActiveRow = Math.min(cfgActiveRow + 1, ACTION_META.length - 1);
    renderCfgTable();
  }, true); // capture phase
}
