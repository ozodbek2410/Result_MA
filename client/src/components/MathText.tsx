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
         text.includes('<omml>') || text.includes('<math') || text.includes('data-latex');
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
    const decoded = latex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
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

  // Normalize format
  let normalizedText = cleanedText;
  // Convert \(...\) to $ or $$ based on content (multi-line environments → display mode)
  normalizedText = normalizedText.replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => {
    if (/\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(formula)) {
      return '$$' + formula + '$$';
    }
    return '$' + formula + '$';
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
