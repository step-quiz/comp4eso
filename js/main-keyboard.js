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
  getStuOrder, setStudentAnswer, setStudentFlag,
  isStuCompletePrompt,
  markUnsaved,
} from './state.js';
import { getQ, getItemType, render, findNextFlaggedQ } from './render.js';
import { getKeyCfg, normalizeKey } from './keyboard.js';
import { isKeyEditorOpen } from './key-editor.js';
import {
  hideCompletePrompt, showCompletePrompt,
} from './student-modal.js';
import { moveCell, goBack } from './navigation.js';
import { nextStu } from './navigation.js';

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

    // Tab / Shift+Tab: salta a la pregunta flagejada següent / anterior
    // de l'alumne actual. Només té efecte si hi ha cap flag pendent.
    if (e.key === 'Tab') {
      const dir = e.shiftKey ? -1 : 1;
      const Q = getQ();
      const cur = Math.min(getQIdx(), Q - 1);
      const target = findNextFlaggedQ(cur, dir);
      if (target >= 0) {
        e.preventDefault();
        setQIdx(target);
        render();
      }
      return;
    }

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
      const stuOrder = getStuOrder();
      setStudentAnswer(stuOrder[curIdx], qIdx, val);
      // L'usuari ha confirmat un valor: la flag d'incertesa de la IA ja
      // no és rellevant — l'humà ja ha revisat aquesta cel·la.
      setStudentFlag(stuOrder[curIdx], qIdx, null);
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
