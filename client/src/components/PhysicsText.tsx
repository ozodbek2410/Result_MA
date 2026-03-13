import { useMemo, memo } from 'react';
import katex from 'katex';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import { renderOmmlInText } from '@/lib/ommlUtils';
import 'katex/dist/katex.min.css';

interface PhysicsTextProps {
  text: string;
  className?: string;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render physics text with KaTeX formulas.
 * Uses MathText-compatible approach (useMemo + dangerouslySetInnerHTML).
 */
function renderPhysicsToHtml(text: string): string {
  let cleaned = text;

  // OMML → MathML → LaTeX
  if (cleaned.includes('<omml>')) cleaned = renderOmmlInText(cleaned);
  if (hasMathML(cleaned)) cleaned = convertMathMLToLatex(cleaned);

  // Clean HTML
  cleaned = cleaned.replace(/<p>/gi, '').replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/\\\\+\(/g, '\\(').replace(/\\\\+\)/g, '\\)');
  cleaned = cleaned.replace(/\\\\+\[/g, '\\[').replace(/\\\\+\]/g, '\\]');

  // Remove empty formulas
  cleaned = cleaned.replace(/<span[^>]*data-type="formula"[^>]*data-latex=""[^>]*><\/span>/g, '');
  cleaned = cleaned.replace(/<span[^>]*data-latex=""[^>]*data-type="formula"[^>]*><\/span>/g, '');

  // Extract data-latex from HTML tags (function replacement to avoid $$ escaping bug)
  cleaned = cleaned.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, (_: string, latex: string) => {
    let decoded = latex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    while (decoded.startsWith('$$') && decoded.endsWith('$$') && decoded.length > 4) decoded = decoded.slice(2, -2).trim();
    while (decoded.startsWith('$') && decoded.endsWith('$') && decoded.length > 2) decoded = decoded.slice(1, -1).trim();
    if (/\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(decoded)) {
      return '$$' + decoded + '$$';
    }
    return '$' + decoded + '$';
  });
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/\[([^\]]+)\]\{\.underline\}/g, '$1');
  cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  cleaned = cleaned.trim();

  // Find existing formula regions to prevent double-wrapping
  const formulaRegions: Array<{ start: number; end: number }> = [];
  {
    const delimRe = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]*?\$/g;
    let dm;
    while ((dm = delimRe.exec(cleaned)) !== null) {
      formulaRegions.push({ start: dm.index, end: dm.index + dm[0].length });
    }
  }
  const isInsideFormula = (s: number, e: number) =>
    formulaRegions.some(f => s >= f.start && e <= f.end);

  // Auto-wrap bare superscript/subscript (physics-specific + general)
  // Charge notation: E^+, Cr^{+2}, Fe^{3+}
  cleaned = cleaned.replace(/([A-Za-z0-9)_])\^(\d+[+-])/g, (match, p1, p2, offset) => {
    if (isInsideFormula(offset, offset + match.length)) return match;
    return p1 + '^{' + p2 + '}';
  });
  cleaned = cleaned.replace(/([A-Za-z0-9)_])\^([+-]\d+)/g, (match, p1, p2, offset) => {
    if (isInsideFormula(offset, offset + match.length)) return match;
    return p1 + '^{' + p2 + '}';
  });
  cleaned = cleaned.replace(/([A-Za-z0-9)_])\^([+-])(?![0-9{])/g, (match, p1, p2, offset) => {
    if (isInsideFormula(offset, offset + match.length)) return match;
    return p1 + '^{' + p2 + '}';
  });

  // Auto-wrap: subscript formulas, charge, superscripts
  {
    const wrapped: Array<{ start: number; end: number; formula: string }> = [];
    let m;
    // Subscript formulas: H_2O, CO_2, v_0
    const subPattern = /((?:[A-Za-z][A-Za-z0-9]*_(?:\{[^}]+\}|\d+))+(?:\^(?:\{[^}]+\}|\d+))?)/g;
    while ((m = subPattern.exec(cleaned)) !== null) {
      if (!isInsideFormula(m.index, m.index + m[0].length)) {
        wrapped.push({ start: m.index, end: m.index + m[0].length, formula: m[0] });
      }
    }
    // Element with charge: Fe^{3+}, O^{2-}
    const chargePattern = /([A-Z][a-z]?\^(?:\{[^}]+\}|\d+[+-]|[+-]\d+|[+-]))/g;
    while ((m = chargePattern.exec(cleaned)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (!isInsideFormula(s, e) && !wrapped.some(w => s >= w.start && e <= w.end)) {
        wrapped.push({ start: s, end: e, formula: m[0] });
      }
    }
    // Number superscript: 10^{23}, 2^8
    const supPattern = /(\d+)\^(\d+|\{[^}]+\})/g;
    while ((m = supPattern.exec(cleaned)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (!isInsideFormula(s, e) && !wrapped.some(w => s >= w.start && e <= w.end)) {
        wrapped.push({ start: s, end: e, formula: m[0] });
      }
    }
    if (wrapped.length > 0) {
      wrapped.sort((a, b) => a.start - b.start);
      let result = '';
      let lastEnd = 0;
      wrapped.forEach(w => {
        if (w.start > lastEnd) result += cleaned.substring(lastEnd, w.start);
        result += '$' + w.formula + '$';
        lastEnd = w.end;
      });
      if (lastEnd < cleaned.length) result += cleaned.substring(lastEnd);
      cleaned = result;
    }
  }

  // Normalize \(...\) → $...$ and \[...\] → $$...$$
  let normalized = cleaned;
  normalized = normalized.replace(/\\\(([\s\S]*?)\\\)/g, (_match: string, formula: string) => {
    let clean = formula.trim();
    while (clean.startsWith('$$') && clean.endsWith('$$') && clean.length > 4) clean = clean.slice(2, -2).trim();
    while (clean.startsWith('$') && clean.endsWith('$') && clean.length > 2) clean = clean.slice(1, -1).trim();
    if (/\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(clean)) {
      return '$$' + clean + '$$';
    }
    return '$' + clean + '$';
  });
  normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, (_match: string, formula: string) => {
    return '$$' + formula.trim() + '$$';
  });

  // Split by $ delimiters and render KaTeX
  const parts: string[] = [];
  let currentPos = 0;
  let inFormula = false;
  let formulaStart = -1;
  let isBlockFormula = false;

  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '$') {
      if (!inFormula) {
        if (i > currentPos) parts.push(normalized.substring(currentPos, i));
        if (i + 1 < normalized.length && normalized[i + 1] === '$') {
          isBlockFormula = true;
          formulaStart = i + 2;
          i++;
        } else {
          isBlockFormula = false;
          formulaStart = i + 1;
        }
        inFormula = true;
      } else {
        if (isBlockFormula) {
          if (i + 1 < normalized.length && normalized[i + 1] === '$') {
            parts.push('$$' + normalized.substring(formulaStart, i) + '$$');
            i++;
            currentPos = i + 1;
            inFormula = false;
          }
        } else {
          parts.push('$' + normalized.substring(formulaStart, i) + '$');
          currentPos = i + 1;
          inFormula = false;
        }
      }
    }
  }
  if (currentPos < normalized.length) parts.push(normalized.substring(currentPos));

  // Build HTML
  let html = '';
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('$$') && part.endsWith('$$')) {
      let math = part.slice(2, -2).trim();
      math = math.replace(/([a-zA-Z0-9])_(?!\{)([a-zA-Z0-9])/g, '$1_{$2}');
      math = math.replace(/([a-zA-Z0-9])\^(?!\{)([a-zA-Z0-9])/g, '$1^{$2}');
      try {
        html += `<span class="katex-block">${katex.renderToString(math, { displayMode: true, throwOnError: false, errorColor: '#cc0000', strict: false })}</span>`;
      } catch {
        html += `<span class="text-red-500">${escapeHtml(part)}</span>`;
      }
    } else if (part.startsWith('$') && part.endsWith('$')) {
      let math = part.slice(1, -1).trim();
      math = math.replace(/([a-zA-Z0-9])_(?!\{)([a-zA-Z0-9])/g, '$1_{$2}');
      math = math.replace(/([a-zA-Z0-9])\^(?!\{)([a-zA-Z0-9])/g, '$1^{$2}');
      const needsDisplay = /\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(math);
      try {
        html += `<span class="${needsDisplay ? 'katex-block' : 'katex-inline'}">${katex.renderToString(math, { displayMode: needsDisplay, throwOnError: false, errorColor: '#cc0000', strict: false })}</span>`;
      } catch {
        html += `<span class="text-red-500">${escapeHtml(part)}</span>`;
      }
    } else {
      html += escapeHtml(part);
    }
  }
  return html;
}

function PhysicsText({ text, className = '' }: PhysicsTextProps) {
  if (!text) return null;

  const html = useMemo(() => {
    try {
      return renderPhysicsToHtml(text);
    } catch {
      return escapeHtml(text);
    }
  }, [text]);

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default memo(PhysicsText);
