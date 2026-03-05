import { useMemo, memo } from 'react';
import katex from 'katex';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import { renderOmmlInText } from '@/lib/ommlUtils';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  text: string;
  className?: string;
}

// Quick check if text has any math markers
function hasMathMarkers(text: string): boolean {
  return text.includes('$') || text.includes('\\(') || text.includes('\\[') ||
         text.includes('<omml>') || text.includes('<math') || text.includes('data-latex') ||
         /[A-Za-z0-9)]\^/.test(text) || /[A-Za-z)]\d*_\d/.test(text);
}

// Escape HTML special chars for safe dangerouslySetInnerHTML
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Parse text with math markers and return HTML string with KaTeX rendered formulas.
 * Uses katex.renderToString instead of DOM manipulation for better performance.
 */
function renderMathToHtml(text: string): string {
  let cleanedText = text;

  // Step 1: Convert OMML to MathML
  if (cleanedText.includes('<omml>')) {
    cleanedText = renderOmmlInText(cleanedText);
  }

  // Step 2: Convert MathML to LaTeX
  if (hasMathML(cleanedText)) {
    cleanedText = convertMathMLToLatex(cleanedText);
  }

  // Step 3: Clean HTML
  cleanedText = cleanedText.replace(/<p>/gi, '');
  cleanedText = cleanedText.replace(/<\/p>/gi, '\n');
  cleanedText = cleanedText.replace(/<br\s*\/?>/gi, '\n');

  // Fix double backslashes
  cleanedText = cleanedText.replace(/\\\\+\(/g, '\\(');
  cleanedText = cleanedText.replace(/\\\\+\)/g, '\\)');
  cleanedText = cleanedText.replace(/\\\\+\[/g, '\\[');
  cleanedText = cleanedText.replace(/\\\\+\]/g, '\\]');

  // Remove empty formulas
  cleanedText = cleanedText.replace(/<span[^>]*data-type="formula"[^>]*data-latex=""[^>]*><\/span>/g, '');
  cleanedText = cleanedText.replace(/<span[^>]*data-latex=""[^>]*data-type="formula"[^>]*><\/span>/g, '');

  // Extract formulas from HTML tags, decode entities and detect display mode
  cleanedText = cleanedText.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, (_: string, latex: string) => {
    let decoded = latex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    // Strip any existing $ delimiters from data-latex to prevent $$...$$ display mode
    while (decoded.startsWith('$$') && decoded.endsWith('$$') && decoded.length > 4) decoded = decoded.slice(2, -2).trim();
    while (decoded.startsWith('$') && decoded.endsWith('$') && decoded.length > 2) decoded = decoded.slice(1, -1).trim();
    if (/\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(decoded)) {
      return '$$' + decoded + '$$';
    }
    return '$' + decoded + '$';
  });
  cleanedText = cleanedText.replace(/<[^>]+>/g, '');
  // Strip pandoc underline markers: [text]{.underline} → text
  cleanedText = cleanedText.replace(/\[([^\]]+)\]\{\.underline\}/g, '$1');
  // Unescape HTML entities (TipTap escapes & inside formulas)
  cleanedText = cleanedText.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  cleanedText = cleanedText.trim();

  // Find all existing formula-delimited regions BEFORE auto-wrap
  // This prevents auto-wrap from double-wrapping formulas inside \(...\) or $...$
  const formulaRegions: Array<{start: number; end: number}> = [];
  {
    const delimRe = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]*?\$/g;
    let dm;
    while ((dm = delimRe.exec(cleanedText)) !== null) {
      formulaRegions.push({ start: dm.index, end: dm.index + dm[0].length });
    }
  }
  const isInsideFormula = (s: number, e: number) =>
    formulaRegions.some(f => s >= f.start && e <= f.end);

  // Auto-wrap bare superscript/subscript patterns in $..$ for KaTeX
  // E^+ → $E^{+}$, Cr^{+2} → $Cr^{+2}$, H_2O → $H_2O$
  cleanedText = cleanedText.replace(/([A-Za-z0-9)_])\^(\d+[+-])/g, (match, p1, p2, offset) => {
    if (isInsideFormula(offset, offset + match.length)) return match;
    return p1 + '^{' + p2 + '}';
  });
  cleanedText = cleanedText.replace(/([A-Za-z0-9)_])\^([+-]\d+)/g, (match, p1, p2, offset) => {
    if (isInsideFormula(offset, offset + match.length)) return match;
    return p1 + '^{' + p2 + '}';
  });
  cleanedText = cleanedText.replace(/([A-Za-z0-9)_])\^([+-])(?![0-9{])/g, (match, p1, p2, offset) => {
    if (isInsideFormula(offset, offset + match.length)) return match;
    return p1 + '^{' + p2 + '}';
  });
  {
    const wrapped: Array<{start: number; end: number; formula: string}> = [];
    // Formulas with subscript: H_2O, CO_2, H_2SO_4
    const subPattern = /((?:[A-Z][A-Za-z0-9]*_\d+)+(?:\^(?:\{[^}]+\}|\d+))?)/g;
    let m;
    while ((m = subPattern.exec(cleanedText)) !== null) {
      if (!isInsideFormula(m.index, m.index + m[0].length)) {
        wrapped.push({ start: m.index, end: m.index + m[0].length, formula: m[0] });
      }
    }
    // Element with charge: E^{+}, Cr^{+2}, Fe^{3+}, O^{2-}
    const chargePattern = /([A-Z][a-z]?\^(?:\{[^}]+\}|\d+[+-]|[+-]\d+|[+-]))/g;
    while ((m = chargePattern.exec(cleanedText)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (!isInsideFormula(s, e) && !wrapped.some(w => s >= w.start && e <= w.end)) {
        wrapped.push({ start: s, end: e, formula: m[0] });
      }
    }
    // Number superscript: 10^{23}
    const supPattern = /(\d+)\^(\d+|\{[^}]+\})/g;
    while ((m = supPattern.exec(cleanedText)) !== null) {
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
        if (w.start > lastEnd) result += cleanedText.substring(lastEnd, w.start);
        result += '$' + w.formula + '$';
        lastEnd = w.end;
      });
      if (lastEnd < cleanedText.length) result += cleanedText.substring(lastEnd);
      cleanedText = result;
    }
  }

  // Normalize format
  let normalizedText = cleanedText;
  // Convert \(...\) to $ or $$ based on content (multi-line environments → display mode)
  normalizedText = normalizedText.replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => {
    // Strip any existing $ delimiters to prevent \($SO_3$\) → $$SO_3$$ (display mode)
    let clean = formula.trim();
    while (clean.startsWith('$$') && clean.endsWith('$$') && clean.length > 4) clean = clean.slice(2, -2).trim();
    while (clean.startsWith('$') && clean.endsWith('$') && clean.length > 2) clean = clean.slice(1, -1).trim();
    if (/\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(clean)) {
      return '$$' + clean + '$$';
    }
    return '$' + clean + '$';
  });
  normalizedText = normalizedText.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

  // Split by formulas
  const parts: string[] = [];
  let currentPos = 0;
  let inFormula = false;
  let formulaStart = -1;
  let isBlockFormula = false;

  for (let i = 0; i < normalizedText.length; i++) {
    if (normalizedText[i] === '$') {
      if (!inFormula) {
        if (i > currentPos) {
          parts.push(normalizedText.substring(currentPos, i));
        }
        if (i + 1 < normalizedText.length && normalizedText[i + 1] === '$') {
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
          if (i + 1 < normalizedText.length && normalizedText[i + 1] === '$') {
            const formula = normalizedText.substring(formulaStart, i);
            parts.push('$$' + formula + '$$');
            i++;
            currentPos = i + 1;
            inFormula = false;
          }
        } else {
          const formula = normalizedText.substring(formulaStart, i);
          parts.push('$' + formula + '$');
          currentPos = i + 1;
          inFormula = false;
        }
      }
    }
  }

  if (currentPos < normalizedText.length) {
    parts.push(normalizedText.substring(currentPos));
  }

  // Build HTML string
  let html = '';
  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('$$') && part.endsWith('$$')) {
      const math = part.slice(2, -2).trim();
      try {
        html += `<span class="katex-block">${katex.renderToString(math, {
          displayMode: true, throwOnError: false, errorColor: '#cc0000', strict: false
        })}</span>`;
      } catch {
        html += `<span class="text-red-500">${escapeHtml(part)}</span>`;
      }
    } else if (part.startsWith('$') && part.endsWith('$')) {
      const math = part.slice(1, -1).trim();
      // Multi-line environments should render in display mode even from inline $...$
      const needsDisplay = /\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(math);
      try {
        html += `<span class="${needsDisplay ? 'katex-block' : 'katex-inline'}">${katex.renderToString(math, {
          displayMode: needsDisplay, throwOnError: false, errorColor: '#cc0000', strict: false
        })}</span>`;
      } catch {
        html += `<span class="text-red-500">${escapeHtml(part)}</span>`;
      }
    } else {
      html += escapeHtml(part);
    }
  }

  return html;
}

function MathText({ text, className = '' }: MathTextProps) {
  // Fast path: no math markers — render plain text
  if (!text) return null;
  if (!hasMathMarkers(text)) {
    // Strip simple HTML tags and decode HTML entities
    let clean = text.replace(/<\/?(?:p|br|div)(?:\s[^>]*)?>/gi, '').trim();
    clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return <span className={className}>{clean}</span>;
  }

  // useMemo: only re-render when text changes (replaces useEffect + ref approach)
  const html = useMemo(() => {
    try {
      return renderMathToHtml(text);
    } catch {
      return escapeHtml(text);
    }
  }, [text]);

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default memo(MathText);
