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
  setAiLog,
} from './state.js';
import { getQ, render } from './render.js';
import { hideCompletePrompt } from './student-modal.js';
import { showToast } from './ui.js';

// ─── Constants ────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';

// Reintents diferenciats segons tipus d'error:
// - Errors transitoris (5xx, 429 Too Many Requests, errors de xarxa):
//   són típicament caigudes momentànies del servidor o rate limiting,
//   solen recuperar-se sols. Provem 5 vegades amb backoff generós.
// - Altres errors (4xx no-429, errors de parse JSON, errors de validació):
//   probablement no es resoldran amb temps. Limitem a 3 intents.
const MAX_RETRIES_TRANSIENT = 5;
const MAX_RETRIES_DEFAULT   = 3;

// Backoff explícit per posició (en ms). Valors més generosos per donar temps
// als servidors de Gemini/Anthropic a recuperar-se davant de degradacions.
const RETRY_BACKOFF_MS = [5000, 10000, 15000, 40000];

// Models disponibles. Cada entrada té un `provider` que determina endpoint,
// headers i format del payload.
// Ordre escollit segons els resultats empírics del nostre testing:
// Gemini 2.5 Pro va donar 100% de precisió a 288 DPI (millor que Claude Opus 4.7).
const MODEL_CHOICES = [
  { id: 'gemini-2.5-pro',         provider: 'google',    label: 'Gemini 2.5 Pro — màxima precisió (recomanat)' },
  { id: 'claude-opus-4-7',        provider: 'anthropic', label: 'Claude Opus 4.7 — alternativa Anthropic (potent)' },
  { id: 'gemini-2.5-flash',       provider: 'google',    label: 'Gemini 2.5 Flash — equilibri qualitat/cost' },
  { id: 'claude-sonnet-4-6',      provider: 'anthropic', label: 'Claude Sonnet 4.6 — equilibri qualitat/cost' },
  { id: 'gemini-2.5-flash-lite',  provider: 'google',    label: 'Gemini 2.5 Flash-Lite — el més econòmic' },
  { id: 'claude-haiku-4-5',       provider: 'anthropic', label: 'Claude Haiku 4.5 — més ràpid i econòmic' },
];
const DEFAULT_MODEL = MODEL_CHOICES[0].id;

function _modelInfo(id) {
  return MODEL_CHOICES.find(m => m.id === id) || MODEL_CHOICES[0];
}

// Escales possibles per al renderitzat de PDF. ≈DPI = scale × 72.
// 4.0 (288 DPI) és el default segons les nostres proves: detecta cercles fins
// i marques tènues amb molta més fiabilitat que resolucions inferiors.
// El cost extra és menyspreable (les imatges es limiten a 1800px per defecte;
// en fulls complexos amb moltes correccions el cap puja a 2200px automàticament).
const SCALE_CHOICES = [
  { val: '4.0', label: '≈288 DPI (màxima qualitat, recomanat)' },
  { val: '3.0', label: '≈216 DPI (equilibri qualitat/cost)' },
  { val: '2.0', label: '≈144 DPI (ràpid, més econòmic)' },
];
const DEFAULT_SCALE = '4.0';

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
    // Actualitzar el placeholder i la label de l'API key segons el model triat.
    modelSel.addEventListener('change', _updateApiKeyHint);
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
  _updateApiKeyHint();
}

// Reflecteix al UI quin proveïdor s'està utilitzant: canvia placeholder i label.
function _updateApiKeyHint() {
  const sel = document.getElementById('ai-rec-model');
  const inp = document.getElementById('ai-rec-apikey');
  const lbl = document.getElementById('ai-rec-apikey-label');
  if (!sel || !inp) return;
  const info = _modelInfo(sel.value || DEFAULT_MODEL);
  if (info.provider === 'google') {
    inp.placeholder = 'AIzaSy...';
    if (lbl) lbl.textContent = "API Key de Google (Gemini)";
  } else {
    inp.placeholder = 'sk-ant-api03-...';
    if (lbl) lbl.textContent = "API Key d'Anthropic (Claude)";
  }
}

export function closeAiRecognizer() {
  document.getElementById('ai-rec-overlay').classList.add('off');
}

// ─── Botó "Iniciar reconeixement" ────────────────────────────────────

export function startAiRecognition() {
  const apiKey = document.getElementById('ai-rec-apikey').value.trim();
  if (!apiKey) {
    const sel  = document.getElementById('ai-rec-model');
    const info = _modelInfo(sel?.value || DEFAULT_MODEL);
    const which = info.provider === 'google' ? 'de Google (Gemini)' : "d'Anthropic (Claude)";
    alert(`Cal introduir una API key ${which} per continuar.`);
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

    const results   = [];
    const logEntries = [];

    for (let p = 1; p <= total; p++) {
      _setStatus(`Processant pàgina ${p} de ${total}...`);
      _setProgress(Math.round((p - 1) / total * 100));

      try {
        const result  = await _processPage(pdfDoc, p, apiKey, competency, items, model, scale);
        results.push(result);

        if (result._failed) {
          logEntries.push({ page: p, name: '', valid: 0, total: Q,
            comment: '', failed: true, error: result._error || 'Error desconegut' });
          _appendLog(
            `Pàg. ${p} — <strong>ERROR D'API</strong> — ${_esc(result._error)}`,
            'err'
          );
        } else {
          const valides = Object.values(result.respostes)
            .filter(v => v && v !== '?' && v !== '').length;
          logEntries.push({ page: p, name: result.id_alumne || '', valid: valides, total: Q,
            comment: result.comentari || '', failed: false, error: '' });
          _appendLog(
            `Pàg. ${p} — <strong>${_esc(result.id_alumne || '(sense nom)')}</strong>` +
            ` — ${valides}/${Q} respostes` +
            (result.comentari ? ` — <em>${_esc(result.comentari.slice(0, 80))}</em>` : ''),
            'ok'
          );
        }
      } catch (err) {
        logEntries.push({ page: p, name: '', valid: 0, total: Q,
          comment: '', failed: true, error: err.message });
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
    _loadResultsIntoApp(results, competency, items, model, logEntries);

  } catch (err) {
    _setStatus(`Error carregant el PDF: ${err.message}`);
    console.error(err);
  }

  document.getElementById('ai-rec-btn-start').disabled = false;
  document.getElementById('ai-rec-btn-close').disabled = false;
}

// ─── Processar una pàgina ─────────────────────────────────────────────

async function _processPage(pdfDoc, pageNum, apiKey, competency, items, model, scale) {
  // Renderitzem el canvas a alta resolució UNA SOLA VEGADA (operació cara).
  // El downscale i la codificació base64 es fan dins del bucle perquè poden
  // canviar si detectem un full complex (escalada de maxImageDim).
  const page     = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = Math.round(viewport.width);
  canvas.height  = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  const prompt   = buildOmrPrompt(competency);
  const provider = _modelInfo(model).provider;

  // Paràmetres adaptatius: valors inicials conservadors (cost baix).
  // Si Gemini detecta un full complex (MAX_TOKENS), els escalem tots dos
  // alhora per al proper intent i només per a aquest full.
  let maxImageDim      = 1800;
  let maxOutputTokens  = 8000;

  // Funció auxiliar: downscale del canvas original al límit actual i
  // codificació JPEG. Es crida cada cop que maxImageDim pugui haver canviat.
  function _buildBase64() {
    let src = canvas;
    if (Math.max(canvas.width, canvas.height) > maxImageDim) {
      const ratio = maxImageDim / Math.max(canvas.width, canvas.height);
      src = document.createElement('canvas');
      src.width  = Math.round(canvas.width  * ratio);
      src.height = Math.round(canvas.height * ratio);
      src.getContext('2d').drawImage(canvas, 0, 0, src.width, src.height);
    }
    return { base64: src.toDataURL('image/jpeg', 0.85).split(',')[1], src };
  }

  let { base64, src } = _buildBase64();

  let lastErr = null;
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const callResult = (provider === 'google')
        ? await _callGemini(apiKey, model, base64, prompt, maxOutputTokens)
        : await _callAnthropic(apiKey, model, base64, prompt);

      const text = callResult.text;
      const usage = callResult.usage;

      let clean = text.trim();
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      }

      const parsed = _validarResposta(JSON.parse(clean), items);

      // Log informatiu d'ús (a la consola). No bloquejant si falten dades.
      _logPageUsage(pageNum, model, scale, src.width, src.height, src.width * src.height, usage, parsed);

      return parsed;

    } catch (err) {
      lastErr = err;

      // Full complex detectat (thinking exhaureix el pressupost de tokens):
      // escalem ALHORA els tokens i la mida de la imatge, i reintentes sense
      // consumir un intent "de debò". La imatge més gran redueix l'ambigüitat
      // visual → el model pensa menys → l'escalada de tokens és suficient.
      // Ho fem només una vegada; si amb 16.000 encara retalla, cas extrem.
      if (err.isMaxTokens && maxOutputTokens < 16000) {
        maxOutputTokens = 16000;
        maxImageDim     = 2200;
        ({ base64, src } = _buildBase64());   // regenerar amb nova mida
        console.warn(
          `[AI] Pàg. ${pageNum}: MAX_TOKENS. Reintentant amb ${maxOutputTokens} tokens` +
          ` i imatge ${src.width}×${src.height} px (cap ${maxImageDim}px)...`
        );
        // No comptem aquest intent com a "fallada" a efectes de maxAttempts.
        attempt--;
        continue;
      }

      // Decideix si val la pena reintentar i quan
      const isTransient = _isTransientError(err);
      const maxAttempts = isTransient ? MAX_RETRIES_TRANSIENT : MAX_RETRIES_DEFAULT;

      if (attempt >= maxAttempts) break;

      // Backoff: agafem el valor de la taula segons el número d'intents fallits.
      // Si superem la taula, repetim l'últim valor (saturem).
      const backoffIdx = Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1);
      const wait = RETRY_BACKOFF_MS[backoffIdx];
      console.warn(`[AI] Intent ${attempt} fallat (${isTransient ? 'transitori' : 'permanent'}: ${err.message}). Esperant ${wait}ms abans del següent...`);
      await _sleep(wait);
    }
  }

  // Tots els intents han fallat. Marquem el resultat amb un flag d'error
  // perquè la UI pugui mostrar un toast clar.
  const respostes = {};
  items.forEach((_, i) => { respostes[`Q${String(i + 1).padStart(2, '0')}`] = '?'; });
  return {
    id_alumne: '',
    respostes,
    comentari: `ERROR: ${lastErr?.message}`,
    _failed: true,    // ← flag per a la UI
    _error: lastErr?.message || 'Error desconegut',
  };
}

// ─── Classificació d'errors per al retry ─────────────────────────────
//
// Errors transitoris (val la pena reintentar amb backoff llarg):
//   - HTTP 429 (Too Many Requests / quota momentània)
//   - HTTP 5xx (Service Unavailable, Internal Error, Bad Gateway...)
//   - TypeError / errors de xarxa (fetch ha fallat sense response)
//
// Errors permanents (reintents limitats):
//   - HTTP 4xx no-429 (auth, permisos, payload invàlid...)
//   - SyntaxError de JSON (la IA ha tornat brossa, repetir potser dóna el mateix)
//   - Errors d'aplicació (safety, max_tokens, recitation...)
function _isTransientError(err) {
  const status = err?.httpStatus;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;  // 4xx no-429 = permanent
  }
  // Sense codi HTTP: probablement error de xarxa (fetch failure, timeout...)
  // o error d'aplicació. Si el missatge diu "Failed to fetch" o similar,
  // tractem-ho com a transitori.
  if (err instanceof SyntaxError) return false;
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return true;
  }
  return false;
}

// ─── Crida a Anthropic ───────────────────────────────────────────────

async function _callAnthropic(apiKey, model, base64, prompt) {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,  // marge generós; Claude no té thinking ocult al límit
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
    const err = new Error(msg);
    err.httpStatus = resp.status;
    throw err;
  }

  const data = await resp.json();
  return {
    text: data.content.find(b => b.type === 'text')?.text || '',
    usage: {
      provider: 'anthropic',
      promptTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null,
      thoughtsTokens: null,    // Claude no exposa thinking tokens al límit estàndard
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// ─── Crida a Google Gemini ───────────────────────────────────────────
//
// Gemini té dues diferències importants respecte Anthropic:
//   1. La clau va a la URL com a query param (?key=...).
//   2. Té un flag `responseMimeType: "application/json"` que força sortida
//      JSON vàlida — això elimina d'arrel els ```json``` que Claude posa
//      a vegades. Per això, després de la crida, no cal el strip de fences.
//
// El system prompt es passa com a `systemInstruction.parts[0].text`.
// El text + imatge van junts a `contents[0].parts[]`.

async function _callGemini(apiKey, model, base64, prompt, maxOutputTokens = 8000) {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: PROMPT_SISTEMA }],
      },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens,
        temperature: 0,
      },
    }),
  });

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    let errBody = null;
    try {
      errBody = await resp.json();
      msg = errBody.error?.message || msg;
    } catch (_) {}
    const err = new Error(msg);
    err.httpStatus = resp.status;
    throw err;
  }

  const data = await resp.json();

  const candidate = data.candidates?.[0];
  if (!candidate) {
    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Gemini ha bloquejat el prompt (raó: ${blockReason}). Mira la consola per detalls.`);
    }
    throw new Error('Gemini no ha retornat cap candidat. Mira la consola.');
  }

  // Casos finishReason que volem reportar específicament
  const fr = candidate.finishReason;
  if (fr === 'SAFETY') {
    throw new Error(`Gemini ha refusat per polítiques de seguretat. Ratings: ${JSON.stringify(candidate.safetyRatings)}`);
  }
  if (fr === 'MAX_TOKENS') {
    const err = new Error(
      'Gemini ha retallat la resposta (MAX_TOKENS). ' +
      'Si veieu aquest error de manera repetida, proveu a pujar la resolució ' +
      '(els models pensen menys quan la imatge és més clara) o canvieu a Claude Opus.'
    );
    err.isMaxTokens = true;
    throw err;
  }
  if (fr === 'RECITATION') {
    throw new Error('Gemini ha refusat per "RECITATION" (similitud amb material protegit).');
  }

  const txt = candidate.content?.parts?.find(p => p.text)?.text;
  if (!txt) {
    throw new Error(`Gemini ha retornat una resposta sense text (finishReason=${fr}).`);
  }

  return {
    text: txt,
    usage: {
      provider: 'google',
      promptTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
      thoughtsTokens: data.usageMetadata?.thoughtsTokenCount ?? null,
      totalTokens: data.usageMetadata?.totalTokenCount ?? null,
    },
  };
}

// ─── Validació de la resposta de Claude ──────────────────────────────

function _validarResposta(data, items) {
  const raw = (data.respostes && typeof data.respostes === 'object') ? data.respostes : {};
  const respostes = {};
  items.forEach((_, i) => {
    const qid = `Q${String(i + 1).padStart(2, '0')}`;
    const rawVal = raw[qid];
    let v = String(rawVal ?? '?').trim();
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

function _loadResultsIntoApp(results, competency, items, model, logEntries) {
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

  // Desar el log estructurat a l'estat perquè export.js el pugui incloure
  // com a full addicional "Log OMR" quan l'usuari exporti el XLSX.
  setAiLog({ model, runAt: new Date().toISOString(), entries: logEntries });

  closeAiRecognizer();

  // Comptem fulls fallats (tots els reintents han esgotat-se per error d'API)
  // i respostes pendents (cel·les '?' = dubtes que la IA no ha sabut decidir)
  const failedPages = results.filter(r => r._failed);
  const dubtoses = results.reduce(
    (s, r) => s + Object.values(r.respostes).filter(v => v === '?').length, 0
  );

  let msg = '';
  let urgent = false;

  if (failedPages.length > 0) {
    // Cas crític: hi ha fulls completament fallats. Toast vermell amb avís fort.
    urgent = true;
    const okCount = results.length - failedPages.length;
    msg = `⚠️ ${failedPages.length} full${failedPages.length !== 1 ? 's' : ''} ` +
          `${failedPages.length !== 1 ? 'han' : 'ha'} fallat per error d'API ` +
          `(servidor sobrecarregat o problema de xarxa). ` +
          `Carregat${okCount !== 1 ? 's' : ''} ${okCount} full${okCount !== 1 ? 's' : ''} OK. ` +
          `Recomanació: torna a executar el reconeixement més tard, o substitueix ` +
          `només els fulls fallats (apareixen amb totes les preguntes en blanc).`;
  } else {
    msg = `✓ ${results.length} alumne${results.length !== 1 ? 's' : ''} carregats via reconeixement automàtic.`;
    if (dubtoses > 0) {
      msg += ` ⚠️ ${dubtoses} resposta${dubtoses !== 1 ? 's' : ''} pendents de revisió manual (·).`;
    }
  }

  showToast(msg, urgent ? 8000 : undefined);
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
encara queden marques voluntàries en MÉS D'UNA opció, retorna «!». \
Aquest valor és real i s'utilitza: NO el descartis pensant que has de triar guanyador. \
EXEMPLE A: a una fila V/F, V té una X clara i F també té una X clara (cap dels dos quadrats \
emplenat) → són DUES marques vàlides → retorna «!». No triïs cap. \
EXEMPLE B: a una fila a/b/c/d, «a» té una X i «b» està PLE-ENCERCLAT → són dues opcions \
vàlides (X compta com a vàlida i PLE-ENCERCLAT també) → retorna «!». \
EXEMPLE C: dues X netes a opcions diferents de la mateixa fila (sense cap quadret PLE per \
anul·lar-ne una) → retorna «!».

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
   PAS D — VERIFICACIÓ ABANS DE RETORNAR (obligatori, no l'ometis):
     · Si retornaràs una lletra concreta (a/b/c/d/e/V/F o etiqueta binària): comprova \
       una segona vegada que la resta de quadrets de la fila són TOTS BUITs o PLE-sense-cercle. \
       Si en trobes un altre amb X o PLE-ENCERCLAT, RECTIFICA i retorna «!».
     · Si retornaràs «—»: comprova que la fila NO conté cap X visible ni cap PLE-ENCERCLAT. \
       Si en detectes un que abans no havies vist, rectifica i retorna aquella opció. Una fila \
       totalment buida és «—» legítim; una fila amb una sola X és la lletra de la X, mai «—».
     · Si dubtes entre dues classificacions del mateix quadret (X tènue vs esborrat, PLE vs \
       PLE-ENCERCLAT amb cercle dèbil, gargot vs aspa) i no pots resoldre-ho amb confiança, \
       prefereix sempre «?» a triar arbitràriament. Una «?» costa una revisió humana de 5 \
       segons; una resposta inventada costa una puntuació falsa que ningú no detectarà.
     · MAI inventis una resposta a una fila que percebis com a buida. Si no veus cap marca, \
       el valor és «—», no una lletra a l'atzar.

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

// ─── Log de tokens consumits per pàgina ──────────────────────────────
//
// Imprimeix a la consola informació útil per fer-se una idea del cost real
// de cada full processat. Útil per comparar la rendibilitat entre models i
// resolucions (288 DPI vs 216 DPI vs 144 DPI).

// Preus per milió de tokens en USD. Actualitzat maig 2026.
const PRICING = {
  'claude-opus-4-7':       { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':     { input:  3.00, output: 15.00 },
  'claude-haiku-4-5':      { input:  1.00, output:  5.00 },
  'gemini-2.5-pro':        { input:  1.25, output: 10.00 },
  'gemini-2.5-flash':      { input:  0.30, output:  2.50 },
  'gemini-2.5-flash-lite': { input:  0.10, output:  0.40 },
};

function _logPageUsage(pageNum, model, scale, w, h, pixelCount, usage, parsed) {
  if (!usage) return;

  // Estimació de cost (USD i €). Per a Gemini, els thoughtsTokens es facturen
  // com a output. Per a Claude, no n'hi ha de visibles.
  const price = PRICING[model];
  let costUsd = null;
  if (price && usage.promptTokens != null && usage.outputTokens != null) {
    const inCost  = (usage.promptTokens / 1_000_000) * price.input;
    const outCost = ((usage.outputTokens + (usage.thoughtsTokens || 0)) / 1_000_000) * price.output;
    costUsd = inCost + outCost;
  }
  const costEur = costUsd != null ? costUsd * 0.93 : null;  // taxa USD→EUR aprox.

  // Recompte de respostes detectades
  const respostes = parsed?.respostes || {};
  const total = Object.keys(respostes).length;
  const valides = Object.values(respostes).filter(v => v && v !== '?' && v !== '').length;

  // Fem servir console.group per col·lapsar-lo i no embrutar massa
  console.groupCollapsed(
    `[AI cost] Pàg. ${pageNum} — ${model} @ scale ${scale}` +
    (costEur != null ? ` — ~${costEur.toFixed(4)} €` : '')
  );
  console.log(`Imatge enviada: ${w}×${h} px (${(pixelCount / 1_000_000).toFixed(2)} MP)`);
  console.log(`Tokens entrada (prompt + imatge): ${usage.promptTokens ?? 'n/d'}`);
  console.log(`Tokens sortida visible: ${usage.outputTokens ?? 'n/d'}`);
  if (usage.thoughtsTokens != null) {
    console.log(`Tokens "thinking" (Gemini, també facturat com a output): ${usage.thoughtsTokens}`);
  }
  console.log(`Tokens TOTAL: ${usage.totalTokens ?? 'n/d'}`);
  if (costUsd != null) {
    console.log(`Cost estimat: $${costUsd.toFixed(5)} ≈ ${costEur.toFixed(5)} €`);
    console.log(`Per a 60 fulls a aquest ritme: ~${(costEur * 60).toFixed(2)} €`);
  }
  console.log(`Respostes detectades: ${valides}/${total}`);
  console.groupEnd();
}

