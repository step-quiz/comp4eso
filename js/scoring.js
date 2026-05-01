// ═══════════════════════════════════════════════════════════════════════
// js/scoring.js — Scoring algorithm, "Correct" modal, results table,
// shared `getGrade` (also imported by reports.js).
// ═══════════════════════════════════════════════════════════════════════

import {
  getStuMap, getStuNames, getStuOrder,
  getAnswerKey, getLastResults, setLastResults,
} from './state.js';
import { getQ, getAmbitRanges } from './render.js';
import { esc } from './utils.js';

export function scoreStudent(answers, key) {
  const ranges = getAmbitRanges();
  let totCorrect = 0, totWrong = 0, totBlank = 0, totInvalid = 0;
  const ambitScores = ranges.map(a => {
    let correct = 0, wrong = 0, blank = 0, invalid = 0;
    for (let i = a.start; i < a.end; i++) {
      const ans = answers[i];
      if (ans === null || ans === undefined || ans === '_') blank++;
      else if (ans === '?') invalid++;
      else if (key[i] && ans === key[i]) correct++;
      else wrong++;
    }
    totCorrect += correct; totWrong += wrong; totBlank += blank; totInvalid += invalid;
    return { correct, wrong, blank, invalid, total: a.questions };
  });
  return { ambitScores, total: totCorrect, wrong: totWrong, blank: totBlank, invalid: totInvalid };
}

export function openCorrect() {
  const stuOrder = getStuOrder();
  const answerKey = getAnswerKey();
  const stuCount = stuOrder.length;
  const Q = getQ();
  const filled = answerKey ? answerKey.filter(v => v).length : 0;
  document.getElementById('correct-info').textContent =
    `Clau: ${filled}/${Q} preguntes · ${stuCount} alumne${stuCount !== 1 ? 's' : ''} introduïts`;
  document.getElementById('btn-do-correct').disabled = stuCount === 0;
  document.getElementById('correct-overlay').classList.remove('off');
}

export function doCorrect() {
  document.getElementById('correct-overlay').classList.add('off');
  const key0 = getAnswerKey();
  const stuMap = getStuMap();
  const stuNames = getStuNames();
  const stuOrder = getStuOrder();
  const rows = [];
  for (const k of stuOrder) {
    const s = scoreStudent(stuMap[k], key0);
    rows.push({ name: stuNames[k] || k, answers: stuMap[k].slice(), ...s });
  }
  setLastResults({ rows, key: key0 });
  renderResults(getLastResults());
  document.getElementById('results-overlay').classList.remove('off');
}

export function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

export function renderResults({ rows }) {
  const Q = getQ();
  const ranges = getAmbitRanges();
  const n = rows.length;

  document.getElementById('res-title').textContent =
    `Resultats · CompBàsiques 4t ESO · ${n} alumnes`;

  const ambitHeaders = ranges.map(a =>
    `<th style="color:${a.color}" title="${esc(a.name)}">${esc(a.abbrev)}</th>`
  ).join('');

  const thead = `<thead><tr>
    <th>#</th><th>Nom</th>
    ${ambitHeaders}
    <th>Total</th><th title="Encerts">✓</th><th title="Errors">✗</th><th title="Blancs">—</th>
  </tr></thead>`;

  const tbody = '<tbody>' + rows.map((r, i) => {
    const ambitTds = r.ambitScores.map((s, j) => {
      const pctA = s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
      return `<td class="score" style="color:${ranges[j].color}" title="${esc(ranges[j].name)}: ${s.correct}/${s.total} (${pctA}%)">${s.correct}/${s.total}</td>`;
    }).join('');
    const totalPct = Math.round(r.total / Q * 100);
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(r.name)}</td>
      ${ambitTds}
      <td class="total-score" title="${totalPct}%">${r.total}/${Q}</td>
      <td class="ok">${r.total}</td>
      <td class="err">${r.wrong}</td>
      <td class="blnk">${r.blank}</td>
    </tr>`;
  }).join('') + '</tbody>';

  document.getElementById('res-table').innerHTML = thead + tbody;
}

// ── Shared with reports.js ──
export function getGrade(pct) {
  if (pct < 50)    return { code: 'NA', full: 'Baix',       color: 'C0392B' };
  if (pct < 66.67) return { code: 'AS', full: 'Mitjà-baix', color: 'D4820A' };
  if (pct < 83.34) return { code: 'AN', full: 'Mitjà-alt',  color: '1A5276' };
  return             { code: 'AE', full: 'Alt',             color: '1E8449' };
}
