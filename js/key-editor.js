// ═══════════════════════════════════════════════════════════════════════
// js/key-editor.js — Answer-key editor: build/render the key grid, load
// a key from .txt file, save the key to .txt, complete-on-keyboard editor.
// ═══════════════════════════════════════════════════════════════════════

import { COMPETENCIES } from '../data/competencies.js';
import {
  getCurrentCompetencyId,
  getStuMap, getStuFlags, getStuNames, getStuOrder,
  setCurIdx, setQIdx,
  getAnswerKey, setAnswerKey,
  markSaved,
} from './state.js';
import { getQ, getAmbitForQ, getAmbitRanges, getItemType, valDisplay } from './render.js';
import { getKeyCfg, normalizeKey } from './keyboard.js';
import { makeCell } from './grid.js';
import { showToast } from './ui.js';
import { hideCompletePrompt } from './student-modal.js';

// Internal local state
let keyDraft      = null;
let keyDraftQIdx  = 0;
let keyEditorOpen = false;

export function isKeyEditorOpen() { return keyEditorOpen; }

// ── Pending action plumbing (set by startup.js if user opens editor before key) ──
let _pendingAfterKey = null;
let _afterKeyEditorFn = () => {};
export function setPendingAfterKey(v) { _pendingAfterKey = v; }
export function getPendingAfterKey()  { return _pendingAfterKey; }
export function setAfterKeyEditorFn(fn) { _afterKeyEditorFn = fn; }

export function openKeyEditor() {
  const Q = getQ();
  const answerKey = getAnswerKey();
  keyDraft     = answerKey ? [...answerKey] : Array(Q).fill(null);
  keyDraftQIdx = 0;
  buildKeyGrid();
  renderKey();
  document.getElementById('key-overlay').classList.remove('off');
  keyEditorOpen = true;
}

export function closeKeyEditor() {
  document.getElementById('key-overlay').classList.add('off');
  keyEditorOpen = false;
  if (_pendingAfterKey !== null) _afterKeyEditorFn();
}

export function confirmKeyEditor() {
  const filled = keyDraft ? keyDraft.filter(v => v !== null).length : 0;
  if (!filled) { alert('Introduïu almenys una resposta.'); return; }
  setAnswerKey(keyDraft.map(v => v || ''));
  document.getElementById('key-badge').textContent   = '✓ Clau activada';
  document.getElementById('key-badge').style.display = 'inline-block';
  document.getElementById('btn-correct').disabled    = false;
  closeKeyEditor();
}

export function buildKeyGrid() {
  const bar = document.getElementById('key-ambit-bar');
  if (bar) bar.style.display = 'none';
  const grid = document.getElementById('key-grid');
  grid.innerHTML = '';
  grid.removeAttribute('style');
  const opts = {
    prefix: 'k',
    onClick: qi => { keyDraftQIdx = qi; renderKey(); },
  };
  const id   = getCurrentCompetencyId();
  const comp = COMPETENCIES[id];
  // 'default' is the pre-wizard placeholder; nothing to render yet.
  if (!comp || !comp.layout) return;

  const ranges    = getAmbitRanges();
  const colGroups = comp.layout.map(group => group.map(i => ranges[i]));

  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '8px';
  grid.style.alignItems = 'stretch';
  grid.classList.add('grid-narrow');
  colGroups.forEach(group => {
    const colEl = document.createElement('div');
    colEl.className = 'mat-col';
    group.forEach(range => {
      const sect = document.createElement('div');
      sect.className = 'sect';
      sect.style.flex = String(range.questions);
      const hdr = document.createElement('div');
      hdr.className = 'sect-hdr';
      hdr.style.background = range.color;
      hdr.textContent = range.name.toUpperCase();
      const cells = document.createElement('div');
      cells.className = 'cells';
      for (let i = 0; i < range.questions; i++) {
        cells.appendChild(makeCell(range.start + i, range.color, opts));
      }
      sect.appendChild(hdr); sect.appendChild(cells); colEl.appendChild(sect);
    });
    grid.appendChild(colEl);
  });
}

export function renderKey() {
  const Q = getQ();
  const answers = keyDraft;
  if (!answers) return;

  for (let qi = 0; qi < Q; qi++) {
    const cell  = document.getElementById(`kc${qi}`);
    const ansEl = document.getElementById(`ka${qi}`);
    if (!cell || !ansEl) continue;
    const val = answers[qi];
    const a   = getAmbitForQ(qi);

    cell.className    = 'cell';
    cell.dataset.v    = '';
    ansEl.className   = 'q-a';
    ansEl.dataset.val = '';
    cell.style.borderLeftColor = a.color;
    if (getItemType(qi) === 'vf' || getItemType(qi) === 'bin') cell.dataset.vf = '1';

    if (qi === keyDraftQIdx) {
      cell.classList.add('active');
      if (val !== null) {
        ansEl.textContent = valDisplay(val, qi);
        ansEl.dataset.val = val;
        ansEl.classList.add('preview');
      } else {
        ansEl.textContent = '';
      }
    } else if (val !== null) {
      cell.classList.add('filled');
      cell.dataset.v    = val;
      ansEl.textContent = valDisplay(val, qi);
      ansEl.dataset.val = val;
    } else {
      ansEl.textContent = '·';
    }
  }

  const filled = answers.filter(v => v !== null).length;
  document.getElementById('key-prog').style.width   = `${(filled / Q) * 100}%`;
  document.getElementById('key-filled').textContent = `${filled} / ${Q}`;
  document.getElementById('btn-save-key').disabled  = (filled < Q);
}

export function saveKeyAndMaybeDownload() {
  const Q = getQ();
  const filled = keyDraft ? keyDraft.filter(v => v !== null).length : 0;
  if (filled < Q) return;

  setAnswerKey(keyDraft.map(v => v || ''));
  document.getElementById('key-badge').textContent   = '✓ Clau activada';
  document.getElementById('key-badge').style.display = 'inline-block';
  document.getElementById('btn-correct').disabled    = false;
  closeKeyEditor();

  if (confirm('La clau ha estat desada internament.\nDesitges també baixar-la en un arxiu?')) {
    saveKeyTxt();
  }
}

export function saveKeyTxt() {
  const Q = getQ();
  const id = getCurrentCompetencyId();
  const lines = [
    `COMPETENCIA=${id}`,
    `Q=${Q}`,
    `RESPOSTES=${keyDraft.map(v => v || '').join(',')}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = id + '_clau_cb4eso.txt'; a.click();
  URL.revokeObjectURL(url);
}

// applyCompetency lives in startup.js — set via setter to avoid cycle
let _applyCompetency = () => {};
export function setApplyCompetencyFn(fn) { _applyCompetency = fn; }

export function loadKeyTxt(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = {};
      for (const line of e.target.result.split(/\r?\n/)) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) data[m[1]] = m[2];
      }
      let currentId = getCurrentCompetencyId();
      if (data.COMPETENCIA && data.COMPETENCIA !== currentId) {
        if (!COMPETENCIES[data.COMPETENCIA]) {
          alert(`⚠ La competència "${data.COMPETENCIA}" del fitxer no és coneguda.\nNo es carregarà la clau.`);
          return;
        }
        const targetLabel  = COMPETENCIES[data.COMPETENCIA].label;
        const currentLabel = COMPETENCIES[currentId]?.label || currentId;
        const stuOrder = getStuOrder();
        const extraWarn = stuOrder.length > 0
          ? `\n\n⚠ Si continueu, es perdran els ${stuOrder.length} alumne${stuOrder.length !== 1 ? 's' : ''} introduïts (les respostes són d'una competència diferent).`
          : '';
        if (!confirm(
          `Aquest arxiu és per a la competència «${targetLabel}», ` +
          `però ara teniu «${currentLabel}» activa.\n\n` +
          `Voleu canviar a «${targetLabel}» i carregar la clau?` +
          extraWarn
        )) return;
        if (stuOrder.length > 0) {
          const stuMap   = getStuMap();
          const stuFlags = getStuFlags();
          const stuNames = getStuNames();
          Object.keys(stuMap).forEach(k => delete stuMap[k]);
          Object.keys(stuFlags).forEach(k => delete stuFlags[k]);
          Object.keys(stuNames).forEach(k => delete stuNames[k]);
          stuOrder.length = 0;
          setCurIdx(-1);
          setQIdx(0);
          hideCompletePrompt();
          markSaved();
        }
        _applyCompetency(data.COMPETENCIA);
        currentId = getCurrentCompetencyId();
        if (keyEditorOpen) buildKeyGrid();
      }
      const Q = getQ();
      const src = data.RESPOSTES || '';
      if (!src) { alert('Format de fitxer no reconegut.'); return; }

      const parsed = src.split(',').map(v => v.trim() === '' ? null : v.trim().toUpperCase());

      if (parsed.length !== Q) {
        alert(
          `⚠ El fitxer conté ${parsed.length} respostes, però la competència actual ` +
          `("${currentId}") en requereix ${Q}.\n\nNo es carregarà la clau.`
        );
        return;
      }

      const VALID = new Set(['A', 'B', 'C', 'D', 'E', '_']);
      const badIdx = parsed.findIndex(v => v !== null && !VALID.has(v));
      if (badIdx !== -1) {
        alert(
          `⚠ Valor invàlid a la posició ${badIdx + 1}: "${parsed[badIdx]}".\n\n` +
          `Les respostes vàlides són A, B, C, D, E o _ (en blanc).\nNo es carregarà la clau.`
        );
        return;
      }

      const filled = parsed.filter(v => v !== null).length;
      if (filled < Q) {
        keyDraft     = parsed;
        keyDraftQIdx = parsed.findIndex(v => v === null);
        if (keyDraftQIdx === -1) keyDraftQIdx = 0;
        renderKey();
        alert(
          `⚠ El fitxer només té ${filled}/${Q} respostes.\n` +
          `S'han carregat a l'editor; cal completar les ${Q - filled} restants abans de desar.`
        );
        return;
      }

      keyDraft     = parsed;
      keyDraftQIdx = 0;
      setAnswerKey(keyDraft.map(v => v || ''));
      document.getElementById('key-badge').textContent   = '✓ Clau activada';
      document.getElementById('key-badge').style.display = 'inline-block';
      document.getElementById('btn-correct').disabled    = false;
      closeKeyEditor();
      showToast('✓ La clau ha estat carregada correctament');
    } catch (err) {
      alert('Error llegint el fitxer: ' + err.message);
    }
  };
  reader.readAsText(file);
}

export function keyGoBack() {
  if (!keyDraft) return;
  if (keyDraftQIdx > 0) { keyDraftQIdx--; keyDraft[keyDraftQIdx] = null; }
  else keyDraft[0] = null;
  renderKey();
}

export function initKeyEditorKeyboard() {
  document.addEventListener('keydown', e => {
    if (!keyEditorOpen) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const Q = getQ();
    if (!keyDraft) return;

    if (e.key === 'Escape')    { e.preventDefault(); closeKeyEditor(); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); keyDraftQIdx = Math.max(keyDraftQIdx - 1, 0);     renderKey(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); keyDraftQIdx = Math.min(keyDraftQIdx + 1, Q - 1); renderKey(); return; }

    const lk = normalizeKey(e);
    const keyCfg = getKeyCfg();
    if (lk === keyCfg.erase) { e.preventDefault(); keyGoBack(); return; }

    const _ktype = getItemType(keyDraftQIdx);
    const answerMap = (_ktype === 'vf' || _ktype === 'bin')
      ? { [keyCfg.V]: 'A', [keyCfg.F]: 'B', [keyCfg.blank]: '_' }
      : _ktype === 'abcde'
        ? { [keyCfg.A]: 'A', [keyCfg.B]: 'B', [keyCfg.C]: 'C', [keyCfg.D]: 'D', [keyCfg.E]: 'E', [keyCfg.blank]: '_' }
        : { [keyCfg.A]: 'A', [keyCfg.B]: 'B', [keyCfg.C]: 'C', [keyCfg.D]: 'D', [keyCfg.blank]: '_' };

    const val = answerMap[lk];
    if (val !== undefined) {
      e.preventDefault();
      keyDraft[keyDraftQIdx] = val;
      if (keyDraftQIdx < Q - 1) keyDraftQIdx++;
      renderKey();
    }
  });
}
