// ═══════════════════════════════════════════════════════════════════════
// js/utils.js — Shared utility helpers.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Escapes a string for safe insertion into HTML attribute values or content.
 */
export function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
