// ═══════════════════════════════════════════════════════════════════════
// js/ai-recognizer.js — Reconeixement automàtic de respostes via Claude.
//
// Port fidel de la lògica de cb_corrector_claude.py + app_xlsx.py:
//   - build_omr_prompt()       → buildOmrPrompt()
//   - normalitzar_resposta()   → normalitzarResposta()
//   - PROMPT_SISTEMA           → PROMPT_SISTEMA
//   - format JSON de sortida   → {id_alumne, respostes:{Q01:...}, comentari}
//
// Flux:
//   1. L'usuari selecciona competència, introdueix API key i puja el PDF.
//   2. Cada pàgina es renderitza via pdf.js → canvas → base64 JPEG.
//   3. Es crida api.anthropic.com directament des del navegador.
//   4. Claude retorna JSON amb id_alumne + respostes per claus Q01..QNN.
//   5. normalitzarResposta() converteix els valors crus al format intern.
//   6. Les dades es carreguen a l'estat de l'app.
// ═══════════════════════════════════════════════════════════════════════

import { CAT_ITEMS, CAT_RANGES }   from '../data/cat-2025-26.js';
import { MAT_DEFAULT_AMBITS }      from '../data/mat-2025-26.js';
import { CIEN_ITEMS, CIEN_RANGES } from '../data/ct-2025-26.js';

import {
  getStuOrder,
  setStuMap, setStuNames, setStuOrder,
  setCurIdx, setQIdx,
  markSaved,
  getCurrentCompetencyId,
  getAmbits,
} from './state.js';
import { getQ, render } from './render.js';
import { hideCompletePrompt } from './student-modal.js';
import { showToast } from './ui.js';

// ─── Constants ────────────────────────────────────────────────────────

const API_URL     = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 3;

// Models disponibles, en ordre de preferència. La primera entrada és la default.
const MODEL_CHOICES = [
  { id: 'claude-opus-4-7',   label: 'Opus 4.7 — més precís (recomanat)' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — equilibri qualitat/cost' },
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5 — més ràpid i econòmic' },
];
const DEFAULT_MODEL = MODEL_CHOICES[0].id;

// Escales possibles per al renderitzat de PDF. ≈DPI = scale × 72.
// Recomanació: 3.0 detecta cercles fins (regla 4) sense inflar tokens.
const SCALE_CHOICES = [
  { val: '2.0', label: '≈144 DPI (ràpid, més econòmic)' },
  { val: '3.0', label: '≈216 DPI (recomanat)' },
  { val: '4.0', label: '≈288 DPI (màxima qualitat)' },
];
const DEFAULT_SCALE = '3.0';

const PROMPT_SISTEMA =
  'Ets un sistema OMR (Optical Mark Recognition) especialitzat en ' +
  'fulls de respostes de la prova de Competències Bàsiques de Catalunya (4t ESO). ' +
  'La teva única feina és llegir les marques del full i retornar JSON estricte. ' +
  'No expliquis res, no afegeixis text. Només JSON.';

// ─── Registre de competències (mirall de COMPETENCIES_PY a app_xlsx.py) ─

const COMP_REGISTRY = {
  mat: {
    label: 'Matemàtiques',
    getItems: () => {
      const ambits = getCurrentCompetencyId() === 'mat'
        ? getAmbits()
        : MAT_DEFAULT_AMBITS;
      const items = [];
      ambits.forEach((a, ai) => {
        const n = Math.max(1, a.questions | 0);
        const offset = ambits.slice(0, ai).reduce((s, x) => s + Math.max(1, x.questions | 0), 0);
        for (let i = 0; i < n; i++) {
          items.push({ label: String(offset + i + 1), type: 'abcd' });
        }
      });
      return items;
    },
    getRanges: () => {
      const ambits = getCurrentCompetencyId() === 'mat'
        ? getAmbits()
        : MAT_DEFAULT_AMBITS;
      let start = 0;
      return ambits.map(a => {
        const n = Math.max(1, a.questions | 0);
        const r = { name: a.name, color: a.color, start, end: start + n };
        start += n;
        return r;
      });
    },
  },
  cat: {
    label: 'Llengua catalana',
    getItems:  () => CAT_ITEMS,
    getRanges: () => CAT_RANGES,
  },
  ct: {
    label: 'Científico-tecnològica',
    getItems:  () => CIEN_ITEMS,
    getRanges: () => CIEN_RANGES,
  },
};

// ─── Obrir / tancar modal ─────────────────────────────────────────────

export function openAiRecognizer() {
  _ensureControlsPopulated();
  const sel = document.getElementById('ai-rec-competency');
  if (sel) sel.value = getCurrentCompetencyId() || 'mat';
  document.getElementById('ai-rec-log').innerHTML = '';
  document.getElementById('ai-rec-log').style.display = 'none';
  _setProgress(0);
  _setStatus('');
  document.getElementById('ai-rec-btn-start').disabled = false;
  document.getElementById('ai-rec-overlay').classList.remove('off');
}

// Omple els selects de model i scale a la primera obertura.
function _ensureControlsPopulated() {
  const modelSel = document.getElementById('ai-rec-model');
  if (modelSel && modelSel.options.length === 0) {
    MODEL_CHOICES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === DEFAULT_MODEL) opt.selected = true;
      modelSel.appendChild(opt);
    });
  }
  const scaleSel = document.getElementById('ai-rec-scale');
  if (scaleSel && scaleSel.options.length === 0) {
    SCALE_CHOICES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.val;
      opt.textContent = s.label;
      if (s.val === DEFAULT_SCALE) opt.selected = true;
      scaleSel.appendChild(opt);
    });
  }
}

export function closeAiRecognizer() {
  document.getElementById('ai-rec-overlay').classList.add('off');
}

// ─── Botó "Iniciar reconeixement" ────────────────────────────────────

export function startAiRecognition() {
  const apiKey = document.getElementById('ai-rec-apikey').value.trim();
  if (!apiKey) {
    alert("Cal introduir una API key d'Anthropic per continuar.");
    return;
  }
  document.getElementById('ai-rec-pdf-file').click();
}

// ─── Processament del PDF ─────────────────────────────────────────────

export async function processAiPdf(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const apiKey     = document.getElementById('ai-rec-apikey').value.trim();
  const competency = document.getElementById('ai-rec-competency').value;
  const model      = document.getElementById('ai-rec-model').value || DEFAULT_MODEL;
  const scale      = parseFloat(document.getElementById('ai-rec-scale').value || DEFAULT_SCALE);
  const comp       = COMP_REGISTRY[competency];
  const items      = comp.getItems();
  const Q          = items.length;

  document.getElementById('ai-rec-btn-start').disabled = true;
  document.getElementById('ai-rec-btn-close').disabled = true;

  try {
    const buf    = await file.arrayBuffer();
    const pdfDoc = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const total  = pdfDoc.numPages;

    _setStatus(`Carregant ${total} pàgina(es) (model: ${model})...`);
    _showLog();

    const results = [];

    for (let p = 1; p <= total; p++) {
      _setStatus(`Processant pàgina ${p} de ${total}...`);
      _setProgress(Math.round((p - 1) / total * 100));

      try {
        const result  = await _processPage(pdfDoc, p, apiKey, competency, items, model, scale);
        const valides = Object.values(result.respostes)
          .filter(v => v && v !== '?' && v !== '').length;
        results.push(result);
        _appendLog(
          `Pàg. ${p} — <strong>${_esc(result.id_alumne || '(sense nom)')}</strong>` +
          ` — ${valides}/${Q} respostes` +
          (result.comentari ? ` — <em>${_esc(result.comentari.slice(0, 80))}</em>` : ''),
          'ok'
        );
      } catch (err) {
        _appendLog(`Pàg. ${p} — Error: ${_esc(err.message)}`, 'err');
        console.error(`Page ${p}:`, err);
      }
    }

    _setProgress(100);

    if (results.length === 0) {
      _setStatus('Cap alumne processat. Comprova la API key i el PDF.');
      document.getElementById('ai-rec-btn-start').disabled = false;
      document.getElementById('ai-rec-btn-close').disabled = false;
      return;
    }

    _setStatus(`${results.length} alumne(s) processats. Carregant dades...`);
    _loadResultsIntoApp(results, competency, items);

  } catch (err) {
    _setStatus(`Error carregant el PDF: ${err.message}`);
    console.error(err);
  }

  document.getElementById('ai-rec-btn-start').disabled = false;
  document.getElementById('ai-rec-btn-close').disabled = false;
}

// ─── Processar una pàgina ─────────────────────────────────────────────

async function _processPage(pdfDoc, pageNum, apiKey, competency, items, model, scale) {
  const page     = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = Math.round(viewport.width);
  canvas.height  = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  // Redimensionar si supera 1800px (estalvia tokens sense perdre qualitat OCR)
  let src = canvas;
  const maxDim = 1800;
  if (Math.max(canvas.width, canvas.height) > maxDim) {
    const ratio = maxDim / Math.max(canvas.width, canvas.height);
    src = document.createElement('canvas');
    src.width  = Math.round(canvas.width  * ratio);
    src.height = Math.round(canvas.height * ratio);
    src.getContext('2d').drawImage(canvas, 0, 0, src.width, src.height);
  }

  const base64 = src.toDataURL('image/jpeg', 0.85).split(',')[1];
  const prompt = buildOmrPrompt(competency);

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          system: PROMPT_SISTEMA,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text',  text: prompt },
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
      let text = (data.content.find(b => b.type === 'text')?.text || '').trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      }

      return _validarResposta(JSON.parse(text), items);

    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && !(err instanceof SyntaxError)) {
        await _sleep(2000 * attempt);
      }
    }
  }

  const respostes = {};
  items.forEach((_, i) => { respostes[`Q${String(i + 1).padStart(2, '0')}`] = '?'; });
  return { id_alumne: '', respostes, comentari: `ERROR: ${lastErr?.message}` };
}

// ─── Validació de la resposta de Claude ──────────────────────────────

function _validarResposta(data, items) {
  const raw = (data.respostes && typeof data.respostes === 'object') ? data.respostes : {};
  const respostes = {};
  items.forEach((_, i) => {
    const qid = `Q${String(i + 1).padStart(2, '0')}`;
    let v = String(raw[qid] ?? '?').trim();
    if (v === '') v = '?';
    respostes[qid] = v;
  });
  return {
    id_alumne: String(data.id_alumne ?? '').trim(),
    respostes,
    comentari: String(data.comentari ?? '').trim(),
  };
}

// ─── Normalització (port de normalitzar_resposta() de app_xlsx.py) ───
//
//   null  → cel·la buida (pendent revisió humana — «?» de Claude)
//   "_"   → blanc explícit («—» de Claude, o «!» = múltiple/invàlid)
//   "A"–"E" → resposta validada

function normalitzarResposta(raw, item) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '' || s === '?') return null;
  if (s === '!') return '_';
  if (s === '—' || s === '-' || s === '_') return '_';

  const type  = item.type || 'abcd';
  const sUp   = s.toUpperCase();
  const sNorm = s.toLowerCase().replace(/[.:,;]$/, '');

  if (type === 'abcd') {
    return 'ABCD'.includes(sUp) && sUp.length === 1 ? sUp : null;
  }
  if (type === 'abcde') {
    return 'ABCDE'.includes(sUp) && sUp.length === 1 ? sUp : null;
  }
  if (type === 'vf') {
    if (sUp === 'A' || sUp === 'V') return 'A';
    if (sUp === 'B' || sUp === 'F') return 'B';
    return null;
  }
  if (type === 'bin') {
    if (sUp === 'A' || sUp === 'V') return 'A';
    if (sUp === 'B' || sUp === 'F') return 'B';
    const bl = item.binLabels || [];
    if (bl.length === 2) {
      const lA = bl[0].toLowerCase().replace(/[.:,;]$/, '');
      const lB = bl[1].toLowerCase().replace(/[.:,;]$/, '');
      if (sNorm === lA || lA.startsWith(sNorm) || sNorm.startsWith(lA)) return 'A';
      if (sNorm === lB || lB.startsWith(sNorm) || sNorm.startsWith(lB)) return 'B';
    }
    const SHORTS = {
      av:'A', avantatge:'A', in:'B', inconvenient:'B',
      ac:'A', actiu:'A',    pa:'B', passiu:'B',
      po:'A', positiu:'A',  ne:'B', negatiu:'B',
      si:'A', 'sí':'A',     yes:'A', no:'B',
    };
    return SHORTS[sNorm] ?? null;
  }
  return null;
}

// ─── Carregar resultats a l'estat de l'app ───────────────────────────

function _loadResultsIntoApp(results, competency, items) {
  const Q = items.length;
  const existing = getStuOrder();
  if (existing.length > 0) {
    if (!confirm(
      `Les dades actuals (${existing.length} alumne${existing.length !== 1 ? 's' : ''}) ` +
      `seran substituïdes pels resultats del reconeixement ` +
      `(${results.length} alumne${results.length !== 1 ? 's' : ''}).\n\nContinuar?`
    )) return;
  }

  const newStuMap   = {};
  const newStuNames = {};
  const newStuOrder = [];

  results.forEach((result, i) => {
    const idx = String(i + 1);
    newStuOrder.push(idx);
    newStuNames[idx] = result.id_alumne || `Alumne ${i + 1}`;
    newStuMap[idx] = items.map((item, qi) => {
      const qid = `Q${String(qi + 1).padStart(2, '0')}`;
      return normalitzarResposta(result.respostes[qid], item);
    });
  });

  setStuMap(newStuMap);
  setStuNames(newStuNames);
  setStuOrder(newStuOrder);
  setCurIdx(0);
  const firstPending = newStuMap[newStuOrder[0]].findIndex(v => v === null);
  setQIdx(firstPending === -1 ? Q : firstPending);
  hideCompletePrompt();
  render();
  markSaved();

  closeAiRecognizer();

  const dubtoses = results.reduce(
    (s, r) => s + Object.values(r.respostes).filter(v => v === '?').length, 0
  );
  let msg = `✓ ${results.length} alumne${results.length !== 1 ? 's' : ''} carregats via reconeixement automàtic.`;
  if (dubtoses > 0)
    msg += ` ⚠️ ${dubtoses} resposta${dubtoses !== 1 ? 's' : ''} pendents de revisió manual (·).`;
  showToast(msg);
}

// ─── Port de build_omr_prompt() de app_xlsx.py ───────────────────────

export function buildOmrPrompt(competencyId) {
  const comp   = COMP_REGISTRY[competencyId];
  const items  = comp.getItems();
  const ranges = comp.getRanges();
  const Q      = items.length;

  const blocsDesc = ranges.map(r => {
    const lines = [`\n### ${r.name} (ítems ${items[r.start].label} – ${items[r.end - 1].label})`];
    for (let i = r.start; i < r.end; i++) {
      const it = items[i];
      if      (it.type === 'abcd')  lines.push(`  - Pregunta ${it.label}: opcions a / b / c / d`);
      else if (it.type === 'abcde') lines.push(`  - Pregunta ${it.label}: opcions A / B / C / D / E`);
      else if (it.type === 'vf')    lines.push(`  - Pregunta ${it.label}: opcions V (verdader) / F (fals)`);
      else if (it.type === 'bin') {
        const bl = it.binLabels || ['A', 'B'];
        lines.push(`  - Pregunta ${it.label}: opcions «${bl[0]}» / «${bl[1]}»`);
      }
    }
    return lines.join('\n');
  });

  const jsonKeys = items.map((it, i) => {
    const qid = `Q${String(i + 1).padStart(2, '0')}`;
    let valor;
    if      (it.type === 'abcd')  valor = '"a" | "b" | "c" | "d" | "—" | "?" | "!"';
    else if (it.type === 'abcde') valor = '"a" | "b" | "c" | "d" | "e" | "—" | "?" | "!"';
    else if (it.type === 'vf')    valor = '"V" | "F" | "—" | "?" | "!"';
    else if (it.type === 'bin') {
      const bl = it.binLabels || ['A', 'B'];
      valor = `"${bl[0]}" | "${bl[1]}" | "—" | "?" | "!"`;
    } else valor = '"—" | "?" | "!"';
    return `    "${qid}": ${valor},   // pregunta ${it.label}`;
  }).join('\n');

  const qPad = String(Q).padStart(2, '0');

  return `Analitza aquest full de respostes de la prova de Competències Bàsiques de Catalunya \
(4t ESO) corresponent a la competència «${comp.label}». Extreu la resposta marcada \
per a cadascun dels ${Q} ítems.

ESTRUCTURA DEL FULL (molt important — segueix aquest mapatge exacte):
${blocsDesc.join('\n')}

REGLES DE LECTURA — molt importants, llegeix-les amb atenció:

1. CONCEPTE DE «MARCA»: una marca és qualsevol traç voluntari fet per l'alumne dins d'un \
quadret d'opció, **amb intensitat suficient i forma reconeixible**. Inclou X, creus, aspes, \
cercles, rotllos, ratllats, gargots, traços diagonals o qualsevol senyal clarament intencionat.

NO és una marca:
   - arrugues del paper, taques, ombres de l'escaneig, punts accidentals molt petits
   - **RASTRES D'ESBORRAT (molt important)**: si veus a un quadret un residu tènue, una taca \
sense forma definida, un traç parcialment esborrat amb molta menys intensitat que les marques \
sòlides d'altres preguntes del MATEIX full, és un esborrat. L'alumne va marcar i després va \
canviar d'opinió retirant la marca amb goma. Tracta aquell quadret com a BUIT.
   - Comparació d'intensitat: les marques vàlides que fa l'alumne en altres preguntes del mateix \
full t'han de servir de referència. Un traç significativament més tènue i sense forma clara és, \
gairebé segur, un esborrat.

2. RESPOSTA NORMAL (X dins un quadret buit): si la fila té UNA SOLA X (o aspa) clara dins d'un \
dels quadrets buits, retorna aquesta opció.

3. ANUL·LACIÓ (quadrat completament ple): un quadret COMPLETAMENT OMPLERT (pintat sòlid uniforme, \
ennegrit, ratllat amb traços paral·lels densos fins a quedar negre) significa que l'alumne ha \
ANUL·LAT aquesta opció. La nova X vàlida ha d'estar a una altra opció de la mateixa fila.

4. REANUL·LACIÓ (quadrat ple ENCERCLAT — molt important!): el full d'instruccions oficial diu: \
«Per tornar a marcar com a correcta una resposta emplenada prèviament, encercla-la.» \
Un quadrat omplert amb un CERCLE al voltant DESFA l'anul·lació i recupera aquesta opció com a \
resposta correcta. Quadrat ple + cercle = resposta vàlida.

5. BLANC EXPLÍCIT (escriu «—»): retorna «—» quan no queda cap resposta vàlida a la fila:
   (a) Tots els quadrets completament nets (l'alumne no va respondre).
   (b) Hi ha un o més PLEs sense cercle i la resta buits: l'alumne va anul·lar i no va marcar \
res nou. NO retornis el quadrat omplert com a resposta.
   (c) Només rastres d'esborrat i res més.

6. DUBTE (escriu «?»): si hi ha alguna marca però no pots determinar amb confiança quina opció \
es marca (traç tènue, ambigüitat, escaneig borrós, no saps si un cercle envolta un quadrat ple), \
retorna «?». Aquest valor significa "calen ulls humans".

7. RESPOSTA MÚLTIPLE / NO VÀLIDA (escriu «!»): si després d'aplicar les regles 3 i 4 \
encara queden marques voluntàries en MÉS D'UNA opció, retorna «!».

8. ARBRE DE DECISIÓ (segueix aquest ordre exacte):
   PAS A — Per cada quadret, classifica'l com:
     · BUIT (cap traç, o rastre tènue d'esborrat sense forma clara)
     · X (creu/aspa neta, sense fons ple, intensitat sòlida)
     · PLE (quadrat completament ennegrit, sense cercle al voltant)
     · PLE-ENCERCLAT (quadrat ennegrit amb cercle clar englobant-lo)
     · ALTRA MARCA (cercle dins quadret buit, gargot, ratlla...)
   PAS B — Compta les opcions «vàlides»:
     · X → vàlida. PLE-ENCERCLAT → vàlida. PLE simple → NO vàlida. BUIT → no compta.
   PAS C — Decideix:
     · 0 vàlides + només BUITs i/o PLEs → «—» (el PLE és una cancel·lació, no una resposta!)
     · 0 vàlides + alguna ALTRA MARCA poc clara → «?»
     · Exactament 1 vàlida → la opció corresponent
     · 2 o més vàlides → «!»

9. FORMAT DE SORTIDA per cada tipus:
   - abcd: minúscula 'a', 'b', 'c' o 'd' (o «—», «?», «!»).
   - abcde: minúscula 'a', 'b', 'c', 'd' o 'e' (o «—», «?», «!»).
   - V/F: majúscula 'V' o 'F' (o «—», «?», «!»).
   - Binari: l'etiqueta humana sencera tal com apareix al full (o «—», «?», «!»).

Si veus a la part superior del full una etiqueta identificativa (codi, DNI, número o text \
manuscrit identificador), transcriu-la al camp "id_alumne". Si no es veu o és il·legible, \
posa "id_alumne" com a string buit "".

FORMAT DE SORTIDA OBLIGATORI (JSON estricte, res més):
{
  "id_alumne": "...",
  "respostes": {
${jsonKeys}
  },
  "comentari": "Notes breus sobre fulls dubtosos. Buit si tot és clar."
}

Retorna NOMÉS aquest JSON, sense \`\`\`json ni cap altre text.
Cada clau Q01..Q${qPad} ha de tenir un valor del seu tipus o «—», «?» o «!».`;
}

// ─── Helpers UI ───────────────────────────────────────────────────────

function _setStatus(text)  { document.getElementById('ai-rec-status').textContent = text; }
function _setProgress(pct) { document.getElementById('ai-rec-bar').style.width = pct + '%'; }
function _esc(s)           { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _showLog()        { document.getElementById('ai-rec-log').style.display = 'block'; }
function _sleep(ms)        { return new Promise(r => setTimeout(r, ms)); }

function _appendLog(html, type) {
  const log = document.getElementById('ai-rec-log');
  log.innerHTML += `<div class="ai-log-${type}">${html}</div>`;
  log.scrollTop = log.scrollHeight;
}
