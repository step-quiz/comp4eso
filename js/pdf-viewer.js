// ═══════════════════════════════════════════════════════════════════════
// js/pdf-viewer.js — PDF viewer wrapper around pdf.js (loaded as a global
// from CDN). Runtime state (current page, zoom, render task) is stored
// in state.js so it can be accessed from navigation/student-modal.
// ═══════════════════════════════════════════════════════════════════════

import {
  getPdfDoc, setPdfDoc,
  getPdfTotalPages, setPdfTotalPages,
  getPdfCurrentPage, setPdfCurrentPage,
  getPdfRenderTask, setPdfRenderTask,
  getPdfResizeTimer, setPdfResizeTimer,
  getPdfZoom, setPdfZoom,
  getCurIdx, getStuOrder,
} from './state.js';

const pdfjsLib = window.pdfjsLib;

export function initPdfWorker() {
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

export function updatePdfToggleBtn() {
  const btn = document.getElementById('btn-pdf-toggle');
  const hasPane = document.body.classList.contains('has-pdf');
  btn.textContent = hasPane
    ? '🔍  Desactivar el visualitzador PDF'
    : '🔍  Activar el visualitzador PDF';
}

// Forward-declared by setter: openModal lives in student-modal.js.
let _openModal = () => {};
export function setOpenModalFn(fn) { _openModal = fn; }

export function togglePdfPane() {
  if (!getPdfDoc()) {
    document.getElementById('pdf-file').click();
  } else {
    document.body.classList.toggle('has-pdf');
    updatePdfToggleBtn();
  }
}

export async function loadPdfFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    setPdfDoc(doc);
    setPdfTotalPages(doc.numPages);
    document.body.classList.add('has-pdf');
    document.getElementById('pdf-bar-name').textContent = file.name;
    document.getElementById('pdf-prompt-overlay').classList.add('off');
    updatePdfToggleBtn();
    const curIdx = getCurIdx();
    const stuOrder = getStuOrder();
    const initialPage = curIdx >= 0
      ? Math.min(curIdx + 1, getPdfTotalPages())
      : Math.min(stuOrder.length + 1, getPdfTotalPages());
    await renderPdfPage(initialPage);
    const stuOpen = !document.getElementById('stu-overlay').classList.contains('off');
    if (!stuOpen && curIdx < 0) _openModal();
  } catch (err) {
    alert('Error carregant el PDF: ' + err.message);
  }
}

export function skipPdf() {
  document.getElementById('pdf-prompt-overlay').classList.add('off');
  _openModal();
}

export function changePdfZoom(delta) {
  setPdfZoom(Math.min(3.0, Math.max(0.4, getPdfZoom() + delta)));
  document.getElementById('pdf-zoom-lbl').textContent =
    Math.round(getPdfZoom() * 100) + '%';
  renderPdfPage(getPdfCurrentPage());
}

export async function renderPdfPage(pageNum) {
  const pdfDoc = getPdfDoc();
  const pdfTotalPages = getPdfTotalPages();
  if (!pdfDoc || pageNum < 1 || pageNum > pdfTotalPages) return;
  const prev = getPdfRenderTask();
  if (prev) { try { prev.cancel(); } catch (_) {} setPdfRenderTask(null); }
  try {
    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');
    const pane = document.getElementById('pdf-pane');
    const availW = Math.max(100, pane.clientWidth - 16);
    const v1 = page.getViewport({ scale: 1 });
    const dpr = window.devicePixelRatio || 1;
    const fitScale = availW / v1.width;
    const pdfZoom = getPdfZoom();
    const displayW = availW * pdfZoom;
    const viewport = page.getViewport({ scale: fitScale * pdfZoom * Math.min(2, dpr + 1) });
    canvas.width  = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width  = displayW + 'px';
    canvas.style.height = Math.round(displayW * v1.height / v1.width) + 'px';
    const task = page.render({ canvasContext: ctx, viewport });
    setPdfRenderTask(task);
    await task.promise;
    setPdfRenderTask(null);
    setPdfCurrentPage(pageNum);
    if (pdfZoom <= 1.0) pane.scrollTop = 0;
    document.getElementById('pdf-bar-page').textContent = `Pàg. ${pageNum} / ${pdfTotalPages}`;
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') return;
    console.error('PDF render error:', err);
  }
}

export function syncPdfToCurrent() {
  const pdfDoc = getPdfDoc();
  const curIdx = getCurIdx();
  if (!pdfDoc || curIdx < 0) return;
  const t = Math.min(curIdx + 1, getPdfTotalPages());
  if (t !== getPdfCurrentPage()) renderPdfPage(t);
}

export function syncPdfToNextSlot() {
  if (!getPdfDoc()) return;
  const t = Math.min(getStuOrder().length + 1, getPdfTotalPages());
  if (t !== getPdfCurrentPage()) renderPdfPage(t);
}

export function initPdfResizeListener() {
  window.addEventListener('resize', () => {
    if (!getPdfDoc() || getPdfCurrentPage() < 1) return;
    clearTimeout(getPdfResizeTimer());
    setPdfResizeTimer(setTimeout(() => renderPdfPage(getPdfCurrentPage()), 150));
  });
}
