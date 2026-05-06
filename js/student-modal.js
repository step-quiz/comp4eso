// ═══════════════════════════════════════════════════════════════════════
// js/student-modal.js — Student creation / inline rename / completion prompt.
// ═══════════════════════════════════════════════════════════════════════

import {
  getStuMap, getStuFlags, getStuNames, getStuOrder, setStuOrder,
  getCurIdx, setCurIdx, setQIdx,
  isStuCompletePrompt, setStuCompletePrompt,
  markUnsaved, markSaved,
} from './state.js';
import { getQ, render } from './render.js';
import { syncPdfToCurrent, syncPdfToNextSlot } from './pdf-viewer.js';

export function showCompletePrompt() {
  setStuCompletePrompt(true);
  document.getElementById('done-prompt').classList.remove('off');
}

export function hideCompletePrompt() {
  setStuCompletePrompt(false);
  document.getElementById('done-prompt').classList.add('off');
}

export function editNameInline() {
  const curIdx   = getCurIdx();
  if (curIdx < 0) return;
  const stuOrder = getStuOrder();
  const stuNames = getStuNames();
  const el  = document.getElementById('hdr-name');
  const key = stuOrder[curIdx];
  const cur = stuNames[key] || '';
  const inp = document.createElement('input');
  inp.type        = 'text';
  inp.value       = cur;
  inp.placeholder = key;
  inp.style.cssText = `
    font: inherit; font-size: 1.68rem; font-weight: 600;
    color: var(--accent); background: transparent;
    border: none; border-bottom: 2px solid var(--accent);
    outline: none; text-align: center;
    width: ${Math.max(120, cur.length * 22)}px; max-width: 30vw;
  `;
  el.textContent = '';
  el.appendChild(inp);
  inp.focus();
  inp.select();

  let cancelled = false;
  const finalize = () => {
    if (cancelled) {
      el.textContent = stuNames[key] || key;
      return;
    }
    const val = inp.value.trim();
    stuNames[key] = val;
    el.textContent = val || key;
    markUnsaved();
  };

  inp.addEventListener('blur', finalize);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelled = true; inp.blur(); }
  });
}

export function openModal() {
  const stuOrder = getStuOrder();
  document.getElementById('d-name').value = '';
  const nextN = stuOrder.length + 1;
  const preview = `alum_${nextN}`;
  document.getElementById('auto-name-preview').textContent = preview;
  document.getElementById('m-prev').textContent = preview;
  document.getElementById('load-hint').style.display = stuOrder.length === 0 ? 'block' : 'none';
  document.getElementById('stu-overlay').classList.remove('off');
  setTimeout(() => document.getElementById('d-name').focus(), 40);
  syncPdfToNextSlot();
}

export function closeModal() {
  document.getElementById('stu-overlay').classList.add('off');
}

export function confirmStudent() {
  const Q = getQ();
  const stuOrder = getStuOrder();
  const stuMap   = getStuMap();
  const stuFlags = getStuFlags();
  const stuNames = getStuNames();
  const nextN = stuOrder.length + 1;
  const rawName = document.getElementById('d-name').value.trim();
  const name = rawName !== '' ? rawName : `alum_${nextN}`;
  const key  = String(nextN);

  stuMap[key]   = Array(Q).fill(null);
  stuFlags[key] = Array(Q).fill(null);   // alumne creat manualment: cap flag
  stuNames[key] = name;
  stuOrder.push(key);
  setCurIdx(stuOrder.length - 1);
  setQIdx(0);
  markUnsaved();
  closeModal();
  render();
  syncPdfToCurrent();
}

export function clearAllData() {
  if (!confirm(
    'Segur que vols esborrar les respostes introduïdes?\n' +
    'Tots els alumnes i les seves respostes seran eliminats.\n\n' +
    'La clau de respostes correctes i la configuració del centre es mantindran.'
  )) return;
  const stuMap   = getStuMap();
  const stuFlags = getStuFlags();
  const stuNames = getStuNames();
  const stuOrder = getStuOrder();
  Object.keys(stuMap).forEach(k => delete stuMap[k]);
  Object.keys(stuFlags).forEach(k => delete stuFlags[k]);
  Object.keys(stuNames).forEach(k => delete stuNames[k]);
  stuOrder.length = 0;
  setCurIdx(-1);
  setQIdx(0);
  hideCompletePrompt();
  markSaved();
  render();
  openModal();
}

export function initStudentModalListeners() {
  // Click on the overlay backdrop (outside the modal panel) → same as ESC
  document.getElementById('stu-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('stu-overlay')) closeModal();
  });

  // Modal-level keydown
  document.addEventListener('keydown', e => {
    const stuOpen = !document.getElementById('stu-overlay').classList.contains('off');
    if (!stuOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    if (e.key === 'Enter' && document.activeElement.id === 'd-name') {
      e.preventDefault(); confirmStudent();
    }
  });

  // Name input keydown + input
  const dName = document.getElementById('d-name');
  dName.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    if (e.key === 'Enter')  { e.preventDefault(); confirmStudent(); }
  });
  dName.addEventListener('input', function () {
    const stuOrder = getStuOrder();
    const nextN = stuOrder.length + 1;
    const preview = this.value.trim() !== '' ? this.value.trim() : `alum_${nextN}`;
    document.getElementById('m-prev').textContent = preview;
  });
}
