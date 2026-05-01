# Phase 1 — CSS extraction

This directory contains the result of Phase 1 of the refactoring described in `REFACTOR_GUIDE.md`.

## What changed

- The inline `<style>` block from the original `informe-cb.html` has been moved into four files under `styles/`.
- `index.html` now loads them via four `<link>` tags. Everything else (HTML body markup and the inline `<script>` block) is **byte-identical** to the original.

## Files

```
project-root/
├── index.html              ← original, but with <style>...</style> replaced by 4 <link> tags
├── REFACTOR_GUIDE.md       ← updated: Phase 1 marked done, progress tracker added
└── styles/
    ├── tokens.css          ← :root variables, * reset, html, body
    ├── animations.css      ← @keyframes (blink, pop-in, pulse-border, warning-pop)
    ├── layout.css          ← header, grid wrapper, PDF pane, nav row, sect, kbd-ref
    └── components.css      ← buttons, dropdowns, cells, modals, overlays, tables, FAQ, key editor
```

## Deploy

Drop these files into your repo at the root. No build step required. To run locally, serve the directory over HTTP (file:// works for Phase 1, but won't work in later phases that introduce ES modules):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Verification

Phase 1 was verified by:
- Counting top-level CSS rules: 216 in the original `<style>` block, 216 across the four files combined (no rule lost or duplicated).
- Cross-checking that every `animation: <name>` reference in the layout/components stylesheets has a matching `@keyframes <name>` defined in `animations.css`.

If anything renders differently from the original `informe-cb.html`, that's a bug — please report.

## Next phase

Phase 2 will extract the year-variable data (CAT/MAT/CT items, ranges, and skill maps) into `data/*.js` modules and convert the inline JS into ES modules. See the progress tracker in `REFACTOR_GUIDE.md`.
