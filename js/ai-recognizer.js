// ═══════════════════════════════════════════════════════════════════════
// js/ai-recognizer.js — Reconeixement automàtic de respostes via Claude.
//
// Flux:
//   1. L'usuari obre el modal, introdueix la API key i selecciona el PDF.
//   2. Cada pàgina del PDF es renderitza via pdf.js → canvas → base64 JPEG.
//   3. Es crida l'API d'Anthropic directament des del navegador.
//   4. Claude retorna un JSON amb nom i respostes de l'alumne/a.
//   5. Les dades es carreguen a l'estat de l'app (setStuMap, etc.).
// ═══════════════════════════════════════════════════════════════════════

import { getQ } from './render.js';
import {
  getStuOrder,
  setStuMap, setStuNames, setStuOrder,
  setCurIdx, setQIdx,
  markSaved,
} from './state.js';
import { render } from './render.js';
import { hideCompletePrompt } from './student-modal.js';
import { showToast } from './ui.js';

const MODEL = 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

// ─── Obrir / tancar modal ─────────────────────────────────────────────

export function openAiRecognizer() {
  const overlay = document.getElementById('ai-rec-overlay');
  overlay.classList.remove('off');
  // Reset UI
  _setLog('');
  _setProgress(0);
  _setStatus('');
  document.getElementById('ai-rec-btn-start').disabled = false;
}

export function closeAiRecognizer() {
  document.getElementById('ai-rec-overlay').classList.add('off');
}

// ─── Botó "Iniciar reconeixement" ────────────────────────────────────

export function startAiRecognition() {
  const apiKey = document.getElementById('ai-rec-apikey').value.trim();
  if (!apiKey) {
    alert('Cal introduir una API key d\'Anthropic per continuar.');
    return;
  }
  // Obrir selector de PDF
  document.getElementById('ai-rec-pdf-file').click();
}

// ─── Processament del PDF ────────────────────────────────────────────

export async function processAiPdf(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const apiKey = document.getElementById('ai-rec-apikey').value.trim();
  const Q = getQ();

  document.getElementById('ai-rec-btn-start').disabled = true;
  document.getElementById('ai-rec-btn-close').disabled = true;

  const pdfjsLib = window.pdfjsLib;

  try {
    const buf = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    const totalPages = pdfDoc.numPages;

    _setStatus(`📄 ${totalPages} pàgina(es) trobades. Iniciant reconeixement...`);

    const results = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      _setStatus(`🔎 Processant pàgina ${pageNum} de ${totalPages}...`);
      _setProgress(Math.round((pageNum - 1) / totalPages * 100));

      try {
        const result = await _processPage(pdfDoc, pageNum, apiKey, Q);
        results.push(result);
        const answered = result.respostes.filter(r => r !== null && r !== '_').length;
        _appendLog(
          `✓ Pàg. ${pageNum} — <strong>${_esc(result.nom || '(sense nom)')}</strong> — ${answered}/${Q} respostes`,
          'ok'
        );
      } catch (err) {
        _appendLog(`✗ Pàg. ${pageNum} — Error: ${_esc(err.message)}`, 'err');
        console.error(`Page ${pageNum} error:`, err);
      }
    }

    _setProgress(100);

    if (results.length === 0) {
      _setStatus('⚠️ Cap alumne processat. Comprova la API key i el PDF.');
      document.getElementById('ai-rec-btn-start').disabled = false;
      document.getElementById('ai-rec-btn-close').disabled = false;
      return;
    }

    _setStatus(`✅ ${results.length} alumne(s) processats correctament.`);
    _loadResultsIntoApp(results, Q);

  } catch (err) {
    _setStatus(`❌ Error carregant el PDF: ${err.message}`);
    console.error(err);
  }

  document.getElementById('ai-rec-btn-start').disabled = false;
  document.getElementById('ai-rec-btn-close').disabled = false;
}

// ─── Processar una pàgina ─────────────────────────────────────────────

async function _processPage(pdfDoc, pageNum, apiKey, Q) {
  // Renderitzar pàgina a canvas (scale 2x per millor qualitat OCR)
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  // Canvas → base64 JPEG
  const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

  // Crida a l'API d'Anthropic
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text',  text: _buildPrompt(Q) },
        ],
      }],
    }),
  });

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }

  const data = await resp.json();
  const text = (data.content.find(b => b.type === 'text')?.text || '').trim();

  // Extreure JSON (Claude de vegades afegeix ```json ... ```)
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (_) {
    throw new Error('La IA no ha retornat JSON vàlid. Resposta: ' + text.slice(0, 120));
  }

  if (!Array.isArray(parsed.respostes)) {
    throw new Error('Format de resposta inesperat (falta el camp "respostes").');
  }

  // Assegurar exactament Q elements
  while (parsed.respostes.length < Q) parsed.respostes.push(null);
  parsed.respostes = parsed.respostes.slice(0, Q);

  return parsed;
}

// ─── Prompt per a Claude ─────────────────────────────────────────────

function _buildPrompt(Q) {
  return `Ets un corrector automàtic de fulls de respostes de les Proves de Competències Bàsiques de 4t d'ESO de Catalunya.

Analitza la imatge d'aquest full de respostes escanejat. Identifica:
1. El nom complet de l'alumne/a (si apareix al full)
2. Per a cadascuna de les ${Q} preguntes (Q1 fins a Q${Q}), quina opció ha marcat l'alumne/a

Per a cada pregunta retorna:
- La lletra marcada: "A", "B", "C", "D" o "E" (en majúscula)
- null si no hi ha cap opció marcada (pregunta en blanc)
- "_" si la resposta ha estat clarament anul·lada (ratllada, tatxada o amb cercle de correcció sobre la primera marca, i una altra opció marcada clarament com a definitiva)

Si hi ha ambigüitat (dues opcions marcades sense correcció clara), retorna la que sembla marcada amb més força o intensitat.

Retorna ÚNICAMENT un objecte JSON, sense cap text addicional ni cometes de codi:
{
  "nom": "Nom Cognom de l'alumne/a o null si no apareix",
  "id": "codi numèric o identificador si n'hi ha, o null",
  "respostes": ["A", "B", null, "C", "_", ...]
}

L'array "respostes" ha de tenir exactament ${Q} elements, un per cada pregunta en ordre (Q1, Q2, ..., Q${Q}).`;
}

// ─── Carregar resultats a l'estat de l'app ───────────────────────────

function _loadResultsIntoApp(results, Q) {
  const existing = getStuOrder();
  if (existing.length > 0) {
    if (!confirm(
      `Les dades actuals (${existing.length} alumne${existing.length !== 1 ? 's' : ''}) ` +
      `seran substituïdes per les del reconeixement (${results.length} alumne${results.length !== 1 ? 's' : ''}).\n\nContinuar?`
    )) return;
  }

  const newStuMap   = {};
  const newStuNames = {};
  const newStuOrder = [];

  results.forEach((result, i) => {
    const idx = String(i + 1);
    newStuOrder.push(idx);
    newStuNames[idx] = (result.nom && result.nom !== 'null') ? result.nom : `Alumne ${i + 1}`;

    const answers = result.respostes.map(r => {
      if (!r || r === '' || r === 'null') return null;
      const v = String(r).trim().toUpperCase();
      if (v === '_' || v === '—') return '_';
      if (['A', 'B', 'C', 'D', 'E'].includes(v)) return v;
      return null;
    });

    newStuMap[idx] = answers;
  });

  setStuMap(newStuMap);
  setStuNames(newStuNames);
  setStuOrder(newStuOrder);
  setCurIdx(0);
  const qIdx = newStuMap[newStuOrder[0]].findIndex(v => v === null);
  setQIdx(qIdx === -1 ? Q : qIdx);
  hideCompletePrompt();
  render();
  markSaved();

  closeAiRecognizer();
  showToast(`✓ ${results.length} alumne${results.length !== 1 ? 's' : ''} carregats via reconeixement automàtic.`);
}

// ─── Helpers UI ───────────────────────────────────────────────────────

function _setLog(html)       { document.getElementById('ai-rec-log').innerHTML = html; }
function _setStatus(text)    { document.getElementById('ai-rec-status').textContent = text; }
function _setProgress(pct)   { document.getElementById('ai-rec-bar').style.width = pct + '%'; }
function _esc(s)             { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _appendLog(html, type) {
  const log = document.getElementById('ai-rec-log');
  log.innerHTML += `<div class="ai-log-${type}">${html}</div>`;
  log.scrollTop = log.scrollHeight;
}
