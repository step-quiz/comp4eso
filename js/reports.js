// ═══════════════════════════════════════════════════════════════════════
// js/reports.js — DOCX report generator (one report per student).
//
// This is the only JS module besides data/competencies.js that imports
// year-data files directly: it needs MAT_SENTIT_MAP/INFO, CAT_PROCESS_MAP/INFO,
// and CIEN_DC_MAP/INFO to build per-skill breakdown tables.
//
// Depends on the global `JSZip` (loaded from CDN).
// ═══════════════════════════════════════════════════════════════════════

import { COMPETENCIES } from '../data/competencies.js';
import {
  getLastResults, getCentreCfg, getCurrentCompetencyId,
} from './state.js';
import { getQ, getAmbitRanges } from './render.js';
import { getGrade } from './scoring.js';
import {
  setPendingAfterCentre, openCentreModal,
} from './centre.js';

// Year-variable data: skill maps and labels.
import {
  MAT_SENTIT_MAP, MAT_SENTIT_INFO, SENTIT_ORDER,
} from '../data/mat-2025-26.js';
import {
  CAT_PROCESS_MAP, CAT_PROCESS_INFO, CAT_PROCESS_ORDER,
} from '../data/cat-2025-26.js';
import {
  CIEN_DC_MAP, CIEN_DC_INFO, CIEN_DC_ORDER,
} from '../data/ct-2025-26.js';

const JSZip = window.JSZip;

export async function generateInformes() {
  const lastResults = getLastResults();
  if (!lastResults) return;
  if (typeof JSZip === 'undefined') {
    alert('La llibreria ZIP no s\'ha carregat. Comprova la connexió a internet.');
    return;
  }

  const centreCfg = getCentreCfg();
  const currentCompetencyId = getCurrentCompetencyId();

  // ── Comprovar si el centre és el valor per defecte ───────────────────
  if (centreCfg.centre === 'Institut') {
    if (confirm('⚠ Encara no has introduït les dades del centre.\n\nVols introduir el nom del centre i el curs acadèmic abans de generar els informes?')) {
      setPendingAfterCentre(true);
      openCentreModal();
      return;
    }
  }

  const Q      = getQ();
  const { rows, key: ansKey } = lastResults;
  const ranges = getAmbitRanges();

  // ── Helpers ─────────────────────────────────────────────────────────
  // getGrade imported from scoring.js

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Paragraph with optional shading
  function wPara({ text='', bold=false, size=24, color='111111', align='left',
                   before=0, after=0, fill=null, italic=false }) {
    const shdXml = fill
      ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`
      : '';
    return `<w:p>
      <w:pPr>
        <w:jc w:val="${align}"/>
        <w:spacing w:before="${before}" w:after="${after}"/>
        ${shdXml}
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
          ${bold   ? '<w:b/><w:bCs/>' : ''}
          ${italic ? '<w:i/><w:iCs/>' : ''}
          <w:sz w:val="${size}"/><w:szCs w:val="${size}"/>
          <w:color w:val="${color}"/>
        </w:rPr>
        <w:t xml:space="preserve">${esc(text)}</w:t>
      </w:r>
    </w:p>`;
  }

  // Table cell
  function wCell({ text='', bold=false, size=20, color='111111',
                   fill='FFFFFF', width=3000, align='left', italic=false }) {
    const brd = `<w:tcBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tcBorders>`;
    return `<w:tc>
      <w:tcPr>
        <w:tcW w:w="${width}" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
        ${brd}
        <w:tcMar>
          <w:top    w:w="100" w:type="dxa"/>
          <w:left   w:w="140" w:type="dxa"/>
          <w:bottom w:w="100" w:type="dxa"/>
          <w:right  w:w="140" w:type="dxa"/>
        </w:tcMar>
        <w:vAlign w:val="center"/>
      </w:tcPr>
      <w:p>
        <w:pPr><w:jc w:val="${align}"/>
          <w:spacing w:before="0" w:after="0"/>
          <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
            ${bold   ? '<w:b/><w:bCs/>' : ''}
            ${italic ? '<w:i/><w:iCs/>' : ''}
            <w:sz w:val="${size}"/><w:szCs w:val="${size}"/>
            <w:color w:val="${color}"/>
          </w:rPr>
          <w:t xml:space="preserve">${esc(text)}</w:t>
        </w:r>
      </w:p>
    </w:tc>`;
  }

  // Table with àmbit breakdown
  function wAmbitTable(rng, ambitScores) {
    const W1 = 5200, W2 = 1600, W3 = 2226; // = 9026 DXA (A4 - 2×margin)
    const tblBrd = `<w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>`;

    const headerRow = `<w:tr>
      ${wCell({ text:'Activitat',  bold:true, size:18, color:'FFFFFF', fill:'1A4F8A', width:W1 })}
      ${wCell({ text:'Puntuació',  bold:true, size:18, color:'FFFFFF', fill:'1A4F8A', width:W2, align:'center' })}
      ${wCell({ text:'Nivell',     bold:true, size:18, color:'FFFFFF', fill:'1A4F8A', width:W3, align:'center' })}
    </w:tr>`;

    const dataRows = rng.map((range, j) => {
      const sc  = ambitScores[j];
      const pct = Math.round(sc.correct / sc.total * 100);
      const g   = getGrade(pct);
      const bg  = j % 2 === 0 ? 'FFFFFF' : 'F2F5FA';
      return `<w:tr>
        ${wCell({ text: range.name,                           size:20, color:'1a1a1a', fill:bg, width:W1 })}
        ${wCell({ text: `${sc.correct}/${sc.total} (${pct}%)`, size:20, color:'444444', fill:bg, width:W2, align:'center' })}
        ${wCell({ text: `${g.code} · ${g.full}`,              size:20, color:g.color,  fill:bg, width:W3, align:'center', bold:true })}
      </w:tr>`;
    }).join('');

    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="9026" w:type="dxa"/>
        ${tblBrd}
        <w:tblLook w:val="0000"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${W1}"/>
        <w:gridCol w:w="${W2}"/>
        <w:gridCol w:w="${W3}"/>
      </w:tblGrid>
      ${headerRow}${dataRows}
    </w:tbl>`;
  }

  function synthesisMat(code) {
    return {
      NA: "L\u2019alumne/a no assoleix la compet\u00e8ncia matem\u00e0tica.",
      AS: "L\u2019alumne/a assoleix amb un domini suficient la compet\u00e8ncia matem\u00e0tica.",
      AN: "L\u2019alumne/a assoleix amb bon domini la compet\u00e8ncia matem\u00e0tica.",
      AE: "L\u2019alumne/a assoleix amb molt bon domini de la compet\u00e8ncia matem\u00e0tica.",
    }[code] || '';
  }

  // ── Visual level bar (D8) ─────────────────────────────────────────────
  // 4-row table: each row = one level; active row highlighted
  function wLevelBar(activeCode) {
    const levels = [
      { code: 'AE', label: 'Alt',       color: '1E8449' },
      { code: 'AN', label: 'Mitj\u00e0-alt',  color: '1A5276' },
      { code: 'AS', label: 'Mitj\u00e0-baix', color: 'D4820A' },
      { code: 'NA', label: 'Baix',      color: 'C0392B' },
    ];
    const W_dot  = 360;
    const W_lbl  = 1440;
    const tblBrd = `<w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>`;
    const rows = levels.map(lv => {
      const active = lv.code === activeCode;
      const bg     = active ? lv.color : 'FFFFFF';
      const txtCol = active ? 'FFFFFF' : '555555';
      const dot    = active ? '\u25cf' : '';
      return `<w:tr>
        ${wCell({ text: dot,      bold:true,  size:16, color: active ? 'FFFFFF' : 'CCCCCC', fill:bg, width:W_dot,  align:'center' })}
        ${wCell({ text: lv.label, bold:active, size:16, color: txtCol,                        fill:bg, width:W_lbl, align:'left'   })}
      </w:tr>`;
    }).join('');
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="${W_dot + W_lbl}" w:type="dxa"/>
        ${tblBrd}
        <w:tblLook w:val="0000"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${W_dot}"/>
        <w:gridCol w:w="${W_lbl}"/>
      </w:tblGrid>
      ${rows}
    </w:tbl>`;
  }

  // ── wAmbitTable amb asterisc per NA (C7) ──────────────────────────────
  function wAmbitTableWithAsterisks(rng, ambitScores) {
    const W1 = 5200, W2 = 1600, W3 = 2226;
    const tblBrd = `<w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>`;
    const headerRow = `<w:tr>
      ${wCell({ text:'Activitat',  bold:true, size:18, color:'FFFFFF', fill:'1A4F8A', width:W1 })}
      ${wCell({ text:'Puntuaci\u00f3',  bold:true, size:18, color:'FFFFFF', fill:'1A4F8A', width:W2, align:'center' })}
      ${wCell({ text:'Nivell',     bold:true, size:18, color:'FFFFFF', fill:'1A4F8A', width:W3, align:'center' })}
    </w:tr>`;
    const dataRows = rng.map((range, j) => {
      const sc  = ambitScores[j];
      const pct = Math.round(sc.correct / sc.total * 100);
      const g   = getGrade(pct);
      const bg  = j % 2 === 0 ? 'FFFFFF' : 'F2F5FA';
      const levelLabel = g.code === 'NA' ? `${g.full}*` : g.full;
      return `<w:tr>
        ${wCell({ text: range.name,                             size:20, color:'1a1a1a', fill:bg, width:W1 })}
        ${wCell({ text: `${sc.correct}/${sc.total} (${pct}%)`, size:20, color:'444444', fill:bg, width:W2, align:'center' })}
        ${wCell({ text: levelLabel,                             size:20, color:g.color,  fill:bg, width:W3, align:'center', bold:true })}
      </w:tr>`;
    }).join('');
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="9026" w:type="dxa"/>
        ${tblBrd}
        <w:tblLook w:val="0000"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${W1}"/>
        <w:gridCol w:w="${W2}"/>
        <w:gridCol w:w="${W3}"/>
      </w:tblGrid>
      ${headerRow}${dataRows}
    </w:tbl>`;
  }

  // Checks if any àmbit has NA grade (for footnote C7)
  function hasNaAmbit(rng, ambitScores) {
    return rng.some((_, j) => {
      const sc  = ambitScores[j];
      const pct = Math.round(sc.correct / sc.total * 100);
      return getGrade(pct).code === 'NA';
    });
  }

  // ── Sentit matemàtic (32-question mat test) ──────────────────────────
  // Mapping: index 0–31 → sentit code (from official test specification)
  // (MAT_SENTIT_MAP / INFO / ORDER imported from data/mat-2025-26.js)
  function computeSentitScores(answers) {
    const sc = {};
    SENTIT_ORDER.forEach(s => { sc[s] = { correct: 0, total: 0 }; });
    MAT_SENTIT_MAP.forEach((s, i) => {
      if (i >= answers.length) return;
      sc[s].total++;
      const ans = answers[i];
      if (ans && ans !== '_' && ans !== '?' && ansKey && ansKey[i] && ans === ansKey[i])
        sc[s].correct++;
    });
    return sc;
  }

  function wSentitTable(sentitScores) {
    const W1 = 4400, W2 = 1400, W3 = 3226;
    const tblBrd = `<w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>`;
    const headerRow = `<w:tr>
      ${wCell({ text:'Sentit matem\u00e0tic', bold:true, size:22, color:'FFFFFF', fill:'1A4F8A', width:W1 })}
      ${wCell({ text:'Puntuaci\u00f3',         bold:true, size:22, color:'FFFFFF', fill:'1A4F8A', width:W2, align:'center' })}
      ${wCell({ text:'Nivell',                 bold:true, size:22, color:'FFFFFF', fill:'1A4F8A', width:W3, align:'center' })}
    </w:tr>`;
    const dataRows = SENTIT_ORDER.map((code, j) => {
      const info = MAT_SENTIT_INFO[code];
      const sc   = sentitScores[code];
      const pct  = sc.total > 0 ? Math.round(sc.correct / sc.total * 100) : 0;
      const g    = getGrade(pct);
      const bg   = j % 2 === 0 ? 'FFFFFF' : 'F2F5FA';
      const lvl  = g.code === 'NA' ? `${g.full}*` : g.full;
      return `<w:tr>
        ${wCell({ text: info.label,                             size:22, color:'1a1a1a',   fill:bg, width:W1 })}
        ${wCell({ text: `${sc.correct}/${sc.total} (${pct}%)`, size:22, color:'444444',   fill:bg, width:W2, align:'center' })}
        ${wCell({ text: lvl,                                    size:22, color: g.code === 'NA' ? 'C0392B' : '111111', fill:bg, width:W3, align:'center', bold:true })}
      </w:tr>`;
    }).join('');
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="9026" w:type="dxa"/>
        ${tblBrd}
        <w:tblLook w:val="0000"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${W1}"/>
        <w:gridCol w:w="${W2}"/>
        <w:gridCol w:w="${W3}"/>
      </w:tblGrid>
      ${headerRow}${dataRows}
    </w:tbl>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LLENGUA CATALANA — Processos cognitius
  // ═══════════════════════════════════════════════════════════════════════

  // Mapa índex pregunta (0-43) → codi procés cognitiu
  // Font: taula 2.1 del document de referència CB4 Llengua Catalana
  // (CAT_PROCESS_MAP / INFO / ORDER imported from data/cat-2025-26.js)
  function computeCatProcessScores(answers) {
    const sc = {};
    CAT_PROCESS_ORDER.forEach(c => { sc[c] = { correct: 0, total: 0 }; });
    CAT_PROCESS_MAP.forEach((code, i) => {
      if (i >= answers.length) return;
      sc[code].total++;
      const ans = answers[i];
      if (ans && ans !== '_' && ans !== '?' && ansKey && ansKey[i] && ans === ansKey[i])
        sc[code].correct++;
    });
    return sc;
  }

  function synthesisCat(code) {
    return {
      NA: "L\u2019alumne/a no assoleix la compet\u00e8ncia en comunicaci\u00f3 lingu\u00edstica en llengua catalana.",
      AS: "L\u2019alumne/a assoleix amb domini suficient la compet\u00e8ncia en comunicaci\u00f3 lingu\u00edstica en llengua catalana.",
      AN: "L\u2019alumne/a assoleix amb bon domini la compet\u00e8ncia en comunicaci\u00f3 lingu\u00edstica en llengua catalana.",
      AE: "L\u2019alumne/a assoleix amb molt bon domini la compet\u00e8ncia en comunicaci\u00f3 lingu\u00edstica en llengua catalana.",
    }[code] || '';
  }

  function wCatProcessTable(processScores) {
    const W1 = 4400, W2 = 1900, W3 = 2726; // total = 9026 DXA
    const tblBrd = `<w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>`;
    const headerRow = `<w:tr>
      ${wCell({ text:'Proc\u00e9s cognitiu', bold:true, size:22, color:'FFFFFF', fill:'B03020', width:W1 })}
      ${wCell({ text:'Puntuaci\u00f3',        bold:true, size:22, color:'FFFFFF', fill:'B03020', width:W2, align:'center' })}
      ${wCell({ text:'Nivell',               bold:true, size:22, color:'FFFFFF', fill:'B03020', width:W3, align:'center' })}
    </w:tr>`;
    const dataRows = CAT_PROCESS_ORDER.map((code, j) => {
      const info = CAT_PROCESS_INFO[code];
      const sc   = processScores[code];
      const pct  = sc.total > 0 ? Math.round(sc.correct / sc.total * 100) : 0;
      const g    = getGrade(pct);
      const bg   = j % 2 === 0 ? 'FFFFFF' : 'F5F2F8';
      const lvl  = g.code === 'NA' ? `${g.full}*` : g.full;
      return `<w:tr>
        ${wCell({ text: info.label,                             size:22, color:'1a1a1a',                         fill:bg, width:W1 })}
        ${wCell({ text: `${sc.correct}/${sc.total} (${pct}%)`, size:22, color:'444444',                         fill:bg, width:W2, align:'center' })}
        ${wCell({ text: lvl,                                    size:22, color: g.code==='NA' ? 'C0392B':'111111', fill:bg, width:W3, align:'center', bold:true })}
      </w:tr>`;
    }).join('');
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="9026" w:type="dxa"/>
        ${tblBrd}
        <w:tblLook w:val="0000"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${W1}"/>
        <w:gridCol w:w="${W2}"/>
        <w:gridCol w:w="${W3}"/>
      </w:tblGrid>
      ${headerRow}${dataRows}
    </w:tbl>`;
  }

  // ── Vertical percentage chart with orange dot ─────────────────────────
  function wPercentChart(pct) {
    const grade = getGrade(pct);
    const ZONES = [
      { code: 'AE', label: 'Nivell alt',        min: 83, max: 100 },
      { code: 'AN', label: 'Nivell mitj\u00e0-alt',  min: 67, max: 82  },
      { code: 'AS', label: 'Nivell mitj\u00e0-baix', min: 50, max: 66  },
      { code: 'NA', label: 'Nivell baix',       min: 0,  max: 49  },
    ];

    const W_chart = 1000;
    const W_label = 1800;
    const ROW_H   = 960;
    const INDENT  = 800; // twips d'indentació esquerra

    const rows = ZONES.map((zone, idx) => {
      const isActive = zone.code === grade.code;
      const isFirst  = idx === 0;
      const isLast   = idx === ZONES.length - 1;

      let vAlign = 'center';
      if (isActive) {
        const range  = zone.max - zone.min || 1;
        const within = (pct - zone.min) / range;
        if (within > 0.65)      vAlign = 'top';
        else if (within < 0.35) vAlign = 'bottom';
        else                    vAlign = 'center';
      }

      const dotXml = isActive
        ? `<w:r><w:rPr>
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
            <w:color w:val="E87722"/>
            <w:sz w:val="36"/><w:szCs w:val="36"/>
           </w:rPr><w:t>\u25cf</w:t></w:r>`
        : `<w:r><w:t></w:t></w:r>`;

      // Outer border: solid black sz=8; interior dividers: dashed sz=6
      const topVal  = isFirst  ? 'single' : 'dashed';
      const topSz   = isFirst  ? '8'      : '6';
      const topCol  = isFirst  ? '000000' : '555555';
      const btmVal  = isLast   ? 'single' : 'dashed';
      const btmSz   = isLast   ? '8'      : '6';
      const btmCol  = isLast   ? '000000' : '555555';

      return `<w:tr>
        <w:trPr><w:trHeight w:val="${ROW_H}" w:hRule="exact"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${W_chart}" w:type="dxa"/>
            <w:tcBorders>
              <w:top    w:val="${topVal}" w:sz="${topSz}" w:space="0" w:color="${topCol}"/>
              <w:left   w:val="single"   w:sz="8"        w:space="0" w:color="000000"/>
              <w:bottom w:val="${btmVal}" w:sz="${btmSz}" w:space="0" w:color="${btmCol}"/>
              <w:right  w:val="single"   w:sz="8"        w:space="0" w:color="000000"/>
            </w:tcBorders>
            <w:tcMar>
              <w:top    w:w="60"  w:type="dxa"/>
              <w:left   w:w="80"  w:type="dxa"/>
              <w:bottom w:w="60"  w:type="dxa"/>
              <w:right  w:w="80"  w:type="dxa"/>
            </w:tcMar>
            <w:vAlign w:val="${vAlign}"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
            ${dotXml}
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${W_label}" w:type="dxa"/>
            <w:tcBorders>
              <w:top    w:val="none" w:sz="0" w:color="FFFFFF"/>
              <w:left   w:val="none" w:sz="0" w:color="FFFFFF"/>
              <w:bottom w:val="none" w:sz="0" w:color="FFFFFF"/>
              <w:right  w:val="none" w:sz="0" w:color="FFFFFF"/>
            </w:tcBorders>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:ind w:left="180"/><w:spacing w:before="0" w:after="0"/></w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
                <w:b/><w:bCs/>
                <w:sz w:val="24"/><w:szCs w:val="24"/>
                <w:color w:val="222222"/>
              </w:rPr>
              <w:t>${zone.label}</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>`;
    });

    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="${W_chart + W_label}" w:type="dxa"/>
        <w:tblInd w:w="${INDENT}" w:type="dxa"/>
        <w:tblBorders>
          <w:insideH w:val="none"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
        <w:tblLook w:val="0000"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${W_chart}"/>
        <w:gridCol w:w="${W_label}"/>
      </w:tblGrid>
      ${rows.join('')}
    </w:tbl>`;
  }

  // ── Page builders ────────────────────────────────────────────────────

  function buildMatPage(r, grade, pct) {
    return [
      // A1: Capçalera taronja amb curs
      wPara({ text: `Avaluació de Competències Bàsiques  ·  ${centreCfg.curs}`,
              bold: true, size: 38, fill: 'E87722', color: 'FFFFFF', before: 100, after: 0 }),
      wPara({ text: `4t d’ESO  ·  ${centreCfg.centre}`,
              bold: false, size: 20, fill: 'E87722', color: 'FFFFFF', before: 0, after: 0 }),

      // A2+A3: destinatari i codi de centre
      wPara({ text: `Informe per a la fam\u00edlia`,
              size: 20, color: 'FFFFFF', fill: 'E87722', before: 0, after: 120 }),

      // B4: text introductori
      wPara({ text: 'Benvolguda fam\u00edlia,', bold: true, size: 22, color: '111111', before: 280, after: 80 }),
      wPara({ text: 'Els presentem els resultats que el seu fill/a ha obtingut de les proves de compet\u00e8ncia b\u00e0sica de 4t d\u2019ESO. Aquests resultats s\u2019incorporaran al conjunt d\u2019informaci\u00f3 de l\u2019alumne/a i es tindran en compte en l\u2019avaluaci\u00f3 final, tot i que no seran determinants per a l\u2019obtenci\u00f3 del t\u00edtol de graduat en educaci\u00f3 secund\u00e0ria obligat\u00f2ria.',
              size: 22, color: '333333', before: 0, after: 280 }),

      // Nom alumne
      wPara({ text: `Alumne/a: ${r.name}`, bold: true, size: 32, color: '111111', before: 0, after: 480 }),

      // Seccio competencia
      wPara({ text: 'COMPET\u00c8NCIA MATEM\u00c0TICA',
              bold: true, size: 21, fill: '1A4F8A', color: 'FFFFFF', before: 80, after: 80 }),

      wPara({ text: synthesisMat(grade.code), size: 26, color: '333333',
              align: 'left', before: 160, after: 240 }),

      // Gràfic de percentatge (cercle taronja)
      wPercentChart(pct),

      // ── Detall per sentit matemàtic (only for 32-question test) ──────
      ...(Q === 32 ? (() => {
        const sentitScores = computeSentitScores(r.answers);
        const hasNaSentit  = SENTIT_ORDER.some(s => {
          const sc = sentitScores[s];
          return sc.total > 0 && getGrade(Math.round(sc.correct / sc.total * 100)).code === 'NA';
        });
        return [
          wPara({ text: '', before: 240, after: 0 }),
          wSentitTable(sentitScores),
          hasNaSentit
            ? wPara({ text: '* No s\u2019assoleix el sentit i cal refor\u00e7ar-lo.',
                      size: 18, color: 'C0392B', italic: true, before: 120, after: 0 })
            : '',
        ];
      })() : []),

    ].join('\n');
  }

  function buildCatPage(r, grade, pct) {
    const processScores = computeCatProcessScores(r.answers);
    const hasNaProcess  = CAT_PROCESS_ORDER.some(code => {
      const sc = processScores[code];
      return sc.total > 0 && getGrade(Math.round(sc.correct / sc.total * 100)).code === 'NA';
    });
    return [
      wPara({ text: `Avaluació de Competències Bàsiques  ·  ${centreCfg.curs}`,
              bold: true, size: 38, fill: 'E87722', color: 'FFFFFF', before: 100, after: 0 }),
      wPara({ text: `4t d’ESO  ·  ${centreCfg.centre}`,
              bold: false, size: 20, fill: 'E87722', color: 'FFFFFF', before: 0, after: 0 }),
      wPara({ text: `Informe per a la fam\u00edlia`,
              size: 20, color: 'FFFFFF', fill: 'E87722', before: 0, after: 120 }),
      wPara({ text: 'Benvolguda fam\u00edlia,', bold: true, size: 22, color: '111111', before: 280, after: 80 }),
      wPara({ text: 'Els presentem els resultats que el seu fill/a ha obtingut de les proves de compet\u00e8ncia b\u00e0sica de 4t d\u2019ESO. Aquests resultats s\u2019incorporaran al conjunt d\u2019informaci\u00f3 de l\u2019alumne/a i es tindran en compte en l\u2019avaluaci\u00f3 final, tot i que no seran determinants per a l\u2019obtenci\u00f3 del t\u00edtol de graduat en educaci\u00f3 secund\u00e0ria obligat\u00f2ria.',
              size: 22, color: '333333', before: 0, after: 280 }),
      wPara({ text: `Alumne/a: ${r.name}`, bold: true, size: 32, color: '111111', before: 0, after: 480 }),
      wPara({ text: 'COMPET\u00c8NCIA LLENGUA CATALANA',
              bold: true, size: 21, fill: 'B03020', color: 'FFFFFF', before: 80, after: 80 }),
      wPara({ text: synthesisCat(grade.code), size: 26, color: '333333',
              align: 'left', before: 160, after: 240 }),
      wPercentChart(pct),
      wPara({ text: '', before: 240, after: 0 }),
      wCatProcessTable(processScores),
      hasNaProcess
        ? wPara({ text: '* No s\u2019assoleix el proc\u00e9s cognitiu i cal refor\u00e7ar-lo.',
                  size: 18, color: 'C0392B', italic: true, before: 120, after: 0 })
        : '',
    ].join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMPETÈNCIA CIENTÍFICO-TECNOLÒGICA — Descriptors Competencials
  // ═══════════════════════════════════════════════════════════════════════
  // DC map: 40 ítems (0-39) → codi DC
  // Font: taula de descriptors competencials del document de referència
  // (CIEN_DC_MAP / INFO / ORDER imported from data/ct-2025-26.js)
  function computeCienDcScores(answers) {
    const sc = {};
    CIEN_DC_ORDER.forEach(c => { sc[c] = { correct: 0, total: 0 }; });
    CIEN_DC_MAP.forEach((code, i) => {
      if (i >= answers.length) return;
      sc[code].total++;
      const ans = answers[i];
      if (ans && ans !== '_' && ans !== '?' && ansKey && ansKey[i] && ans === ansKey[i])
        sc[code].correct++;
    });
    return sc;
  }

  function synthesisCien(code) {
    return {
      NA: "L\u2019alumne/a no assoleix la compet\u00e8ncia cient\u00edfic-tecnol\u00f2gica.",
      AS: "L\u2019alumne/a assoleix amb domini suficient la compet\u00e8ncia cient\u00edfic-tecnol\u00f2gica.",
      AN: "L\u2019alumne/a assoleix amb bon domini la compet\u00e8ncia cient\u00edfic-tecnol\u00f2gica.",
      AE: "L\u2019alumne/a assoleix amb molt bon domini la compet\u00e8ncia cient\u00edfic-tecnol\u00f2gica.",
    }[code] || '';
  }

  function wCienDcTable(dcScores) {
    const W1 = 4400, W2 = 1900, W3 = 2726; // total = 9026 DXA
    const tblBrd = `<w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>`;
    const headerRow = `<w:tr>
      ${wCell({ text:'Descriptor competencial', bold:true, size:22, color:'FFFFFF', fill:'7A3090', width:W1 })}
      ${wCell({ text:'Puntuaci\u00f3',          bold:true, size:22, color:'FFFFFF', fill:'7A3090', width:W2, align:'center' })}
      ${wCell({ text:'Nivell',                  bold:true, size:22, color:'FFFFFF', fill:'7A3090', width:W3, align:'center' })}
    </w:tr>`;
    const dataRows = CIEN_DC_ORDER.map((code, j) => {
      const info = CIEN_DC_INFO[code];
      const sc   = dcScores[code];
      const pct  = sc.total > 0 ? Math.round(sc.correct / sc.total * 100) : 0;
      const g    = getGrade(pct);
      const bg   = j % 2 === 0 ? 'FFFFFF' : 'F4F0F8';
      const lvl  = g.code === 'NA' ? `${g.full}*` : g.full;
      return `<w:tr>
        ${wCell({ text: info.label,                             size:22, color:'1a1a1a',                           fill:bg, width:W1 })}
        ${wCell({ text: `${sc.correct}/${sc.total} (${pct}%)`, size:22, color:'444444',                           fill:bg, width:W2, align:'center' })}
        ${wCell({ text: lvl,                                    size:22, color: g.code==='NA' ? 'C0392B':'111111', fill:bg, width:W3, align:'center', bold:true })}
      </w:tr>`;
    }).join('');
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="9026" w:type="dxa"/>
        ${tblBrd}
        <w:tblLook w:val="0000"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${W1}"/>
        <w:gridCol w:w="${W2}"/>
        <w:gridCol w:w="${W3}"/>
      </w:tblGrid>
      ${headerRow}${dataRows}
    </w:tbl>`;
  }

  function buildCienPage(r, grade, pct) {
    const dcScores  = computeCienDcScores(r.answers);
    const hasNaDc   = CIEN_DC_ORDER.some(code => {
      const sc = dcScores[code];
      return sc.total > 0 && getGrade(Math.round(sc.correct / sc.total * 100)).code === 'NA';
    });
    return [
      wPara({ text: `Avaluaci\u00f3 de Compet\u00e8ncies B\u00e0siques  \u00b7  ${centreCfg.curs}`,
              bold: true, size: 38, fill: 'E87722', color: 'FFFFFF', before: 100, after: 0 }),
      wPara({ text: `4t d\u2019ESO  \u00b7  ${centreCfg.centre}`,
              bold: false, size: 20, fill: 'E87722', color: 'FFFFFF', before: 0, after: 0 }),
      wPara({ text: `Informe per a la fam\u00edlia`,
              size: 20, color: 'FFFFFF', fill: 'E87722', before: 0, after: 120 }),
      wPara({ text: 'Benvolguda fam\u00edlia,', bold: true, size: 22, color: '111111', before: 280, after: 80 }),
      wPara({ text: 'Els presentem els resultats que el seu fill/a ha obtingut de les proves de compet\u00e8ncia b\u00e0sica de 4t d\u2019ESO. Aquests resultats s\u2019incorporaran al conjunt d\u2019informaci\u00f3 de l\u2019alumne/a i es tindran en compte en l\u2019avaluaci\u00f3 final, tot i que no seran determinants per a l\u2019obtenci\u00f3 del t\u00edtol de graduat en educaci\u00f3 secund\u00e0ria obligat\u00f2ria.',
              size: 22, color: '333333', before: 0, after: 280 }),
      wPara({ text: `Alumne/a: ${r.name}`, bold: true, size: 32, color: '111111', before: 0, after: 480 }),
      wPara({ text: 'COMPET\u00c8NCIA CIENT\u00cdFICO-TECNOL\u00d2GICA',
              bold: true, size: 21, fill: '7A3090', color: 'FFFFFF', before: 80, after: 80 }),
      wPara({ text: synthesisCien(grade.code), size: 26, color: '333333',
              align: 'left', before: 160, after: 240 }),
      wPercentChart(pct),
      wPara({ text: '', before: 240, after: 0 }),
      wCienDcTable(dcScores),
      hasNaDc
        ? wPara({ text: '* No s\u2019assoleix el descriptor competencial i cal refor\u00e7ar-lo.',
                  size: 18, color: 'C0392B', italic: true, before: 120, after: 0 })
        : '',
    ].join('\n');
  }

    function buildSimplePage(r, grade, pct) {
    return [
      wPara({ text: r.name, bold: true, size: 52, color: '1a1a1a',
              align: 'center', before: 3600, after: 480 }),
      wPara({ text: '', before: 0, after: 560 }),
      wPara({ text: grade.code, bold: true, size: 144, color: grade.color,
              align: 'center', before: 0, after: 280 }),
      wPara({ text: grade.full, size: 44, color: grade.color,
              align: 'center', before: 0, after: 560 }),
      wPara({ text: `${r.total}/${Q}\u00a0\u00a0(${pct}%)`, size: 28, color: 'aaaaaa',
              align: 'center', before: 200, after: 0 }),
    ].join('\n');
  }

  // ── Build document body ──────────────────────────────────────────────
  let body = '';
  rows.forEach((r, i) => {
    const pct   = Math.round(r.total / Q * 100);
    const grade = getGrade(pct);

    body += currentCompetencyId === 'mat'
      ? buildMatPage(r, grade, pct)
      : currentCompetencyId === 'cat'
        ? buildCatPage(r, grade, pct)
        : currentCompetencyId === 'ct'
          ? buildCienPage(r, grade, pct)
          : buildSimplePage(r, grade, pct);

    if (i < rows.length - 1)
      body += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  });

  // ── Assemble DOCX ────────────────────────────────────────────────────
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', wordRels);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE'
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = currentCompetencyId + '_informes_cb4eso.docx'; a.click();
  URL.revokeObjectURL(url);
}
