import { useMemo, memo } from 'react';
import katex from 'katex';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import { renderOmmlInText } from '@/lib/ommlUtils';
import 'katex/dist/katex.min.css';

interface ChemistryTextProps {
  text: string;
  className?: string;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render chemistry text with KaTeX formulas.
 * Handles: chemical formulas (H_2O), charges (Fe^{3+}), isotopes (^{14}N),
 * electron configs (3d^8), Pandoc subscript/superscript (~2~, ^14^).
 */
function renderChemistryToHtml(text: string): string {
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

  // Extract data-latex from HTML tags (function replacement to avoid $$ escaping)
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

  // Chemistry-specific: Pandoc subscript/superscript
  // ~2~ → _2, ^23^ → ^{23}
  cleaned = cleaned.replace(/([A-Za-z0-9()])\s*~([^~\s]+)~/g, '$1_$2');
  cleaned = cleaned.replace(/(^|\s|[.)*])~([^~\s]+)~/gm, (_, pre, content) => {
    return content.length > 1 ? `${pre}_{${content}}` : `${pre}_${content}`;
  });
  cleaned = cleaned.replace(/([A-Za-z0-9])\^([^^\s]+)\^/g, (_, pre, content) => {
    return content.length > 1 ? `${pre}^{${content}}` : `${pre}^${content}`;
  });

  // Charge notation: CrO_4^2- → CrO_4^{2-}
  cleaned = cleaned.replace(/([A-Za-z0-9)_])\^(\d+[+-])/g, '$1^{$2}');
  cleaned = cleaned.replace(/([A-Za-z0-9)_])\^([+-]\d+)/g, '$1^{$2}');
  cleaned = cleaned.replace(/([A-Za-z0-9)_])\^([+-])(?![0-9{])/g, '$1^{$2}');

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

  // Auto-wrap chemistry formulas in $...$
  {
    const wrapped: Array<{ start: number; end: number; formula: string }> = [];
    let m;

    // Complex: X_3(PO_4)_2
    const complexPattern = /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g;
    while ((m = complexPattern.exec(cleaned)) !== null) {
      if (!isInsideFormula(m.index, m.index + m[0].length)) {
        wrapped.push({ start: m.index, end: m.index + m[0].length, formula: m[0] });
      }
    }

    // Simple subscript: CH_4, H_2SO_4, v_0
    const simplePattern = /((?:[A-Z][A-Za-z0-9]*_(?:\{[^}]+\}|\d+))+(?:\^(?:\{[^}]+\}|\d+))?)/g;
    while ((m = simplePattern.exec(cleaned)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (!isInsideFormula(s, e) && !wrapped.some(w => s >= w.start && e <= w.end)) {
        wrapped.push({ start: s, end: e, formula: m[0] });
      }
    }

    // Element with charge: Cr^{+2}, Fe^{3+}, O^{2-}
    const chargePattern = /([A-Z][a-z]?\^(?:\{[^}]+\}|\d+[+-]|[+-]\d+|[+-]))/g;
    while ((m = chargePattern.exec(cleaned)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (!isInsideFormula(s, e) && !wrapped.some(w => s >= w.start && e <= w.end)) {
        wrapped.push({ start: s, end: e, formula: m[0] });
      }
    }

    // Number superscript: 10^{23}
    const supPattern = /(\d+)\^(\d+|\{[^}]+\})/g;
    while ((m = supPattern.exec(cleaned)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (!isInsideFormula(s, e) && !wrapped.some(w => s >= w.start && e <= w.end)) {
        wrapped.push({ start: s, end: e, formula: m[0] });
      }
    }

    // Isotope: ^{14}N, _{19}K^{39}
    const isotopePattern = /(?:_(?:\{[^}]+\}|\d+))?\^(?:\{[^}]+\}|\d+)[A-Z][a-z]?/g;
    while ((m = isotopePattern.exec(cleaned)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (!isInsideFormula(s, e) && !wrapped.some(w => s >= w.start && e <= w.end)) {
        wrapped.push({ start: s, end: e, formula: m[0] });
      }
    }

    // LaTeX commands in plain text: \cdot
    const latexCmdPattern = /(\\cdot)/g;
    while ((m = latexCmdPattern.exec(cleaned)) !== null) {
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

  // Normalize \(...\) → $...$ and \[...\] → $$...$$ (function replacement)
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
      const math = part.slice(2, -2).trim();
      try {
        html += `<span class="katex-block">${katex.renderToString(math, { displayMode: true, throwOnError: false, errorColor: '#cc0000', strict: false })}</span>`;
      } catch {
        html += `<span class="text-red-500">${escapeHtml(part)}</span>`;
      }
    } else if (part.startsWith('$') && part.endsWith('$')) {
      const math = part.slice(1, -1).trim();
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

function ChemistryText({ text, className = '' }: ChemistryTextProps) {
  if (!text) return null;

  const html = useMemo(() => {
    try {
      return renderChemistryToHtml(text);
    } catch {
      return escapeHtml(text);
    }
  }, [text]);

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default memo(ChemistryText);
