import { useEffect, useRef } from 'react';
import katex from 'katex';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import { renderOmmlInText } from '@/lib/ommlUtils';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * 📐 MATH TEXT RENDERER
 * 
 * Matematik formulalarni to'g'ri render qiladi:
 * - LaTeX: $x^2 + y^2 = z^2$
 * - Inline: $\frac{a}{b}$
 * - Block: $$\int_0^\infty e^{-x^2} dx$$
 */
export default function MathText({ text, className = '' }: MathTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current || !text) return;

    try {
      containerRef.current.innerHTML = '';

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

      // Extract formulas from HTML tags
      cleanedText = cleanedText.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, '$$$1$$');
      cleanedText = cleanedText.replace(/<[^>]+>/g, '');
      cleanedText = cleanedText.trim();

      // Normalize format
      let normalizedText = cleanedText;
      normalizedText = normalizedText.replace(/\\\((.*?)\\\)/g, '$$$1$$');
      normalizedText = normalizedText.replace(/\\\[(.*?)\\\]/g, '$$$$$1$$$$');

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
            // Start of formula
            if (i > currentPos) {
              parts.push(normalizedText.substring(currentPos, i));
            }
            
            // Check if block formula ($$)
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
            // End of formula
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
      
      // Add remaining text
      if (currentPos < normalizedText.length) {
        parts.push(normalizedText.substring(currentPos));
      }
      
      parts.forEach((part) => {
        if (!part) return;

        if (part.startsWith('$$') && part.endsWith('$$')) {
          // Block formula
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
            console.error('❌ [MATH] Error rendering block formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else if (part.startsWith('$') && part.endsWith('$')) {
          // Inline formula
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
            console.error('❌ [MATH] Error rendering inline formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else {
          // Plain text
          const textNode = document.createTextNode(part);
          container.appendChild(textNode);
        }
      });
    } catch (error) {
      console.error('❌ [MATH] Fatal error:', error);
      if (containerRef.current) {
        containerRef.current.textContent = text;
      }
    }
  }, [text]);

  if (!text) return null;

  return <span ref={containerRef} className={className}></span>;
}
