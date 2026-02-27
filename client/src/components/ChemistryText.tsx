import { useEffect, useRef } from 'react';
import katex from 'katex';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import { renderOmmlInText } from '@/lib/ommlUtils';
import 'katex/dist/katex.min.css';

interface ChemistryTextProps {
  text: string;
  className?: string;
}

/**
 * 🧪 CHEMISTRY TEXT RENDERER
 * 
 * Kimyo matnlarini to'g'ri render qiladi:
 * - Kimyoviy formulalar (H₂O, NaCl, H₂SO₄)
 * - Pandoc format: ~2~ → _2, ^23^ → ^{23}
 * - Subscript/Superscript
 */
export default function ChemistryText({ text, className = '' }: ChemistryTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current || !text) return;

    try {
      containerRef.current.innerHTML = '';

      // Debug logs (commented out for performance)
      // console.log('🧪 [CHEMISTRY] ===== START RENDERING =====');
      // console.log('🧪 [CHEMISTRY] Original text:', text.substring(0, 200));

      let cleanedText = text;
      
      // Step 1: Convert OMML to MathML
      if (cleanedText.includes('<omml>')) {
        // console.log('🔄 [OMML] Converting OMML to MathML...');
        cleanedText = renderOmmlInText(cleanedText);
      }
      
      // Step 2: Convert MathML to LaTeX
      if (hasMathML(cleanedText)) {
        // console.log('🔄 [MathML] Converting MathML to LaTeX...');
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
      
      // console.log('🧪 [CHEMISTRY] After HTML cleanup:', cleanedText.substring(0, 200));
      
      // Remove empty formulas
      cleanedText = cleanedText.replace(/<span[^>]*data-type="formula"[^>]*data-latex=""[^>]*><\/span>/g, '');
      cleanedText = cleanedText.replace(/<span[^>]*data-latex=""[^>]*data-type="formula"[^>]*><\/span>/g, '');

      // Extract formulas from HTML tags
      cleanedText = cleanedText.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, '$$$1$$');
      cleanedText = cleanedText.replace(/<[^>]+>/g, '');
      cleanedText = cleanedText.trim();
      
      // 🧪 CHEMISTRY: Convert Pandoc subscript/superscript AFTER HTML cleanup
      // ~2~ → _2 (subscript)
      // ^23^ → ^{23} (superscript)
      // (P)~2~ → (P)_2
      // X~3~(PO~4~)~2~ → X_3(PO_4)_2
      cleanedText = cleanedText.replace(/([A-Za-z0-9\(\)])~([^~\s]+)~/g, '$1_$2');
      cleanedText = cleanedText.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');

      // 🧪 CHEMISTRY: Add braces to bare charge superscripts
      // CrO_4^2- → CrO_4^{2-}, S^4+ → S^{4+}, Cr^+2 → Cr^{+2}
      cleanedText = cleanedText.replace(/([A-Za-z0-9\)_])\^(\d+[+-])/g, '$1^{$2}');
      cleanedText = cleanedText.replace(/([A-Za-z0-9\)_])\^([+-]\d+)/g, '$1^{$2}');
      
      // console.log('🧪 [CHEMISTRY] After Pandoc conversion:', cleanedText.substring(0, 200));
      
      // 🧪 AUTO-WRAP FORMULAS: Wrap chemistry formulas in $...$ for KaTeX
      // Use manual parsing to avoid regex replacement issues with $
      
      let processedText = cleanedText;
      const wrapped: Array<{start: number; end: number; formula: string}> = [];
      
      // Step 1: Find complex formulas: X_3(PO_4)_2
      const complexPattern = /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g;
      let match;
      while ((match = complexPattern.exec(cleanedText)) !== null) {
        wrapped.push({
          start: match.index,
          end: match.index + match[0].length,
          formula: match[0]
        });
      }
      
      // Step 2: Find simple formulas with optional charge: CH_4, CrO_4^{2-}, H_2SO_4
      const simplePattern = /((?:[A-Z][A-Za-z0-9]*_\d+)+(?:\^(?:\{[^}]+\}|\d+))?)/g;
      while ((match = simplePattern.exec(cleanedText)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        
        // Check if already wrapped
        const isWrapped = wrapped.some(w => start >= w.start && end <= w.end);
        if (!isWrapped) {
          wrapped.push({ start, end, formula: match[0] });
        }
      }
      
      // Step 2.5: Find element with charge (no subscript): Cr^{+2}, Fe^{3+}, O^{2-}
      const chargePattern = /([A-Z][a-z]?\^(?:\{[^}]+\}|\d+[+-]|[+-]\d+))/g;
      while ((match = chargePattern.exec(cleanedText)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        const isWrapped = wrapped.some(w => start >= w.start && end <= w.end);
        if (!isWrapped) {
          wrapped.push({ start, end, formula: match[0] });
        }
      }

      // Step 3: Find superscripts: 10^{23}
      const superPattern = /(\d+)\^(\d+|{[^}]+})/g;
      while ((match = superPattern.exec(cleanedText)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        const isWrapped = wrapped.some(w => start >= w.start && end <= w.end);
        if (!isWrapped) {
          wrapped.push({ start, end, formula: match[0] });
        }
      }

      // Step 3.5: Isotope mass number: ^{14}N, ^{14}O, _{19}K^{39}
      const isotopePattern = /(?:_(?:\{[^}]+\}|\d+))?\^(?:\{[^}]+\}|\d+)[A-Z][a-z]?/g;
      while ((match = isotopePattern.exec(cleanedText)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        const isWrapped = wrapped.some(w => start >= w.start && end <= w.end);
        if (!isWrapped) {
          wrapped.push({ start, end, formula: match[0] });
        }
      }

      // Step 4: Find LaTeX commands: \cdot
      const latexPattern = /(\\cdot)/g;
      while ((match = latexPattern.exec(cleanedText)) !== null) {
        wrapped.push({
          start: match.index,
          end: match.index + match[0].length,
          formula: match[0]
        });
      }
      
      // Sort by position
      wrapped.sort((a, b) => a.start - b.start);
      
      // Build result with $ wrapping
      if (wrapped.length > 0) {
        let result = '';
        let lastEnd = 0;
        
        wrapped.forEach(w => {
          // Add text before formula
          if (w.start > lastEnd) {
            result += cleanedText.substring(lastEnd, w.start);
          }
          // Add wrapped formula
          result += '$' + w.formula + '$';
          lastEnd = w.end;
        });
        
        // Add remaining text
        if (lastEnd < cleanedText.length) {
          result += cleanedText.substring(lastEnd);
        }
        
        processedText = result;
      }
      
      cleanedText = processedText;
      // console.log('🧪 [CHEMISTRY] After auto-wrap:', cleanedText.substring(0, 200));

      // Normalize format
      let normalizedText = cleanedText;
      normalizedText = normalizedText.replace(/\\\((.*?)\\\)/g, '$$$1$$');
      normalizedText = normalizedText.replace(/\\\[(.*?)\\\]/g, '$$$1$$');
      
      console.log('🧪 [CHEMISTRY] After normalization:', normalizedText.substring(0, 200));
      console.log('🧪 [CHEMISTRY] Has $ signs:', normalizedText.includes('$'));
      
      // Render with KaTeX
      const container = containerRef.current;
      
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
      
      console.log('🧪 [CHEMISTRY] Split into', parts.length, 'parts');

      parts.forEach((part) => {
        if (!part) return;

        if (part.startsWith('$$') && part.endsWith('$$')) {
          const math = part.slice(2, -2).trim();
          const span = document.createElement('span');
          span.className = 'katex-block';
          try {
            katex.render(math, span, {
              displayMode: true,
              throwOnError: false,
              errorColor: '#cc0000',
              strict: false
            });
          } catch (e) {
            console.error('❌ [CHEMISTRY] Error rendering block formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else if (part.startsWith('$') && part.endsWith('$')) {
          const math = part.slice(1, -1).trim();
          const span = document.createElement('span');
          span.className = 'katex-inline';
          try {
            katex.render(math, span, {
              displayMode: false,
              throwOnError: false,
              errorColor: '#cc0000',
              strict: false
            });
          } catch (e) {
            console.error('❌ [CHEMISTRY] Error rendering inline formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else {
          const textNode = document.createTextNode(part);
          container.appendChild(textNode);
        }
      });

      console.log('✅ [CHEMISTRY] ===== RENDERING COMPLETE =====');
    } catch (error) {
      console.error('❌ [CHEMISTRY] Fatal error:', error);
      if (containerRef.current) {
        containerRef.current.textContent = text;
      }
    }
  }, [text]);

  if (!text) return null;

  return <span ref={containerRef} className={className}></span>;
}
