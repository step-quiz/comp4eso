// ═══════════════════════════════════════════════════════════════════════
// js/main-keyboard.js — Top-level keyboard handler for answer entry.
//
// Handles arrow-key navigation, the configured "erase" key, and answer
// keys (A/B/C/D/E or V/F depending on the item type at the current
// position). Active only when no modal is open and no editable input
// has focus.
// ═══════════════════════════════════════════════════════════════════════

import {
  getCurIdx, getQIdx, setQIdx,
  getStuMap, getStuOrder,
  isStuCompletePrompt,
  markUnsaved,
} from './state.js';
import { getQ, getItemType, render } from './render.js';
import { getKeyCfg, normalizeKey } from './keyboard.js';
import { isKeyEditorOpen } from './key-editor.js';
import {
  hideCompletePrompt, showCompletePrompt,
} from './student-modal.js';
import { moveCell, goBack } from './navigation.js';
import { nextStu } from './navigation.js';
import { skipPdf } from './pdf-viewer.js';

export function initMainKeyboard() {
  document.addEventListener('keydown', e => {
    const Q = getQ();
    if (isKeyEditorOpen()) return;  // key editor has its own handler

    const anyModalOpen =
      !document.getElementById('stu-overlay').classList.contains('off')     ||
      !document.getElementById('cfg-overlay').classList.contains('off')     ||
      !document.getElementById('comp-overlay').classList.contains('off')    ||
      !document.getElementById('results-overlay').classList.contains('off') ||
      !document.getElementById('correct-overlay').classList.contains('off') ||
      !document.getElementById('faq-overlay').classList.contains('off')     ||
      !document.getElementById('centre-overlay').classList.contains('off');

    const pdfPromptOpen = !document.getElementById('pdf-prompt-overlay').classList.contains('off');
    if (pdfPromptOpen) {
      if (e.key === 'Escape') { e.preventDefault(); skipPdf(); }
      return;
    }
    if (anyModalOpen) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (isStuCompletePrompt()) {
      e.preventDefault();
      hideCompletePrompt();
      if (e.key === 'Escape') { setQIdx(Q - 1); render(); }
      else nextStu();
      return;
    }

    if (e.key === 'ArrowUp')    { e.preventDefault(); moveCell('up');    return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveCell('down');  return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveCell('left');  return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCell('right'); return; }

    const keyCfg = getKeyCfg();
    const lk = normalizeKey(e);
    if (lk === keyCfg.erase) { e.preventDefault(); goBack(); return; }

    const qIdx = getQIdx();
    const _type = getItemType(qIdx);
    const answerMap = (_type === 'vf' || _type === 'bin')
      ? { [keyCfg.V]: 'A', [keyCfg.F]: 'B', [keyCfg.blank]: '_' }
      : _type === 'abcde'
        ? { [keyCfg.A]: 'A', [keyCfg.B]: 'B', [keyCfg.C]: 'C', [keyCfg.D]: 'D', [keyCfg.E]: 'E', [keyCfg.blank]: '_' }
        : { [keyCfg.A]: 'A', [keyCfg.B]: 'B', [keyCfg.C]: 'C', [keyCfg.D]: 'D', [keyCfg.blank]: '_' };

    const val = answerMap[lk];
    const curIdx = getCurIdx();
    if (val !== undefined && curIdx >= 0) {
      e.preventDefault();
      const stuMap = getStuMap();
      const stuOrder = getStuOrder();
      stuMap[stuOrder[curIdx]][qIdx] = val;
      markUnsaved();
      if (qIdx < Q - 1) {
        setQIdx(qIdx + 1);
      } else {
        setQIdx(Q);
        render();
        showCompletePrompt();
        return;
      }
      render();
    }
  });
}
