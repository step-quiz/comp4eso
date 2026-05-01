# CompBàsiques 4t ESO — refactored

End state of Phase 2 of the refactoring described in `REFACTOR_GUIDE.md`.

## What this is

The original single-file app (`informe-cb.html`, 3 675 lines, 165 KB) split into a clean module tree. No build step needed — the browser loads ES modules directly.

```
project-root/
├── index.html              ← shell (404 lines)
├── REFACTOR_GUIDE.md       ← progress tracker + design notes
├── README.md               ← this file
├── styles/                 ← 4 stylesheets, 216 rules total
│   ├── tokens.css          (variables + reset)
│   ├── animations.css      (@keyframes)
│   ├── layout.css          (header, grid, panes)
│   └── components.css      (buttons, modals, tables, ...)
├── data/                   ← yearly-variable data
│   ├── cat-2025-26.js      (Catalan items + ranges + process map)
│   ├── mat-2025-26.js      (Math default ambits + sentit map)
│   ├── ct-2025-26.js       (Science items + ranges + DC map)
│   └── competencies.js     (stable registry — the only data/ file imported outside data/)
└── js/                     ← 16 modules (entry point: init.js)
    ├── state.js            ← single source of truth for mutable state
    ├── render.js           ← DOM sync from state via competencies registry
    ├── grid.js             ← cell + column construction
    ├── keyboard.js         ← key config + settings modal
    ├── main-keyboard.js    ← top-level answer-entry handler
    ├── navigation.js       ← prev/next student, arrow-key cell movement
    ├── student-modal.js    ← new-student / rename / completion prompt
    ├── pdf-viewer.js       ← pdf.js wrapper
    ├── key-editor.js       ← answer-key editor + load/save .txt
    ├── scoring.js          ← scoring + results table + getGrade
    ├── export.js           ← XLSX export/import + results download
    ├── reports.js          ← DOCX report generator (one per student)
    ├── ui.js               ← toast, FAQ, dropdowns, ESC, beforeunload
    ├── centre.js           ← centre/curs modal + autocomplete
    ├── startup.js          ← startup wizard + applyCompetency
    └── init.js             ← entry point — bootstraps and wires DOM events
```

## Deploy

Drop the directory at the root of your repo. **Important**: ES modules require a real HTTP server — `file://` will not work.

Simplest local dev:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

For GitHub Pages, Netlify, Vercel, or any static host: just push the directory.

## Migrating to a new academic year

The whole point of this refactor. To support 2026-27 (or any future year), edit *only* the data files:

1. Copy `data/cat-2025-26.js` → `data/cat-2026-27.js`. Update items, ranges, and process map for the new test.
2. Same for `mat-` and `ct-`.
3. In `data/competencies.js`, change the three `import` paths to point at the new files.
4. In `js/reports.js`, change the three `import` paths at the top of the file (this is the only module besides `competencies.js` that imports year-data directly — it needs the skill maps and labels to build per-skill breakdown tables).

That's it. No JS logic, render, scoring, or export code needs to change.

## Verification performed

Phase 2 was validated by:

- Counting top-level CSS rules: 216 in original = 216 across the four stylesheets (no rule lost).
- All `import { X } from './foo.js'` statements resolved against actual `export` declarations (zero errors).
- Zero ES-module import cycles (cycles broken via setter-injection in `init.js`).
- Every JS file passes `node --check`.
- Every `getElementById('...')` and every `init.js` `on('...', ...)` resolves to an `id="..."` actually present in `index.html`.
- All 28 inline `on*=` HTML attributes from the original have been removed and re-wired via `addEventListener`.
- All 4 self-validation `console.assert` checks in the data modules pass at load time.

If anything misbehaves vs. the original `informe-cb.html`, that's a bug — please report.
