import { useEffect, useRef } from 'react';
import katex from 'katex';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import { renderOmmlInText } from '@/lib/ommlUtils';
import 'katex/dist/katex.min.css';

interface BiologyTextProps {
  text: string;
  className?: string;
}

/**
 * 🧬 BIOLOGY TEXT RENDERER
 * 
 * Biologiya matnlarini to'g'ri render qiladi:
 * - Latin nomlar (Homo sapiens)
 * - Anatomiya terminlari
 * - Minimal matematik formulalar
 */
export default function BiologyText({ text, className = '' }: BiologyTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current || !text) return;

    try {
      containerRef.current.innerHTML = '';

      console.log('🧬 [BIOLOGY] ===== START RENDERING =====');
      console.log('🧬 [BIOLOGY] Original text:', text.substring(0, 200));

      let cleanedText = text;
      
      // Шаг 1: Конвертируем OMML в MathML (если есть)
      if (cleanedText.includes('<omml>')) {
        console.log('🔄 [OMML] Converting OMML to MathML...');
        cleanedText = renderOmmlInText(cleanedText);
      }
      
      // Шаг 2: Конвертируем MathML в LaTeX (если есть)
      if (hasMathML(cleanedText)) {
        console.log('🔄 [MathML] Converting MathML to LaTeX...');
        cleanedText = convertMathMLToLatex(cleanedText);
      }
      
      // Шаг 3: Очистка HTML
      cleanedText = cleanedText.replace(/<p>/gi, '');
      cleanedText = cleanedText.replace(/<\/p>/gi, '\n');
      cleanedText = cleanedText.replace(/<br\s*\/?>/gi, '\n');
      
      // Fix double backslashes
      cleanedText = cleanedText.replace(/\\\\+\(/g, '\\(');
      cleanedText = cleanedText.replace(/\\\\+\)/g, '\\)');
      cleanedText = cleanedText.replace(/\\\\+\[/g, '\\[');
      cleanedText = cleanedText.replace(/\\\\+\]/g, '\\]');
      
      console.log('🧬 [BIOLOGY] After HTML cleanup:', cleanedText.substring(0, 200));
      
      // Удаляем пустые формулы
      cleanedText = cleanedText.replace(/<span[^>]*data-type="formula"[^>]*data-latex=""[^>]*><\/span>/g, '');
      cleanedText = cleanedText.replace(/<span[^>]*data-latex=""[^>]*data-type="formula"[^>]*><\/span>/g, '');

      // Извлекаем формулы из HTML-тегов
      cleanedText = cleanedText.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, '$$$1$$');
      cleanedText = cleanedText.replace(/<[^>]+>/g, '');
      cleanedText = cleanedText.trim();

      // Нормализуем формат
      let normalizedText = cleanedText;
      normalizedText = normalizedText.replace(/\\\((.*?)\\\)/g, '$$$1$$');
      normalizedText = normalizedText.replace(/\\\[(.*?)\\\]/g, '$$$1$$');

      console.log('🧬 [BIOLOGY] After normalization:', normalizedText.substring(0, 200));
      console.log('🧬 [BIOLOGY] Has $ signs:', normalizedText.includes('$'));

      // Рендерим с помощью KaTeX
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
      
      console.log('🧬 [BIOLOGY] Split into', parts.length, 'parts');
      
      parts.forEach((part) => {
        if (!part) return;

        if (part.startsWith('$$') && part.endsWith('$$')) {
          let math = part.slice(2, -2).trim();
          
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
            console.error('❌ [BIOLOGY] Error rendering block formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else if (part.startsWith('$') && part.endsWith('$')) {
          let math = part.slice(1, -1).trim();
          
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
            console.error('❌ [BIOLOGY] Error rendering inline formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else {
          const textNode = document.createTextNode(part);
          container.appendChild(textNode);
        }
      });
      
      console.log('✅ [BIOLOGY] ===== RENDERING COMPLETE =====');
    } catch (error) {
      console.error('❌ [BIOLOGY] Fatal error:', error);
      if (containerRef.current) {
        containerRef.current.textContent = text;
      }
    }
  }, [text]);

  if (!text) return null;

  return <span ref={containerRef} className={className}></span>;
}
