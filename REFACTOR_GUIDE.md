# Refactoring Guide: `informe-cb.html` → Modular Project Structure

> **Audience**: AI agent performing autonomous code transformation.  
> **Source file**: `informe-cb.html` — 165 KB, 3 675 lines, single-file Catalan secondary-school competency-test corrector ("Corrector CompBàsiques 4t ESO").  
> **Primary refactoring goal**: Decouple the **yearly-variable data layer** (question numbering, skill/subcompetency mappings) from the stable UI/logic layer, so that migrating to a new academic year (e.g. 2026-27) requires editing **only the data files** with no risk of touching rendering, scoring, or export logic.

---

## Progress Tracker

| Phase | Scope | Status | Notes |
|---|---|---|---|
| **1** | Step 1 — CSS extraction + directory scaffold | ✅ **Done** | `styles/{tokens,layout,components,animations}.css` produced; `index.html` rewired with `<link>` tags. JS still inline. App is fully functional and visually identical to the original. 216 of 216 selectors preserved (verified). |
| **2** | Steps 2–18 — Full ES module conversion | ✅ **Done** | Year-data extracted to `data/{cat,mat,ct}-2025-26.js`; competency registry at `data/competencies.js`; 16 JS modules under `js/`; bootstrap at `js/init.js`; `index.html` reduced from 3 675 lines (165 KB) to 404 lines (17 KB). All inline `on*=` handlers replaced by `addEventListener` wired in `init.js`. Validation: zero import-resolution errors, zero ES-module cycles, zero Node syntax errors, every `getElementById` ID exists in the HTML. |
| 3 | Future — additional polish | ⏳ Optional | Possible follow-ups: jsdoc types for all modules; vitest unit tests for `scoring.js` and `render.js`; e2e tests for the answer-entry flow; tree-shake the unused `getColInfo` etc. |

After Phase 2, the deployable artifact is:

```
project-root/
├── index.html              ← shell: links 4 stylesheets, loads js/init.js as ES module
├── styles/                 ← 4 stylesheets (216 rules total)
│   ├── tokens.css
│   ├── animations.css
│   ├── layout.css
│   └── components.css
├── data/                   ← year-variable data — change here for next academic year
│   ├── cat-2025-26.js
│   ├── mat-2025-26.js
│   ├── ct-2025-26.js
│   └── competencies.js     ← stable registry; only this file is imported by code outside data/
└── js/                     ← 16 modules
    ├── state.js            ← single source of truth (mutable state + persistence)
    ├── render.js           ← DOM sync; uses competencies registry
    ├── grid.js             ← grid construction (cells, columns)
    ├── keyboard.js         ← key config + settings modal
    ├── main-keyboard.js    ← top-level answer-entry handler
    ├── navigation.js       ← prev/next student, cell movement, goBack
    ├── student-modal.js    ← student creation / inline rename / completion prompt
    ├── pdf-viewer.js       ← pdf.js wrapper (uses runtime state from state.js)
    ├── key-editor.js       ← answer-key editor + load/save
    ├── scoring.js          ← scoring + results table + getGrade (shared)
    ├── export.js           ← XLSX export/import + results download
    ├── reports.js          ← DOCX report generator (only module besides
    │                          competencies.js that imports year-data directly)
    ├── ui.js               ← toast, FAQ, dropdowns, global ESC, beforeunload
    ├── centre.js           ← centre/curs modal + autocomplete
    ├── startup.js          ← startup wizard + applyCompetency
    └── init.js             ← entry point: bootstraps, wires DOM events
```

Cycles between modules are broken via setter-injection callbacks wired in `init.js`:
- `pdf-viewer.setOpenModalFn(openModal)` (from `student-modal`)
- `key-editor.setApplyCompetencyFn(applyCompetency)` and `export.setApplyCompetencyFn(applyCompetency)` (from `startup`)
- `centre.setGenerateInformesFn(generateInformes)` (from `reports`)
- `centre.setOnCentreChanged(updateCentreFromWizard)` (from `startup`)
- `ui.setCloseSettingsFn(closeSettings)` and `ui.setCloseKeyEditorFn(closeKeyEditor)` (to break ui ↔ key-editor cycle for `closeOverlay`)
- `key-editor.setAfterKeyEditorFn(afterKeyEditor)` (wired inside `startup.js` itself)

External CDN globals are accessed via `window.X`: `window.ExcelJS`, `window.pdfjsLib`, `window.JSZip`. These remain loaded as classic `<script>` tags before `js/init.js`.

---

## 0. Pre-flight Analysis — What the File Contains

> **Location strategy** — The source file evolves; line numbers drift. **Do not rely on the line numbers below**. Locate every block by symbol search (`grep -n` or your editor's "go to symbol"). The reference patterns are listed in the table.

Before touching anything, parse and catalogue the source file into these categories:

| Layer | Section anchor | Locate via |
|---|---|---|
| CSS (design tokens + layout + components + animations) | `<style>` block | `grep -n '^<style>\|^</style>'` |
| HTML shell (header, grid wrapper, PDF pane, modals) | `<body>` before `<script>` | `grep -n '^<body>\|^<script>'` |
| **Data — CAT items & ranges** | Top of `<script>` | `grep -n 'const CAT_ITEMS\|const CAT_RANGES'` |
| **Data — CT (CIEN) items & ranges** | `<script>` | `grep -n 'const CIEN_ITEMS\|const CIEN_RANGES'` |
| **Data — COMPETENCIES registry** | `<script>` | `grep -n 'const COMPETENCIES'` |
| **Data — MAT_SENTIT_MAP** | inside `generateInformes()` | `grep -n 'const MAT_SENTIT_MAP'` |
| **Data — CAT_PROCESS_MAP** | inside `generateInformes()` | `grep -n 'const CAT_PROCESS_MAP'` |
| **Data — CIEN_DC_MAP** | inside `generateInformes()` | `grep -n 'const CIEN_DC_MAP'` |
| Startup wizard logic | `<script>` | `grep -n 'function startApp\|function selectOpt\|function applyCompetency'` |
| State management | `<script>` | `grep -n 'let stuMap\|let curIdx\|let ambits\|let centreCfg'` |
| PDF viewer | `<script>` | `grep -n 'function togglePdfPane\|function loadPdfFile\|function renderPdfPage'` |
| Grid builder | `<script>` | `grep -n 'function buildGrid\|function buildGridCat\|function buildGridMat\|function buildGridCien\|function makeCell'` |
| Render loop | `<script>` | `grep -n 'function render\b\|function valDisplay\|function getItemType'` |
| Student modal | `<script>` | `grep -n 'function openModal\|function confirmStudent\|function editNameInline'` |
| Settings / key config | `<script>` | `grep -n 'function openSettings\|function saveCfgSettings\|function renderCfgTable'` |
| Navigation | `<script>` | `grep -n 'function prevStu\|function nextStu\|function moveCell\|function goBack'` |
| Main keyboard handler | `<script>` | `grep -n "addEventListener\\('keydown'"` (top-level handlers) |
| Export (xlsx) | `<script>` | `grep -n 'async function exportRespostes\|async function dlResultsXLSX'` |
| Import (xlsx) | `<script>` | `grep -n 'async function importRespostes'` |
| Clear / Answer Key Editor | `<script>` | `grep -n 'function clearAllData\|function openKeyEditor\|function buildKeyGrid'` |
| Scoring | `<script>` | `grep -n 'function scoreStudent\|function openCorrect\|function doCorrect\|function renderResults'` |
| Report generator (`generateInformes`) | `<script>` | `grep -n 'async function generateInformes'` (lift the entire function) |
| UI helpers (toast, FAQ, dropdown, ESC, unsaved) | `<script>` | `grep -n 'function toggleDropdown\|function showToast\|function openFaq\|function markUnsaved'` |
| `init` bootstrap | Last lines of `<script>` before `</script>` | top-level calls to `loadKeyCfg(); buildGrid(); render();` |

**Convention for the rest of this document**: when a step says "lift function X", locate it with the patterns above; do not trust any incidental line range that may appear.

---

## 1. Target File Tree

```
project-root/
├── index.html                        ← thin shell (no inline CSS, no inline JS)
│
├── styles/
│   ├── tokens.css                    ← CSS custom properties only
│   ├── layout.css                    ← body, hdr, grid, pdf-pane, nav, kbd-ref
│   ├── components.css                ← cells, buttons, dropdowns, modals, overlays
│   └── animations.css                ← @keyframes, transitions
│
├── data/
│   ├── competencies.js               ← COMPETENCIES registry (stable)
│   ├── cat-2025-26.js                ← CAT_ITEMS, CAT_RANGES, CAT_PROCESS_MAP
│   ├── mat-2025-26.js                ← MAT ambits config + MAT_SENTIT_MAP
│   └── ct-2025-26.js                 ← CIEN_ITEMS, CIEN_RANGES, CIEN_DC_MAP
│
└── js/
    ├── state.js                      ← all mutable runtime state
    ├── grid.js                       ← buildGrid, buildGridMat/Cat/Cien, makeCell
    ├── render.js                     ← render(), valDisplay(), getItemType/Label
    ├── keyboard.js                   ← keyCfg, ACTION_META, DEFAULT_KEYS, FORBIDDEN
    ├── navigation.js                 ← prevStu, nextStu, moveCell, goBack
    ├── student-modal.js              ← openModal, closeModal, confirmStudent, editNameInline
    ├── key-editor.js                 ← answerKey, openKeyEditor, buildKeyGrid, renderKey
    ├── scoring.js                    ← scoreStudent, openCorrect, doCorrect, renderResults
    ├── export.js                     ← exportRespostes, importRespostes, dlResultsXLSX
    ├── reports.js                    ← generateInformes + all OOXML builder helpers
    ├── pdf-viewer.js                 ← PDF.js wrapper (loadPdfFile, renderPdfPage, zoom)
    ├── ui.js                         ← dropdowns, overlays, toast, FAQ, ESC, beforeunload
    ├── centre.js                     ← centreCfg, openCentreModal, centreAc autocomplete
    ├── startup.js                    ← startupSel, selectOpt, startApp, acceptWarning
    └── init.js                       ← bootstrap: loadKeyCfg → buildGrid → render → wizard
```

---

## 2. Contracts Between Modules

Each module exposes a **named export surface**. The contracts below must be respected exactly — never inline-call internals across module boundaries.

### 2.1 Data Layer Contracts (`data/*.js`)

Every year-data file must export the following symbols. The consuming modules (`grid.js`, `render.js`, `scoring.js`, `reports.js`) access them exclusively through the `COMPETENCIES` registry — never by direct import of year-specific files.

#### `competencies.js` — **Stable registry, never changes year-to-year**

There are two competency shapes: **items-based** (CAT, CT — fixed item list and fixed ranges) and **ambits-based** (MAT — user-configurable runtime activities). The registry encodes both via a discriminator field.

```ts
type Competency =
  | {
      kind: 'items-based';
      label: string;
      getItems:  () => Item[];        // never null for items-based
      getRanges: () => Range[];       // never null for items-based
    }
  | {
      kind: 'ambits-based';
      label: string;
      getItems:  () => null;          // ambits-based has no fixed items
      getRanges: () => null;          // ranges resolved at runtime via state.ambits
      defaultAmbits: Range[];         // seed values for state.ambits
    };

export const COMPETENCIES: Record<string, Competency>;
```

Consumers must check `kind` (or check the return value of `getItems()`/`getRanges()` for null) before assuming an items-based shape. The runtime ambits for an ambits-based competency live in `state.js` (`state.ambits`), seeded from `defaultAmbits` whenever `applyCompetency()` is invoked.

`Item` shape:
```ts
interface Item {
  label:      string;            // displayed question label, e.g. "14.1", "27.3"
  type:       'abcd' | 'abcde' | 'vf' | 'bin';
  binLabels?: [string, string];  // only when type === 'bin'
}
```

`Range` shape:
```ts
interface Range {
  name:      string;             // display name, e.g. "Comprensió Oral"
  abbrev:    string;             // short tag for table headers, e.g. "CO"
  color:     string;             // CSS hex color, e.g. "#b03020"
  start:     number;             // inclusive index into items array
  end:       number;             // exclusive index into items array
  questions: number;             // === end - start (redundant but explicit)
}
```

#### `cat-2025-26.js` — Catalan language competency for 2025-26

```js
export const CAT_ITEMS  = Item[];         // 44 items total
export const CAT_RANGES = Range[];        // 3 ranges: CO, CE1, CE2

// Cognitive process map: index i → process code
// Length must === CAT_ITEMS.length
export const CAT_PROCESS_MAP = string[];  // values in {'LOI','RID','III','RVC'}

export const CAT_PROCESS_INFO = {
  [code: string]: { label: string; color: string }
};
export const CAT_PROCESS_ORDER = string[];   // canonical display order
```

#### `mat-2025-26.js` — Mathematics competency for 2025-26

```js
// MAT uses dynamic ambits (user-configurable), so the base definition lives here
export const MAT_DEFAULT_AMBITS = Range[];   // 4 ranges: ACT1-ACT4

// Mathematical sense map: index i → sense code
// Length must === total questions in MAT_DEFAULT_AMBITS
export const MAT_SENTIT_MAP = string[];      // values in {'NUM','EiM','ALG','EST'}

export const MAT_SENTIT_INFO = {
  [code: string]: { label: string; color: string }
};
export const SENTIT_ORDER = string[];
```

#### `ct-2025-26.js` — Science-technology competency for 2025-26

```js
export const CIEN_ITEMS  = Item[];           // 40 items total (3 activities)
export const CIEN_RANGES = Range[];          // 3 ranges: ACT1, ACT2, ACT3

// Competency descriptor map: index i → DC code
// Length must === CIEN_ITEMS.length
export const CIEN_DC_MAP = string[];         // values in {'DC1','DC2','DC3','DC4'}

export const CIEN_DC_INFO = {
  [code: string]: { label: string; color: string }
};
export const CIEN_DC_ORDER = string[];
```

**Invariant** (enforce at load time with an assertion function):
```
range.start + range.questions === range.end
sum(range.questions for range in RANGES) === ITEMS.length
MAP.length === ITEMS.length
```

---

### 2.2 State Module Contract (`state.js`)

**`state.js` is the single owner of all mutable application state.** No other module mutates these values directly — they call exported setters. This is the *only* consistent way to share `let`-bound values across ES modules (a `let` re-export is read-only at the import site).

```js
// ── Internal storage (module-private) ──
let _stuMap            = {};        // { [key: string]: (string|null)[] }
let _stuNames          = {};        // { [key: string]: string }
let _stuOrder          = [];        // string[] — insertion order
let _curIdx            = -1;
let _qIdx              = 0;
let _stuCompletePrompt = false;
let _currentCompetencyId = 'default';   // 'default' = pre-wizard placeholder
let _answerKey         = null;      // string[] | null
let _lastResults       = null;
let _unsavedChanges    = false;
let _ambits            = loadAmbitsFromStorage();   // Range[] — runtime MAT ambits
let _centreCfg         = loadCentreFromStorage();   // { centre, curs }
// PDF runtime state (transient, not persisted)
let _pdfDoc = null, _pdfTotalPages = 0, _pdfCurrentPage = 0;
let _pdfRenderTask = null, _pdfResizeTimer = null, _pdfZoom = 1.0;

// ── Read-only getters ──
export const getStuMap            = () => _stuMap;
export const getStuNames          = () => _stuNames;
export const getStuOrder          = () => _stuOrder;
export const getCurIdx            = () => _curIdx;
export const getQIdx              = () => _qIdx;
export const getCurrentCompetencyId = () => _currentCompetencyId;
export const getAnswerKey         = () => _answerKey;
export const getLastResults       = () => _lastResults;
export const getAmbits            = () => _ambits;
export const getCentreCfg         = () => _centreCfg;
export const isUnsaved            = () => _unsavedChanges;
// ...and getters for every other field

// ── Setters (the *only* permitted mutation path) ──
export function setStuMap(v)            { _stuMap = v; }
export function setCurIdx(i)            { _curIdx = i; }
export function setQIdx(i)              { _qIdx = i; }
export function setCurrentCompetencyId(id) { _currentCompetencyId = id; }
export function setAnswerKey(k)         { _answerKey = k; }
export function setLastResults(r)       { _lastResults = r; }

// `markUnsaved`/`markSaved` live HERE because they mutate state.
// `ui.js` only attaches the `beforeunload` listener and reads `isUnsaved()`.
export function markUnsaved() { _unsavedChanges = true; }
export function markSaved()   { _unsavedChanges = false; }

// `centreCfg` lives HERE. `centre.js` handles the modal UI and calls setCentreCfg.
export function setCentreCfg(cfg) {
  _centreCfg = cfg;
  localStorage.setItem('cb4-centre', JSON.stringify(_centreCfg));
}

// `ambits` lives HERE. `startup.js`'s applyCompetency() calls resetAmbits when
// switching to MAT; the settings UI calls setAmbits when the user reconfigures.
export function setAmbits(a) {
  _ambits = a;
  localStorage.setItem('cb4-ambits', JSON.stringify(_ambits));
}
export function resetAmbits(defaultAmbits) {
  setAmbits(defaultAmbits.map(a => ({ ...a })));
}
```

**Ownership rules — non-negotiable:**

| State | Owner | UI/persistence helpers |
|---|---|---|
| `centreCfg` | `state.js` | `centre.js` (modal, autocomplete) calls `setCentreCfg` |
| `ambits` | `state.js` | `startup.js` calls `resetAmbits`; settings UI calls `setAmbits` |
| `unsavedChanges` | `state.js` (incl. `markUnsaved`/`markSaved`) | `ui.js` attaches `beforeunload` and reads `isUnsaved()` |
| `keyCfg` | `keyboard.js` (self-contained, with own localStorage key `cb4-keys-v2`) | — |
| PDF runtime state | `state.js` | `pdf-viewer.js` calls setters |

---

### 2.3 Grid Module Contract (`grid.js`)

```js
// Depends on: state.js, render.js (for getItemType/Label), competencies.js

export function buildGrid()    // rebuilds the main response-entry grid
export function buildKeyGrid() // rebuilds the answer-key editor grid
export function makeCell(qi, color, opts): HTMLElement
  // opts = { prefix: string, onClick: (qi: number) => void }
```

`buildGrid` must read `currentCompetencyId` from `state.js` and call the appropriate `getItems()`/`getRanges()` via the `COMPETENCIES` registry. No direct references to `CAT_ITEMS`, `CIEN_ITEMS`, etc.

---

### 2.4 Render Module Contract (`render.js`)

```js
export function render()                          // full DOM sync from state
export function valDisplay(val, qi): string       // internal value → display string
export function getItemType(qi): ItemType         // uses currentCompetencyId
export function getItemLabel(qi): string
export function getQ(): number                    // total question count
export function getAmbitRanges(): Range[]
export function getAmbitForQ(qi): Range
```

**Imports**: `state.js` (for current competency, ambits) and `competencies.js` (for the registry — never direct from year-data files). `getItemType` and `getItemLabel` resolve through the registry:

```js
import { COMPETENCIES } from '../data/competencies.js';
import { getCurrentCompetencyId, getAmbits } from './state.js';

export function getItemType(qi) {
  const items = COMPETENCIES[getCurrentCompetencyId()]?.getItems();
  return items?.[qi]?.type || 'abcd';
}

export function getQ() {
  const comp = COMPETENCIES[getCurrentCompetencyId()];
  if (comp?.kind === 'items-based') return comp.getItems().length;
  return getAmbits().reduce((s, a) => s + Math.max(1, a.questions | 0), 0);
}
```

No module other than `grid.js` and `key-editor.js` may call `buildGrid`/`buildKeyGrid`. All display updates go through `render()` or `renderKey()`.

`render.js` must **not** import from `grid.js` (no circular dep) and must **not** import directly from year-data files.

---

### 2.5 Scoring Module Contract (`scoring.js`)

```js
export function scoreStudent(answers, key): StudentScore
// StudentScore = { ambitScores: AmbitScore[], total, wrong, blank, invalid }

export function openCorrect()
export function doCorrect()    // populates lastResults in state.js
export function renderResults(results)
export function getGrade(pct): { code: 'NA'|'AS'|'AN'|'AE', full: string, color: string }
```

`getGrade` is used by both `scoring.js` and `reports.js` — move it to a shared `scoring.js` and import it in `reports.js`.

---

### 2.6 Reports Module Contract (`reports.js`)

```js
export async function generateInformes()

// Internal helpers (not exported, no external dependency allowed):
// wPara, wCell, wAmbitTable, wLevelBar, wPercentChart
// buildMatPage, buildCatPage, buildCienPage, buildSimplePage
// computeSentitScores, computeCatProcessScores, computeCienDcScores
// wSentitTable, wCatProcessTable, wCienDcTable
```

`reports.js` imports:
- `state.js` → getters for `lastResults`, `currentCompetencyId`, `centreCfg`
- `scoring.js` → `getGrade`
- `competencies.js` → `COMPETENCIES` registry for items/ranges
- **Year-data files directly** for the `*_MAP`, `*_INFO` and `*_ORDER` symbols (the only module besides `competencies.js` allowed to do so — see §7). Migrating to a new year requires updating the three import paths in this file.

---

## 3. Step-by-Step Refactoring Instructions

Execute the steps in this exact order. Each step is atomic and testable.

---

### Step 1 — Extract CSS into four files ✅

**Status**: Completed in Phase 1.

**Input**: the entire `<style>` block (locate with `grep -n '^<style>\|^</style>'`).  
**Output**: `styles/tokens.css`, `styles/layout.css`, `styles/components.css`, `styles/animations.css`.

**Implementation notes (from Phase 1)**:
- Total selectors preserved: 216 = 4 (tokens) + 38 (layout) + 170 (components) + 4 (animations).
- The `<link>` tags in `index.html` are loaded in this order: **tokens → animations → layout → components**. Animations come before layout/components because the latter reference keyframe names via `animation:` declarations, and although CSS resolution doesn't strictly require this order, it is the most defensible source order for clarity.
- `@keyframes pulse-border` is defined in `animations.css` even though it's no longer referenced by any rule. Original comment in source was "keep pulse-border for other uses". Preserved for parity; safe to remove if a future review confirms it's truly unused.
- The original had two comments (`/* .key-loaded merged above */` and `/* keep pulse-border for other uses */`) inside the style block. Those one-liners were dropped — they were referencing line positions that no longer exist after splitting.

#### 1a. `styles/tokens.css`
Extract only the `:root { }` block with all `--*` custom properties. Also include the `*, *::before, *::after`, `html`, and base `body` rules.

#### 1b. `styles/layout.css`
Extract rules for structural layout selectors:
`.hdr`, `.hdr-left`, `.hdr-center`, `.hdr-right`, `.hdr-title`, `.spacer`, `.stu-code`, `.hdr-name`, `.prog-wrap`, `.prog-fill`, `.main`, `.grid-wrapper`, `.ambit-bar`, `.grid`, `.pdf-pane`, `.pdf-bar`, `.pdf-canvas-wrap`, `#pdf-canvas`, `.col`, `.col-lbl-range`, `.cells`, `.nav`, `.nav-st`, `.nav-q`, `.done-b`, `.kbd-ref`, `.ki`, `kbd`, `.sect`, `.sect-hdr`, `.sect-grid`, `.mat-col`, `.grid-narrow`.

#### 1c. `styles/components.css`
Everything not in tokens or layout:
- `.cell`, `.q-n`, `.q-a`, `.cur`, `.cell.filled`, `.cell.active`, `.cell[data-v=*]`, `.cell[data-vf]`
- All button variants: `.btn`, `.btn-hdr`, `.btn.pri`, `.startup-go`
- All dropdown rules: `.dropdown`, `.dd-trigger`, `.dd-menu`, `.dd-item`, `.dd-sep`
- All modal/overlay variants: `.overlay`, `.modal`, `.cfg-box`, `.amb-box`, `.sheet-box`, `.res-box`, `.correct-box`, `.done-prompt`, `.done-box`, `.startup-box`, `.faq-box`, `.warning-box`, `.centre-box`, `.key-editor-box`
- `.cfg-table`, `.cfg-row-hdr`, `.cfg-row2`, `.cfg-keybadge`, `.cfg-act-cell`, etc.
- `.key-loaded`, `.centre-ac`, `.centre-ac-item`, `#toast`
- `table`, `thead th`, `tbody td`, `td.score`, `td.ok`, `td.err`, `td.blnk`
- `#key-grid .sect-hdr`, `#key-grid .cell`

#### 1d. `styles/animations.css`
All `@keyframes` rules: `blink`, `pop-in`, `warning-pop`, `pulse-border`.

**Validation**: Load `index.html` in a browser with all four CSS files linked. Visual appearance must be pixel-identical to the original.

---

### Step 2 — Extract the year-data files

This is the **highest-value step**. Do it carefully.

#### 2a. `data/cat-2025-26.js`

Lift out of `<script>` (verbatim, then convert to ES module syntax). Locate each block with `grep -n` (see Section 0):

```js
// LIFT: CAT_ITEMS array (verbatim)
// LIFT: CAT_RANGES array (verbatim)
// LIFT: CAT_PROCESS_MAP array (verbatim from inside generateInformes)
// LIFT: CAT_PROCESS_INFO object (verbatim)
// LIFT: CAT_PROCESS_ORDER array (verbatim)

export { CAT_ITEMS, CAT_RANGES, CAT_PROCESS_MAP, CAT_PROCESS_INFO, CAT_PROCESS_ORDER };
```

Add a self-validating assertion at module load:
```js
console.assert(
  CAT_PROCESS_MAP.length === CAT_ITEMS.length,
  `CAT_PROCESS_MAP length ${CAT_PROCESS_MAP.length} ≠ CAT_ITEMS length ${CAT_ITEMS.length}`
);
CAT_RANGES.forEach(r => console.assert(
  r.start + r.questions === r.end,
  `CAT_RANGES[${r.abbrev}] start+questions ≠ end`
));
```

#### 2b. `data/mat-2025-26.js`

```js
// LIFT: COMPETENCIES.mat.ambits (the inline 4-element array inside the COMPETENCIES literal) as MAT_DEFAULT_AMBITS
// LIFT: MAT_SENTIT_MAP (from inside generateInformes)
// LIFT: MAT_SENTIT_INFO object
// LIFT: SENTIT_ORDER array

export { MAT_DEFAULT_AMBITS, MAT_SENTIT_MAP, MAT_SENTIT_INFO, SENTIT_ORDER };
```

#### 2c. `data/ct-2025-26.js`

```js
// LIFT: CIEN_ITEMS array (verbatim)
// LIFT: CIEN_RANGES array (verbatim)
// LIFT: CIEN_DC_MAP (from inside generateInformes)
// LIFT: CIEN_DC_INFO object
// LIFT: CIEN_DC_ORDER array

export { CIEN_ITEMS, CIEN_RANGES, CIEN_DC_MAP, CIEN_DC_INFO, CIEN_DC_ORDER };
```

#### 2d. `data/competencies.js`

```js
import { CAT_ITEMS, CAT_RANGES }  from './cat-2025-26.js';
import { MAT_DEFAULT_AMBITS }     from './mat-2025-26.js';
import { CIEN_ITEMS, CIEN_RANGES } from './ct-2025-26.js';

export const COMPETENCIES = {
  cat: {
    kind:      'items-based',
    label:     'Llengua catalana',
    getItems:  () => CAT_ITEMS,
    getRanges: () => CAT_RANGES,
  },
  mat: {
    kind:          'ambits-based',
    label:         'Matemàtiques',
    getItems:      () => null,
    getRanges:     () => null,
    defaultAmbits: MAT_DEFAULT_AMBITS,
  },
  ct: {
    kind:      'items-based',
    label:     'Científico-tecnològica',
    getItems:  () => CIEN_ITEMS,
    getRanges: () => CIEN_RANGES,
  },
};
```

---

### Step 3 — Extract `state.js`

Create `js/state.js`. Lift the following variable declarations from the top of `<script>`:

```
stuMap, stuNames, stuOrder, curIdx, qIdx, stuCompletePrompt, currentCompetencyId
```

Also lift from inside `generateInformes` (or wherever they live in `<script>`):
```
answerKey, lastResults, keyDraft, keyDraftQIdx, keyEditorOpen
unsavedChanges
```

And lift:
```
ambits   (localStorage-initialised array using MAT_DEFAULT_AMBITS as fallback)
centreCfg
pdfDoc, pdfTotalPages, pdfCurrentPage, pdfRenderTask, pdfResizeTimer, pdfZoom
```

Provide typed setter helpers and a `saveAmbitsCfg()` / `saveCentreCfg()` co-located with the relevant state.

---

### Step 4 — Extract `js/render.js`

Lift functions: `getQ`, `getAmbitRanges`, `getItemType`, `getItemLabel`, `valDisplay`, `getAmbitForQ`, `render`.

`render.js` imports from `state.js` and `COMPETENCIES`.  
It must **not** import from `grid.js` (no circular dep).

---

### Step 5 — Extract `js/grid.js`

Lift functions: `getColInfo`, `buildGrid`, `buildGridCat`, `buildGridMat`, `buildGridCien`, `makeCell`.

`grid.js` imports from `state.js`, `render.js` (for `getItemType`, `getItemLabel`, `getAmbitRanges`).

**Key constraint**: the three `buildGridXxx` functions must call `getItems()`/`getRanges()` through the `COMPETENCIES` registry — never reference `CAT_ITEMS` directly.

---

### Step 6 — Extract `js/keyboard.js`

Lift: `DEFAULT_KEYS`, `ACTION_META`, `FORBIDDEN`, `keyCfg`, `loadKeyCfg`, `saveKeyCfg`, `displayKey`, `normalizeKey`, `CONFLICT_GROUPS`.

Expose: `getKeyCfg()`, `setKeyCfg(draft)`.

---

### Step 7 — Extract `js/navigation.js`

Lift: `prevStu`, `nextStu`, `moveCell`, `goBack`.

Imports: `state.js`, `render.js`, `pdf-viewer.js` (for `syncPdfToCurrent`), `student-modal.js` (for `openModal`).

---

### Step 8 — Extract `js/student-modal.js`

Lift: `openModal`, `closeModal`, `confirmStudent`, `editNameInline`, all `keydown` listeners attached to `d-name` and `stu-overlay`.

---

### Step 9 — Extract `js/key-editor.js`

Lift: `openKeyEditor`, `closeKeyEditor`, `confirmKeyEditor`, `buildKeyGrid`, `renderKey`, `saveKeyAndMaybeDownload`, `saveKeyTxt`, `loadKeyTxt`, `keyGoBack`, the key-editor `keydown` listener block.

---

### Step 10 — Extract `js/scoring.js`

Lift: `scoreStudent`, `openCorrect`, `doCorrect`, `renderResults`, `fmt`, `getGrade`.

`getGrade` is also used by `reports.js` — it stays in `scoring.js` and is re-imported there.

---

### Step 11 — Extract `js/reports.js`

Lift the entire `generateInformes()` async function and all its inner helpers:
`esc`, `wPara`, `wCell`, `wAmbitTable`, `wLevelBar`, `wAmbitTableWithAsterisks`, `hasNaAmbit`, `wPercentChart`, `buildMatPage`, `buildCatPage`, `buildCienPage`, `buildSimplePage`, `computeSentitScores`, `wSentitTable`, `computeCatProcessScores`, `synthesisCat`, `wCatProcessTable`, `computeCienDcScores`, `synthesisCien`, `wCienDcTable`.

After lifting, the `computeXxxScores` functions must import their maps from the data files via the `COMPETENCIES` registry:

```js
// Inside reports.js — obtain year data through registry
import { COMPETENCIES } from '../data/competencies.js';
import { MAT_SENTIT_MAP, MAT_SENTIT_INFO, SENTIT_ORDER } from '../data/mat-2025-26.js';
import { CAT_PROCESS_MAP, CAT_PROCESS_INFO, CAT_PROCESS_ORDER } from '../data/cat-2025-26.js';
import { CIEN_DC_MAP, CIEN_DC_INFO, CIEN_DC_ORDER } from '../data/ct-2025-26.js';
```

> **Rationale for direct import in `reports.js`**: the skill/process/DC maps are tightly coupled to the reporting narrative and cannot be resolved through a generic registry. However, to update for 2026-27, only the year-data file import paths need to change (three lines).

---

### Step 12 — Extract `js/export.js`

Lift: `exportRespostes`, `importRespostes`, `dlResultsXLSX`.

---

### Step 13 — Extract `js/pdf-viewer.js`

Lift: `updatePdfToggleBtn`, `togglePdfPane`, `loadPdfFile`, `skipPdf`, `changePdfZoom`, `renderPdfPage`, `syncPdfToCurrent`, `syncPdfToNextSlot`, the `window.resize` listener, the `pdfjsLib` global worker init.

---

### Step 14 — Extract `js/centre.js`

**Note**: per the ownership table in §2.2, `centreCfg` itself lives in `state.js`. `centre.js` owns only the UI and calls `setCentreCfg(...)` from `state.js` when the user confirms changes. The localStorage key `cb4-centre` is read/written from inside `state.js`'s `setCentreCfg` and the initial loader `loadCentreFromStorage`.

Lift into `centre.js`: `getDefaultCurs`, `openCentreModal`, `closeCentreModal`, `saveCentreModal` (which now ends with `setCentreCfg(...)`), `centreAc`, `hideCentreAc`, `centreAcKey`, `pickCentreAc`, `CENTRE_SUGGESTIONS`, and the `keydown` listener for the centre modal.

The `CENTRE_SUGGESTIONS` array (currently `['Institut Miquel Tarradell']`) belongs in `centre.js` — it is school-specific, not year-specific, so it does not go into a year-data file.

---

### Step 15 — Extract `js/ui.js`

Lift: `toggleDropdown`, `closeDropdowns`, the `click` listener for closing dropdowns, the global `ESC` handler, `closeOverlay`, `openFaq`, `closeFaq`, `toggleFaq`, `showToast`.

Also lift the completion-prompt helpers: `showCompletePrompt`, `hideCompletePrompt`.

**Note**: per §2.2, `markUnsaved`/`markSaved` live in `state.js` (they mutate state). `ui.js` only attaches the `beforeunload` listener:

```js
import { isUnsaved } from './state.js';
window.addEventListener('beforeunload', e => {
  if (isUnsaved()) { e.preventDefault(); e.returnValue = ''; }
});
```

Other modules that need to flag unsaved work (e.g. `key-editor.js`, `student-modal.js`) import `markUnsaved`/`markSaved` from `state.js`, **not** from `ui.js`.

---

### Step 16 — Extract `js/startup.js`

Lift: `startupSel`, `pendingAfterKey`, `pendingAfterWarning`, `selectOpt`, `updateCentreFromWizard`, `startApp`, `acceptWarning`, `afterKeyEditor`, `applyCompetency`.

---

### Step 17 — Extract `js/init.js`

This is the bootstrap entry point. It runs after the DOM is ready:

```js
import { loadKeyCfg }   from './keyboard.js';
import { buildGrid }    from './grid.js';
import { render }       from './render.js';
import { centreCfg }    from './state.js';

loadKeyCfg();
buildGrid();
render();
document.getElementById('comp-overlay').classList.remove('off');
document.getElementById('sw-centre').value =
  centreCfg.centre !== 'Institut' ? centreCfg.centre : '';
document.getElementById('sw-curs').value = centreCfg.curs;
```

---

### Step 18 — Rewrite `index.html`

The new `index.html` must:
1. Link four CSS files in `<head>` (in order: tokens → layout → components → animations).
2. Contain the full HTML body markup (header, overlays, modals, grid wrapper, nav, keyboard ref — verbatim from source between `<body>` and `<script>`) with **no `<style>` block**.
3. Load a single `<script type="module" src="js/init.js">` at end of `<body>` — **no inline `<script>`**.
4. Keep the three CDN `<script>` tags for xlsx, exceljs, pdf.js, jszip **before** the module script (they expose globals; do not convert to ESM imports).

```html
<!-- head: CDN scripts for globals -->
<script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>

<!-- CSS -->
<link rel="stylesheet" href="styles/tokens.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/animations.css">

<!-- at end of body -->
<script type="module" src="js/init.js"></script>
```

---

## 4. Annual Update Procedure (2026-27 Migration)

After the refactor, updating for a new academic year requires **only** the following operations. Everything else stays untouched.

### 4.1 Create the new year-data files

```
cp data/cat-2025-26.js data/cat-2026-27.js
cp data/mat-2025-26.js data/mat-2026-27.js
cp data/ct-2025-26.js  data/ct-2026-27.js
```

### 4.2 Edit `data/cat-2026-27.js`

| Symbol | What to update |
|---|---|
| `CAT_ITEMS` | Add, remove, or renumber items. Change `label` strings (e.g. "11" → "12") and/or `type` if the question format changes. Maintain array order = question order in the test. |
| `CAT_RANGES` | Update `name`, `start`, `end`, `questions` to reflect new grouping. |
| `CAT_PROCESS_MAP` | Rewrite the flat array so that `CAT_PROCESS_MAP[i]` holds the process code for the item at `CAT_ITEMS[i]`. This array must be the same length as `CAT_ITEMS`. |

### 4.3 Edit `data/mat-2026-27.js`

| Symbol | What to update |
|---|---|
| `MAT_DEFAULT_AMBITS` | Update activity names and question counts. |
| `MAT_SENTIT_MAP` | Rewrite so `MAT_SENTIT_MAP[i]` holds the sense code for question `i`. Length must match total questions. |

### 4.4 Edit `data/ct-2026-27.js`

| Symbol | What to update |
|---|---|
| `CIEN_ITEMS` | Update labels, types, and `binLabels` as needed. |
| `CIEN_RANGES` | Update activity names and boundaries. |
| `CIEN_DC_MAP` | Rewrite so `CIEN_DC_MAP[i]` holds the DC code for item `i`. Length must match `CIEN_ITEMS.length`. |

### 4.5 Update imports in `data/competencies.js` and `js/reports.js`

Change **only the three import paths** (six lines total across two files):

```js
// data/competencies.js — change:
import { CAT_ITEMS, CAT_RANGES }   from './cat-2026-27.js';   // was 2025-26
import { MAT_DEFAULT_AMBITS }      from './mat-2026-27.js';   // was 2025-26
import { CIEN_ITEMS, CIEN_RANGES } from './ct-2026-27.js';    // was 2025-26

// js/reports.js — change:
import { MAT_SENTIT_MAP, ... }    from '../data/mat-2026-27.js';
import { CAT_PROCESS_MAP, ... }   from '../data/cat-2026-27.js';
import { CIEN_DC_MAP, ... }       from '../data/ct-2026-27.js';
```

No other files need to change.

---

## 5. Data Integrity Assertions

Add this utility to `data/competencies.js` and call it at startup (in `init.js`):

```js
export function validateAllCompetencies() {
  for (const [id, comp] of Object.entries(COMPETENCIES)) {
    const items  = comp.getItems?.();
    const ranges = comp.getRanges?.();
    if (!items || !ranges) continue;   // mat uses dynamic ambits

    const totalFromRanges = ranges.reduce((s, r) => s + r.questions, 0);
    console.assert(
      totalFromRanges === items.length,
      `[${id}] Ranges total ${totalFromRanges} ≠ items.length ${items.length}`
    );
    ranges.forEach(r => {
      console.assert(r.start + r.questions === r.end,
        `[${id}][${r.abbrev}] start+questions ≠ end`);
    });
  }
}
```

---

## 6. Dependency Graph

```
index.html
  └── js/init.js
        ├── js/keyboard.js
        ├── js/grid.js
        │     ├── js/state.js
        │     ├── js/render.js
        │     └── data/competencies.js
        │           ├── data/cat-YYYY-YY.js
        │           ├── data/mat-YYYY-YY.js
        │           └── data/ct-YYYY-YY.js
        └── js/render.js
              ├── js/state.js
              └── data/competencies.js   ← items/ranges resolved via the registry

js/reports.js
  ├── js/state.js
  ├── js/scoring.js
  ├── data/competencies.js
  ├── data/mat-YYYY-YY.js   ← year-specific MAPS only (only import path changes year-to-year)
  ├── data/cat-YYYY-YY.js
  └── data/ct-YYYY-YY.js

js/export.js
  ├── js/state.js
  └── js/render.js

js/scoring.js
  ├── js/state.js
  └── js/render.js

js/navigation.js
  ├── js/state.js
  ├── js/render.js
  ├── js/pdf-viewer.js
  └── js/student-modal.js

js/startup.js
  ├── js/state.js
  ├── js/grid.js
  └── data/competencies.js

js/centre.js
  └── js/state.js          ← UI helpers; centreCfg itself lives in state.js

js/ui.js
  └── js/state.js          ← reads isUnsaved() for beforeunload
```

No circular dependencies are permitted. `state.js` must import from nothing else in the project (it may use `localStorage` directly inside its own loaders/persisters).

---

## 7. Forbidden Patterns

The following patterns are explicitly prohibited in the refactored code:

1. **Direct import of year-data files (`cat-YYYY-YY.js`, `mat-YYYY-YY.js`, `ct-YYYY-YY.js`) from any module other than `competencies.js` and `reports.js`.** Every other module — including `grid.js` and `render.js` — accesses items, ranges and ambits through the `COMPETENCIES` registry or via state setters. `reports.js` is the one exception because its `compute*Scores` functions need the named MAP arrays.
2. **Direct mutation of `state.js` exports from outside the module** — only `state.js`'s own setters may change state. (Other modules import getters and setters; a `let` re-export is read-only.)
3. **Any `var` declarations** — use `const`/`let` throughout.
4. **`onclick="..."` inline handlers in HTML** — replace with `addEventListener` calls in the relevant JS module.
5. **`localStorage` access outside `state.js` and `keyboard.js`** — `state.js` persists `centreCfg`, `ambits`, and (transiently) anything else; `keyboard.js` persists `keyCfg`. No other module touches `localStorage`.
6. **Global function names** — after refactoring all functions must be module-scoped. Functions called from HTML event attributes (see step 18) must be re-wired to `addEventListener` in the corresponding module's init routine.

---

## 8. HTML Event Handler Rewiring Table

The following functions are currently called via inline `onclick`/`onchange`/`oninput` attributes in the HTML. After extracting them into modules, wire them up in the relevant module's init block using `document.getElementById(...).addEventListener(...)`.

| HTML attribute | Function | Target module |
|---|---|---|
| `onclick="toggleDropdown('dd-accions')"` | `toggleDropdown` | `ui.js` |
| `onclick="closeDropdowns();openKeyEditor()"` | `openKeyEditor` | `key-editor.js` |
| `onclick="closeDropdowns();openCorrect()"` | `openCorrect` | `scoring.js` |
| `onclick="closeDropdowns();exportRespostes()"` | `exportRespostes` | `export.js` |
| `onclick="closeDropdowns();document.getElementById('import-xlsx-file').click()"` | inline | `ui.js` |
| `onchange="importRespostes(this)"` | `importRespostes` | `export.js` |
| `onchange="loadKeyTxt(this)"` | `loadKeyTxt` | `key-editor.js` |
| `onchange="loadPdfFile(this)"` | `loadPdfFile` | `pdf-viewer.js` |
| `onclick="prevStu()"` | `prevStu` | `navigation.js` |
| `onclick="nextStu()"` | `nextStu` | `navigation.js` |
| `onclick="editNameInline()"` | `editNameInline` | `student-modal.js` |
| `onclick="openModal()"` | `openModal` | `student-modal.js` |
| `onclick="togglePdfPane()"` | `togglePdfPane` | `pdf-viewer.js` |
| `onclick="openSettings()"` | `openSettings` | `keyboard.js` |
| `onclick="openCentreModal()"` | `openCentreModal` | `centre.js` |
| `onclick="clearAllData()"` | `clearAllData` | `student-modal.js` |
| `onclick="openFaq()"` | `openFaq` | `ui.js` |
| `onclick="selectOpt(this)"` | `selectOpt` | `startup.js` |
| `onclick="startApp()"` | `startApp` | `startup.js` |
| `onclick="acceptWarning()"` | `acceptWarning` | `startup.js` |
| `onclick="skipPdf()"` | `skipPdf` | `pdf-viewer.js` |
| `onclick="confirmStudent()"` | `confirmStudent` | `student-modal.js` |
| `onclick="resetKeys()"` | `resetKeys` | `keyboard.js` |
| `onclick="saveCfgSettings()"` | `saveCfgSettings` | `keyboard.js` |
| `onclick="closeKeyEditor()"` | `closeKeyEditor` | `key-editor.js` |
| `onclick="saveKeyAndMaybeDownload()"` | `saveKeyAndMaybeDownload` | `key-editor.js` |
| `onclick="doCorrect()"` | `doCorrect` | `scoring.js` |
| `onclick="dlResultsXLSX()"` | `dlResultsXLSX` | `export.js` |
| `onclick="generateInformes()"` | `generateInformes` | `reports.js` |
| `oninput="centreAc(this,'sw-ac')"` | `centreAc` | `centre.js` |
| `onkeydown="centreAcKey(event,'sw-ac')"` | `centreAcKey` | `centre.js` |
| `onblur="setTimeout(...)hideCentreAc('sw-ac')"` | `hideCentreAc` | `centre.js` |
| `oninput="updateCentreFromWizard()"` | `updateCentreFromWizard` | `startup.js` |
| `onclick="changePdfZoom(-0.15)"` | `changePdfZoom` | `pdf-viewer.js` |
| `onclick="changePdfZoom(+0.15)"` | `changePdfZoom` | `pdf-viewer.js` |
| `onclick="closeOverlay('cfg-overlay')"` | `closeOverlay` | `ui.js` |
| `onclick="closeOverlay('correct-overlay')"` | `closeOverlay` | `ui.js` |
| `onclick="closeOverlay('results-overlay')"` | `closeOverlay` | `ui.js` |
| `onclick="closeFaq()"` | `closeFaq` | `ui.js` |
| `onclick="closeCentreModal()"` | `closeCentreModal` | `centre.js` |
| `onclick="saveCentreModal()"` | `saveCentreModal` | `centre.js` |
| `onclick="toggleFaq(this)"` | `toggleFaq` | `ui.js` |

---

## 9. Testing Checklist After Refactor

Run each item manually in a browser (no build tool required — native ES modules work in modern browsers over a local server).

- [ ] Startup wizard displays; all three competencies selectable
- [ ] Centre + curs fields persist to `localStorage` and repopulate on reload
- [ ] Answer key can be entered via keyboard; all item types (abcd/abcde/vf/bin) work
- [ ] Key file (`.txt`) can be saved and reloaded
- [ ] Student registration (name entry, auto-naming, inline rename) works
- [ ] All keyboard shortcuts (1-4, V/F, 0, x, arrows) respond correctly
- [ ] PDF viewer loads, zooms, syncs to current student
- [ ] Export to `.xlsx` produces a valid spreadsheet with correct sheet names and frozen panes
- [ ] Import from `.xlsx` restores all student answers correctly
- [ ] Correction produces a results table; XLSX download works
- [ ] Report generation produces a `.docx` with correct student pages, competency tables, and level bars
- [ ] Grade thresholds: 49 % → NA, 50 % → AS, 66.7 % → AS, 67 % → AN, 83.4 % → AE
- [ ] Switching competency via startup wizard resets answers and re-builds grid
- [ ] Dark theme (`data-theme="light"` toggle, if implemented) preserves CSS variable overrides
- [ ] `console.assert` calls in data files produce no failures in DevTools console

---

## 10. Notes for 2026-27 Author

When next year's official CB4 specification is published by the Departament d'Educació:

1. Open `data/cat-2026-27.js`. Update `CAT_ITEMS` (question labels and types), `CAT_RANGES` (section boundaries), and `CAT_PROCESS_MAP` (one entry per question, in order).
2. Open `data/mat-2026-27.js`. Update `MAT_DEFAULT_AMBITS` and `MAT_SENTIT_MAP`.
3. Open `data/ct-2026-27.js`. Update `CIEN_ITEMS`, `CIEN_RANGES`, and `CIEN_DC_MAP`.
4. Update the two import lines in `competencies.js` and the three import lines in `reports.js`.
5. Run the testing checklist above.
6. Commit with message: `data: add 2026-27 competency definitions`.

No other files should need modification unless the Departament changes the scoring algorithm, report format, or adds a new competency area.
