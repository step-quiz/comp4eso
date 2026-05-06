// ═══════════════════════════════════════════════════════════════════════
// js/export.js — XLSX export of student answers, import from XLSX,
// and download of corrected results.
//
// Depends on the global `ExcelJS` loaded from CDN before this module.
// ═══════════════════════════════════════════════════════════════════════

import { COMPETENCIES } from '../data/competencies.js';
import {
  getCurrentCompetencyId,
  getStuMap, setStuMap, setStuFlags, getStuNames, setStuNames, getStuOrder, setStuOrder,
  getCentreCfg, setCentreCfg,
  setCurIdx, setQIdx,
  getAnswerKey, setAnswerKey,
  getLastResults,
  getAiLog,
  markSaved,
} from './state.js';
import { getQ, getAmbitRanges, getItemLabel, getItemType, getAmbitForQ, valDisplay, render } from './render.js';
import { hideCompletePrompt } from './student-modal.js';

// applyCompetency lives in startup.js — set via setter to avoid cycle
let _applyCompetency = () => {};
export function setApplyCompetencyFn(fn) { _applyCompetency = fn; }

const ExcelJS = window.ExcelJS;

export async function exportRespostes() {
  const Q = getQ();
  const stuOrder = getStuOrder();
  if (!stuOrder.length) { alert('No hi ha cap alumne introduït.'); return; }
  const stuMap = getStuMap();
  const stuNames = getStuNames();
  const centreCfg = getCentreCfg();
  const currentCompetencyId = getCurrentCompetencyId();
  const wb = new ExcelJS.Workbook();
  const ranges = getAmbitRanges();

  const wsMeta = wb.addWorksheet('_meta');
  wsMeta.state = 'veryHidden';
  wsMeta.addRow(['COMPETENCIA', currentCompetencyId]);
  wsMeta.addRow(['Q', Q]);
  wsMeta.addRow(['LABELS', Array.from({ length: Q }, (_, i) => getItemLabel(i)).join(',')]);
  wsMeta.addRow(['TYPES',  Array.from({ length: Q }, (_, i) => getItemType(i)).join(',')]);
  wsMeta.addRow(['CENTRE', centreCfg.centre]);
  wsMeta.addRow(['CURS',   centreCfg.curs]);

  const ws = wb.addWorksheet('Respostes');
  ws.columns = [
    { width: 24 },
    ...Array.from({ length: Q }, (_, i) => ({ width: getItemLabel(i).length > 2 ? 6.5 : 5 })),
  ];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  ws.addRow(Array(Q + 1).fill(''));
  ws.mergeCells(1, 1, 2, 1);
  const nomCell = ws.getCell(1, 1);
  nomCell.value     = 'Nom';
  nomCell.font      = { bold: true, size: 9 };
  nomCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
  nomCell.alignment = { horizontal: 'center', vertical: 'middle' };
  nomCell.border    = { bottom: { style: 'medium', color: { argb: 'FF90B4D8' } } };

  ranges.forEach(a => {
    const colS = 2 + a.start;
    const colE = 1 + a.end;
    if (colE >= colS) ws.mergeCells(1, colS, 1, colE);
    const cell = ws.getCell(1, colS);
    const argb = 'FF' + a.color.replace('#', '');
    cell.value     = a.name;
    cell.font      = { bold: true, size: 8, color: { argb } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = {
      left:   { style: 'thin',   color: { argb } },
      bottom: { style: 'medium', color: { argb } },
    };
  });
  ws.getRow(1).height = 20;

  const lblValues = ['', ...Array.from({ length: Q }, (_, i) => getItemLabel(i))];
  ws.addRow(lblValues);
  ranges.forEach(a => {
    const argb = 'FF' + a.color.replace('#', '');
    for (let i = a.start; i < a.end; i++) {
      const cell = ws.getCell(2, 2 + i);
      cell.font     = { bold: true, size: 8, color: { argb } };
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F2F5' } };
      cell.alignment= { horizontal: 'center' };
      cell.border   = { bottom: { style: 'thin', color: { argb } } };
    }
  });
  ws.getRow(2).height = 14;

  const WHITE = 'FFFFFFFF', GREY = 'FFF4F4F4';
  stuOrder.forEach((key, i) => {
    const dispAnswers = stuMap[key].map((v, qi) => {
      if (v === null) return '';
      if (v === '_')  return '—';
      const type = getItemType(qi);
      if (type === 'bin') return v;
      return valDisplay(v, qi);
    });
    const row = ws.addRow([stuNames[key] || key, ...dispAnswers]);
    const bg = i % 2 === 0 ? WHITE : GREY;
    row.getCell(1).alignment = { horizontal: 'left' };
    row.getCell(1).font      = { size: 9 };
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      if (colNum > 1) cell.alignment = { horizontal: 'center' };
    });
  });

  const buf  = await wb.xlsx.writeBuffer();
  _maybeAddOmrLogSheet(wb);
  const buf2 = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf2], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = currentCompetencyId + '_respostes_cb4eso.xlsx'; a.click();
  URL.revokeObjectURL(url);
  markSaved();
}

// ─── Full addicional "Log OMR" ────────────────────────────────────────
//
// Si en aquesta sessió s'ha fet un reconeixement automàtic (aiLog != null),
// s'afegeix un full "Log OMR" al workbook amb el resum de cada pàgina:
// model usat, data/hora, nom detectat, respostes vàlides i comentaris de la IA.

function _maybeAddOmrLogSheet(wb) {
  const aiLog = getAiLog();
  if (!aiLog) return;

  const ws = wb.addWorksheet('Log OMR');
  ws.columns = [
    { width: 8  },   // Pàgina
    { width: 24 },   // Nom
    { width: 14 },   // Respostes
    { width: 8  },   // Polèmiques (tricky, d=1)
    { width: 8  },   // Dubtes (doubt, d=2)
    { width: 52 },   // Comentari IA
    { width: 10 },   // Estat
  ];

  // ── Capçalera del full ──
  const runDate = new Date(aiLog.runAt);
  const dateStr = runDate.toLocaleDateString('ca-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value     = 'Log de reconeixement automàtic OMR';
  titleCell.font      = { bold: true, size: 11, color: { argb: 'FF1A4F8A' } };
  titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 20;

  ws.mergeCells('A2:G2');
  const metaCell = ws.getCell('A2');
  metaCell.value     = `Model: ${aiLog.model}   ·   Data: ${dateStr}   ·   ${aiLog.entries.length} full(s) processats`;
  metaCell.font      = { italic: true, size: 9, color: { argb: 'FF555555' } };
  metaCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
  metaCell.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 14;

  // ── Fila de capçaleres de columna ──
  const HDR_ARGB = 'FF1A4F8A';
  const hdrRow = ws.addRow(['Pàgina', 'Nom detectat', 'Respostes vàl.', '⚑ Polèm.', '⚑ Dubt.', 'Comentari de la IA', 'Estat']);
  hdrRow.height = 15;
  hdrRow.eachCell(cell => {
    cell.font      = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_ARGB } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  hdrRow.getCell(2).alignment = { horizontal: 'left' };
  hdrRow.getCell(6).alignment = { horizontal: 'left' };

  // ── Files de dades ──
  const WHITE = 'FFFFFFFF', GREY = 'FFF4F4F4';
  aiLog.entries.forEach((e, i) => {
    const bg      = i % 2 === 0 ? WHITE : GREY;
    const estat   = e.failed ? '⚠ Error' : (e.valid === e.total ? '✓ OK' : `✓ ${e.valid}/${e.total}`);
    const tricky  = e.tricky | 0;
    const doubt   = e.doubt  | 0;
    const row     = ws.addRow([
      e.page,
      e.failed ? '(error d\'API)' : (e.name || '(sense nom)'),
      e.failed ? '—' : `${e.valid} / ${e.total}`,
      e.failed ? '—' : (tricky || ''),
      e.failed ? '—' : (doubt  || ''),
      e.failed ? e.error : (e.comment || ''),
      estat,
    ]);
    row.height = 13;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font      = { size: 9 };
      cell.alignment = { horizontal: (colNum === 1 || colNum === 3 || colNum === 4 || colNum === 5 || colNum === 7)
        ? 'center' : 'left', vertical: 'middle' };
    });
    // Color suau a les columnes de flags si hi ha valor
    if (!e.failed) {
      if (tricky > 0) {
        row.getCell(4).font = { size: 9, bold: true, color: { argb: 'FF8A6A00' } };
        row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } };
      }
      if (doubt > 0) {
        row.getCell(5).font = { size: 9, bold: true, color: { argb: 'FFB02020' } };
        row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE6E6' } };
      }
    }
    // Color de la columna Estat
    const estatCell = row.getCell(7);
    if (e.failed) {
      estatCell.font = { bold: true, size: 9, color: { argb: 'FFCC4444' } };
    } else {
      estatCell.font = { size: 9, color: { argb: 'FF27AE60' } };
    }
  });
}

// ─── Importació de respostes ──────────────────────────────────────────

export async function importRespostes(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  try {
    const buf = await file.arrayBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);

    const wsMeta = wb2.getWorksheet('_meta');
    let importCompId = null, importLabels = null, importTypes = null;
    let importCentre = null, importCurs = null;
    if (wsMeta) {
      wsMeta.eachRow(row => {
        const k = String(row.getCell(1).value || '');
        const v = String(row.getCell(2).value || '');
        if (k === 'COMPETENCIA') importCompId = v;
        if (k === 'LABELS')      importLabels = v.split(',');
        if (k === 'TYPES')       importTypes  = v.split(',');
        if (k === 'CENTRE')      importCentre = v;
        if (k === 'CURS')        importCurs   = v;
      });
    }
    if (importCentre || importCurs) {
      const centreCfg = getCentreCfg();
      setCentreCfg({
        centre: importCentre || centreCfg.centre,
        curs:   importCurs   || centreCfg.curs,
      });
    }

    let currentCompetencyId = getCurrentCompetencyId();
    if (importCompId && importCompId !== currentCompetencyId) {
      if (!COMPETENCIES[importCompId]) {
        alert(`⚠ La competència "${importCompId}" del fitxer no és coneguda.\nNo es carregaran les dades.`);
        return;
      }
      const targetLabel = COMPETENCIES[importCompId].label;
      const currentLabel = COMPETENCIES[currentCompetencyId]?.label || currentCompetencyId;
      if (!confirm(
        `⚠ Atenció — l'arxiu de càlcul no correspon a la competència que estàs avaluant.\n\n` +
        `Aquest fitxer és per a «${targetLabel}», però ara teniu «${currentLabel}» activa.\n\n` +
        `Voleu canviar a «${targetLabel}» i carregar les dades?`
      )) return;
      _applyCompetency(importCompId);
      currentCompetencyId = getCurrentCompetencyId();
      if (getAnswerKey()) {
        setAnswerKey(null);
        document.getElementById('key-badge').style.display = 'none';
        document.getElementById('btn-correct').disabled = true;
      }
    }

    const Q = getQ();
    const ws2 = wb2.getWorksheet('Respostes');
    if (!ws2) { alert('No s\'ha trobat el full "Respostes" al fitxer.'); return; }

    const r1c1 = String(ws2.getRow(1).getCell(1).value || '').trim();
    const isNewFormat = importLabels !== null || (r1c1 === 'Nom');
    const dataStartRow = isNewFormat ? 3 : 2;
    const labelRowNum  = isNewFormat ? 2 : 1;

    const labelToIdx = {};
    if (importLabels) {
      importLabels.forEach((lbl, qi) => { labelToIdx[lbl.trim()] = qi; });
    } else {
      for (let qi = 0; qi < Q; qi++) labelToIdx[getItemLabel(qi)] = qi;
    }

    const colToQi = {};
    ws2.getRow(labelRowNum).eachCell((cell, colNum) => {
      if (colNum === 1) return;
      const lbl = String(cell.value || '').trim();
      if (lbl in labelToIdx) colToQi[colNum] = labelToIdx[lbl];
    });

    const hasMappedCols = Object.keys(colToQi).length > 0;
    if (!hasMappedCols) {
      for (let qi = 0; qi < Q; qi++) colToQi[2 + qi] = qi;
    }

    function toInternal(raw, qi) {
      if (!raw || raw === '') return null;
      const r = raw.trim().toUpperCase();
      const type = importTypes ? importTypes[qi] : getItemType(qi);
      if (type === 'vf' || type === 'bin') {
        if (r === 'V') return 'A';
        if (r === 'F') return 'B';
        if (r === '—' || r === '-') return '_';
        if (r === 'A' || r === 'B' || r === '_') return r;
        return null;
      } else if (type === 'abcde') {
        if (r === '—' || r === '-') return '_';
        if (['A','B','C','D','E','_'].includes(r)) return r;
        return null;
      } else {
        if (r === '—' || r === '-') return '_';
        if (['A','B','C','D','_'].includes(r)) return r;
        return null;
      }
    }

    const newStuMap = {}, newStuNames = {}, newStuOrder = [];
    ws2.eachRow((row, rowNum) => {
      if (rowNum < dataStartRow) return;
      const name = String(row.getCell(1).value || '').trim();
      if (!name) return;
      const idx = String(newStuOrder.length + 1);
      newStuOrder.push(idx);
      newStuNames[idx] = name;
      const answers = Array(Q).fill(null);
      Object.entries(colToQi).forEach(([colNum, qi]) => {
        if (qi >= Q) return;
        const rawVal = row.getCell(parseInt(colNum)).value;
        answers[qi] = toInternal(String(rawVal ?? ''), qi);
      });
      newStuMap[idx] = answers;
    });

    if (!newStuOrder.length) { alert('No s\'ha trobat cap alumne al fitxer.'); return; }

    if (getStuOrder().length > 0) {
      const stuOrder = getStuOrder();
      if (!confirm(
        `Les dades actuals (${stuOrder.length} alumne${stuOrder.length !== 1 ? 's' : ''}) seran substituïdes ` +
        `per les del fitxer (${newStuOrder.length} alumne${newStuOrder.length !== 1 ? 's' : ''}).\nContinuar?`
      )) return;
    }

    setStuMap(newStuMap);
    setStuNames(newStuNames);
    setStuOrder(newStuOrder);
    // Reset de flags: les dades importades d'un XLSX no porten cap incertesa
    // de la IA (ja són dades validades per humans en alguna sessió anterior).
    const newStuFlags = {};
    newStuOrder.forEach(k => { newStuFlags[k] = Array(Q).fill(null); });
    setStuFlags(newStuFlags);
    setCurIdx(0);
    let qIdx = newStuMap[newStuOrder[0]].findIndex(v => v === null);
    if (qIdx === -1) qIdx = Q;
    setQIdx(qIdx);
    hideCompletePrompt();
    render();

    if (getAnswerKey()) document.getElementById('btn-correct').disabled = false;

    markSaved();
    alert(`✓ ${newStuOrder.length} alumne${newStuOrder.length !== 1 ? 's' : ''} carregats correctament.`);

  } catch (err) {
    console.error(err);
    alert('Error llegint el fitxer: ' + err.message);
  }
}

export async function dlResultsXLSX() {
  const lastResults = getLastResults();
  if (!lastResults) return;
  const Q = getQ();
  const ranges = getAmbitRanges();
  const { rows, key: ansKey } = lastResults;
  const n = rows.length;
  const currentCompetencyId = getCurrentCompetencyId();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resultats CB4');

  ws.columns = [
    { width: 22 },
    ...Array.from({ length: Q }, (_, i) => ({ width: getItemLabel(i).length > 2 ? 6.5 : 5 })),
    { width: 10 },
    { width: 8 },
  ];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  ws.addRow(Array(Q + 3).fill(''));
  ws.mergeCells(1, 1, 2, 1);
  const nomCell = ws.getCell(1, 1);
  nomCell.value     = 'Nom';
  nomCell.font      = { bold: true, size: 9 };
  nomCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
  nomCell.alignment = { horizontal: 'center', vertical: 'middle' };
  nomCell.border    = { bottom: { style: 'medium', color: { argb: 'FF90B4D8' } } };

  [Q + 2, Q + 3].forEach((col, ci) => {
    ws.mergeCells(1, col, 2, col);
    const cell = ws.getCell(1, col);
    cell.value    = ci === 0 ? 'Total' : '%';
    cell.font     = { bold: true, size: 9 };
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
    cell.alignment= { horizontal: 'center', vertical: 'middle' };
    cell.border   = { bottom: { style: 'medium', color: { argb: 'FF90B4D8' } } };
  });

  ranges.forEach(a => {
    const colS = 2 + a.start;
    const colE = 1 + a.end;
    if (colE >= colS) ws.mergeCells(1, colS, 1, colE);
    const cell = ws.getCell(1, colS);
    const argb = 'FF' + a.color.replace('#', '');
    cell.value     = a.name;
    cell.font      = { bold: true, size: 8, color: { argb } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = {
      left:   { style: 'thin',   color: { argb } },
      bottom: { style: 'medium', color: { argb } },
    };
  });
  ws.getRow(1).height = 20;

  ws.addRow(['', ...Array.from({ length: Q }, (_, i) => getItemLabel(i)), '', '']);
  ranges.forEach(a => {
    const argb = 'FF' + a.color.replace('#', '');
    for (let i = a.start; i < a.end; i++) {
      const cell = ws.getCell(2, 2 + i);
      cell.font     = { bold: true, size: 8, color: { argb } };
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F2F5' } };
      cell.alignment= { horizontal: 'center' };
      cell.border   = { bottom: { style: 'thin', color: { argb } } };
    }
  });
  ws.getRow(2).height = 14;

  const WHITE = 'FFFFFFFF', GREY = 'FFF4F4F4';
  rows.forEach((r, i) => {
    const bg = i % 2 === 0 ? WHITE : GREY;
    const qCells = Array.from({ length: Q }, (_, qi) => {
      const ans = r.answers[qi];
      if (ans === null || ans === undefined) return '';
      if (ans === '_') return '—';
      return (ansKey[qi] && ans === ansKey[qi]) ? '✓' : '✗';
    });
    const pct = Math.round(r.total / Q * 100);
    const row = ws.addRow([r.name, ...qCells, `${r.total}/${Q}`, `${pct}%`]);
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      if (colNum === 1) {
        cell.alignment = { horizontal: 'left' };
        cell.font = { size: 9 };
      } else if (colNum <= Q + 1) {
        cell.alignment = { horizontal: 'center' };
        if      (cell.value === '✓') cell.font = { bold: true, size: 9, color: { argb: 'FF27AE60' } };
        else if (cell.value === '✗') cell.font = { size: 9, color: { argb: 'FFCC4444' } };
        else                          cell.font = { size: 9, color: { argb: 'FF888888' } };
      } else {
        cell.alignment = { horizontal: 'center' };
        cell.font = { bold: true, size: 9, color: { argb: 'FF1A4F8A' } };
      }
    });
  });

  const pctPerQ = Array.from({ length: Q }, (_, qi) => {
    if (!n) return '';
    const hits = rows.filter(r => {
      const ans = r.answers[qi];
      return ans && ans !== '_' && ansKey[qi] && ans === ansKey[qi];
    }).length;
    return `${Math.round(hits / n * 100)}%`;
  });
  const sumRow = ws.addRow(['% encerts', ...pctPerQ, '', '']);
  sumRow.height = 15;
  sumRow.getCell(1).font      = { bold: true, italic: true, size: 9 };
  sumRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF4FB' } };
  sumRow.getCell(1).alignment = { horizontal: 'left' };
  sumRow.getCell(1).border    = { top: { style: 'medium', color: { argb: 'FF90B4D8' } } };
  for (let qi = 0; qi < Q; qi++) {
    const cell  = sumRow.getCell(2 + qi);
    const argb  = 'FF' + getAmbitForQ(qi).color.replace('#', '');
    cell.font     = { bold: true, size: 9, color: { argb } };
    cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF4FB' } };
    cell.alignment= { horizontal: 'center' };
    cell.border   = { top: { style: 'medium', color: { argb: 'FF90B4D8' } } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = currentCompetencyId + '_resultats_cb4eso.xlsx'; a.click();
  URL.revokeObjectURL(url);
}
