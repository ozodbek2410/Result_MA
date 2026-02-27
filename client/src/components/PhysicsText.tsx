import { useEffect, useRef } from 'react';
import katex from 'katex';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import { renderOmmlInText } from '@/lib/ommlUtils';
import 'katex/dist/katex.min.css';

interface PhysicsTextProps {
  text: string;
  className?: string;
}

/**
 * PhysicsText - Fizika matnlarini ko'rsatish uchun
 * 
 * Qo'llab-quvvatlaydi:
 * - LaTeX formulalar (\(...\), \[...\])
 * - Inline LaTeX (v_0, E^2, F = ma)
 * - Fizik birliklar (m/s, kg, N, J)
 * - Maxsus belgilar (\times, \div, \approx, \to)
 */
export default function PhysicsText({ text, className = '' }: PhysicsTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  console.log('⚡ [PHYSICSTEXT] Component rendered with text:', text?.substring(0, 100));

  useEffect(() => {
    if (!containerRef.current || !text) return;

    try {
      containerRef.current.innerHTML = '';

      console.log('🔍 [PHYSICSTEXT] ===== START RENDERING =====');
      console.log('🔍 [PHYSICSTEXT] Original text:', text.substring(0, 200));

      let cleanedText = text;
      
      // Step 1: Convert OMML to MathML
      if (cleanedText.includes('<omml>')) {
        console.log('🔄 [OMML] Converting OMML to MathML...');
        cleanedText = renderOmmlInText(cleanedText);
      }
      
      // Step 2: Convert MathML to LaTeX
      if (hasMathML(cleanedText)) {
        console.log('🔄 [MathML] Converting MathML to LaTeX...');
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
      
      console.log('🔍 [PHYSICSTEXT] After HTML cleanup:', cleanedText.substring(0, 200));
      
      // Remove empty formulas
      cleanedText = cleanedText.replace(/<span[^>]*data-type="formula"[^>]*data-latex=""[^>]*><\/span>/g, '');
      cleanedText = cleanedText.replace(/<span[^>]*data-latex=""[^>]*data-type="formula"[^>]*><\/span>/g, '');

      // Extract formulas from HTML tags
      cleanedText = cleanedText.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, '$$$$1$$$$');
      cleanedText = cleanedText.replace(/<[^>]+>/g, '');
      cleanedText = cleanedText.trim();

      // Normalize format: convert \(...\) to $...$
      let normalizedText = cleanedText;
      normalizedText = normalizedText.replace(/\\\((.*?)\\\)/g, '$$$$1$$$$');
      normalizedText = normalizedText.replace(/\\\[(.*?)\\\]/g, '$$$$1$$$$');

      console.log('🔍 [PHYSICSTEXT] After normalization:', normalizedText.substring(0, 200));
      console.log('🔍 [PHYSICSTEXT] Has $ signs:', normalizedText.includes('$'));
      console.log('🔍 [PHYSICSTEXT] Count of $ signs:', (normalizedText.match(/\$/g) || []).length);

      // Render with KaTeX
      const container = containerRef.current;
      
      // Split by formulas: $$...$$ (block) or $...$ (inline)
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
      
      console.log('🔍 [PHYSICSTEXT] Split into', parts.length, 'parts:');
      parts.forEach((part, idx) => {
        if (part) {
          const isFormula = part.startsWith('$');
          const preview = part.substring(0, 50) + (part.length > 50 ? '...' : '');
          console.log(`   Part ${idx}: ${preview} ${isFormula ? '(FORMULA)' : '(TEXT)'}`);
        }
      });
      
      parts.forEach((part) => {
        if (!part) return;

        if (part.startsWith('$$') && part.endsWith('$$')) {
          // Block formula
          let math = part.slice(2, -2).trim();
          
          // Auto-wrap subscripts and superscripts
          math = math.replace(/([a-zA-Z0-9])_(?!{)([a-zA-Z0-9])/g, '$1_{$2}');
          math = math.replace(/([a-zA-Z0-9])\^(?!{)([a-zA-Z0-9])/g, '$1^{$2}');
          
          console.log('🔄 [PHYSICSTEXT] Rendering block formula:', math);
          
          const span = document.createElement('span');
          span.className = 'katex-block';
          try {
            katex.render(math, span, {
              displayMode: true,
              throwOnError: false,
              errorColor: '#cc0000',
              strict: false
            });
            console.log('✅ [PHYSICSTEXT] Block formula rendered successfully');
          } catch (e) {
            console.error('❌ [PHYSICSTEXT] Error rendering block formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else if (part.startsWith('$') && part.endsWith('$')) {
          // Inline formula
          let math = part.slice(1, -1).trim();
          
          // Auto-wrap subscripts and superscripts
          math = math.replace(/([a-zA-Z0-9])_(?!{)([a-zA-Z0-9])/g, '$1_{$2}');
          math = math.replace(/([a-zA-Z0-9])\^(?!{)([a-zA-Z0-9])/g, '$1^{$2}');
          
          console.log('🔄 [PHYSICSTEXT] Rendering inline formula:', math);
          
          const span = document.createElement('span');
          span.className = 'katex-inline';
          try {
            katex.render(math, span, {
              displayMode: false,
              throwOnError: false,
              errorColor: '#cc0000',
              strict: false
            });
            console.log('✅ [PHYSICSTEXT] Inline formula rendered successfully');
          } catch (e) {
            console.error('❌ [PHYSICSTEXT] Error rendering inline formula:', e);
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
      
      console.log('✅ [PHYSICSTEXT] ===== RENDERING COMPLETE =====');
    } catch (error) {
      console.error('❌ [PHYSICSTEXT] Fatal error:', error);
      if (containerRef.current) {
        containerRef.current.textContent = text;
      }
    }
  }, [text]);

  if (!text) return null;

  return <span ref={containerRef} className={className}></span>;
}
