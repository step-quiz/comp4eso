// ═══════════════════════════════════════════════════════════════════════
// js/navigation.js — Inter-student and inter-cell navigation.
// ═══════════════════════════════════════════════════════════════════════

import {
  getCurIdx, setCurIdx, getQIdx, setQIdx,
  getStuMap, getStuOrder, markUnsaved,
  clearStudentFlag,
} from './state.js';
import { getQ, getAmbitRanges, render } from './render.js';
import { syncPdfToCurrent } from './pdf-viewer.js';
import { hideCompletePrompt, openModal } from './student-modal.js';

export function prevStu() {
  hideCompletePrompt();
  const curIdx = getCurIdx();
  if (curIdx > 0) {
    const newIdx = curIdx - 1;
    setCurIdx(newIdx);
    const key = getStuOrder()[newIdx];
    const Q = getQ();
    let qIdx = getStuMap()[key].findIndex(v => v === null);
    if (qIdx === -1) qIdx = Q;
    setQIdx(qIdx);
    render();
    syncPdfToCurrent();
  }
}

export function nextStu() {
  hideCompletePrompt();
  const curIdx = getCurIdx();
  const stuOrder = getStuOrder();
  if (curIdx < stuOrder.length - 1) {
    const newIdx = curIdx + 1;
    setCurIdx(newIdx);
    const key = stuOrder[newIdx];
    const Q = getQ();
    let qIdx = getStuMap()[key].findIndex(v => v === null);
    if (qIdx === -1) qIdx = Q;
    setQIdx(qIdx);
    render();
    syncPdfToCurrent();
  } else {
    openModal();
  }
}

export function moveCell(dir) {
  const Q = getQ();
  const curIdx = getCurIdx();
  if (curIdx < 0) return;
  hideCompletePrompt();
  let qIdx = getQIdx();
  const cur = qIdx >= Q ? Q - 1 : qIdx;
  const ranges = getAmbitRanges();
  const curAmbitIdx = ranges.findIndex(r => cur >= r.start && cur < r.end);
  const curAmbit = ranges[curAmbitIdx >= 0 ? curAmbitIdx : 0];
  const localPos = cur - curAmbit.start;

  if (dir === 'up')   qIdx = Math.max(cur - 1, 0);
  if (dir === 'down') qIdx = Math.min(cur + 1, Q - 1);
  if (dir === 'left'  && curAmbitIdx > 0) {
    const prev = ranges[curAmbitIdx - 1];
    qIdx = prev.start + Math.min(localPos, prev.questions - 1);
  }
  if (dir === 'right' && curAmbitIdx < ranges.length - 1) {
    const next = ranges[curAmbitIdx + 1];
    qIdx = next.start + Math.min(localPos, next.questions - 1);
  }
  setQIdx(qIdx);
  render();
}

export function goBack() {
  const Q = getQ();
  const curIdx = getCurIdx();
  if (curIdx < 0) return;
  hideCompletePrompt();
  const stuOrder = getStuOrder();
  const stuMap   = getStuMap();
  let qIdx = getQIdx();
  if (qIdx >= Q) { setQIdx(Q - 1); render(); return; }
  if (qIdx > 0) {
    qIdx--;
    setQIdx(qIdx);
    stuMap[stuOrder[curIdx]][qIdx] = null;
    clearStudentFlag(stuOrder[curIdx], qIdx);  // l'usuari ha tocat la cel·la
    markUnsaved();
  } else if (curIdx > 0) {
    const newCur = curIdx - 1;
    setCurIdx(newCur);
    qIdx = Q - 1;
    setQIdx(qIdx);
    stuMap[stuOrder[newCur]][qIdx] = null;
    clearStudentFlag(stuOrder[newCur], qIdx);
    markUnsaved();
  }
  render();
}
