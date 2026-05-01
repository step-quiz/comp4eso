// ═══════════════════════════════════════════════════════════════════════
// js/grid.js — Grid construction.
//
// `buildGridCat` and `buildGridCien` previously referenced CAT_RANGES /
// CIEN_RANGES directly. They now go through render.js's getAmbitRanges,
// which resolves through the COMPETENCIES registry — keeping year-data
// imports out of grid.js entirely.
// ═══════════════════════════════════════════════════════════════════════

import {
  getCurrentCompetencyId, getCurIdx, setQIdx,
} from './state.js';
import {
  getItemLabel, getItemType, getAmbitRanges, render,
} from './render.js';

// Split Q questions into 3 balanced columns (used by key editor)
export function getColInfo(Q) {
  const c1 = Math.ceil(Q / 3);
  const c2 = Math.ceil((Q - c1) / 2);
  const c3 = Q - c1 - c2;
  return [
    { start: 0,        size: c1 },
    { start: c1,       size: c2 },
    { start: c1 + c2,  size: c3 },
  ];
}

export function buildGrid() {
  const bar = document.getElementById('ambit-bar');
  bar.style.display = 'none';
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  grid.removeAttribute('style');
  grid.classList.remove('grid-narrow');
  const opts = {
    prefix: '',
    onClick: qi => {
      if (getCurIdx() >= 0) { setQIdx(qi); render(); }
    }
  };
  const id = getCurrentCompetencyId();
  if      (id === 'mat')  _buildGridMat(grid, opts);
  else if (id === 'cat')  _buildGridCat(grid, opts);
  else if (id === 'ct')   _buildGridCien(grid, opts);
}

export function makeCell(qi, color, opts) {
  const label = getItemLabel(qi);
  const type  = getItemType(qi);
  const isVF  = type === 'vf';
  const isBin = type === 'bin';
  const c = document.createElement('div');
  c.className = 'cell';
  c.id        = `${opts.prefix}c${qi}`;
  c.dataset.v = '';
  if (isVF || isBin) c.dataset.vf = '1';
  c.style.borderLeftColor = color;
  c.innerHTML = `<span class="q-n${label.length > 2 ? ' wide' : ''}">${label}</span>`
              + `<span class="q-a" id="${opts.prefix}a${qi}">·</span>`
              + `<span class="cur"></span>`;
  c.addEventListener('click', () => opts.onClick(qi));
  return c;
}

// ── Internal: build a generic 2-col layout from a list of ranges ──
function _buildTwoColGrid(grid, opts, colGroups) {
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '8px';
  grid.style.alignItems = 'stretch';
  grid.classList.add('grid-narrow');
  colGroups.forEach(group => {
    const colEl = document.createElement('div');
    colEl.className = 'mat-col';
    group.forEach(range => {
      const sect = document.createElement('div');
      sect.className = 'sect';
      sect.style.flex = String(range.questions);
      const hdr = document.createElement('div');
      hdr.className = 'sect-hdr';
      hdr.style.background = range.color;
      hdr.textContent = range.name.toUpperCase();
      const cells = document.createElement('div');
      cells.className = 'cells';
      for (let i = 0; i < range.questions; i++) {
        cells.appendChild(makeCell(range.start + i, range.color, opts));
      }
      sect.appendChild(hdr);
      sect.appendChild(cells);
      colEl.appendChild(sect);
    });
    grid.appendChild(colEl);
  });
}

function _buildGridCien(grid, opts) {
  const ranges = getAmbitRanges();
  _buildTwoColGrid(grid, opts, [[ranges[0], ranges[1]], [ranges[2]]]);
}

function _buildGridMat(grid, opts) {
  const ranges = getAmbitRanges();
  _buildTwoColGrid(grid, opts, [[ranges[0], ranges[1]], [ranges[2], ranges[3]]]);
}

function _buildGridCat(grid, opts) {
  const ranges = getAmbitRanges();
  _buildTwoColGrid(grid, opts, [[ranges[0], ranges[1]], [ranges[2]]]);
}
