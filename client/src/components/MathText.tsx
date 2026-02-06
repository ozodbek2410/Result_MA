import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  text: string;
  className?: string;
}

export default function MathText({ text, className = '' }: MathTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current || !text) return;

    try {
      containerRef.current.innerHTML = '';

      let cleanedText = text;
      
      // Сначала удаляем HTML теги (кроме тегов с формулами)
      cleanedText = cleanedText.replace(/<p>/gi, '');
      cleanedText = cleanedText.replace(/<\/p>/gi, '\n');
      cleanedText = cleanedText.replace(/<br\s*\/?>/gi, '\n');
      
      // Удаляем пустые формулы
      cleanedText = cleanedText.replace(/<span[^>]*data-type="formula"[^>]*data-latex=""[^>]*><\/span>/g, '');
      cleanedText = cleanedText.replace(/<span[^>]*data-latex=""[^>]*data-type="formula"[^>]*><\/span>/g, '');

      // Извлекаем формулы из HTML-тегов и конвертируем в $...$
      cleanedText = cleanedText.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, '$$$1$$');
      cleanedText = cleanedText.replace(/<[^>]+>/g, '');
      cleanedText = cleanedText.trim();

      // Нормализуем формат: конвертируем \(...\) в $...$
      let normalizedText = cleanedText;
      normalizedText = normalizedText.replace(/\\\((.*?)\\\)/g, '$$1$');
      normalizedText = normalizedText.replace(/\\\[(.*?)\\\]/g, '$$$1$$');

      // Рендерим с помощью KaTeX
      const container = containerRef.current;
      const parts = normalizedText.split(/(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$)/g);
      
      parts.forEach((part) => {
        if (!part) return;

        if (part.startsWith('$$') && part.endsWith('$$')) {
          // Блочная формула
          let math = part.slice(2, -2);
          math = math.replace(/([a-zA-Z0-9])_(?!{)([a-zA-Z0-9])/g, '$1_{$2}');
          math = math.replace(/([a-zA-Z0-9])\^(?!{)([a-zA-Z0-9])/g, '$1^{$2}');
          
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
            console.error('Error rendering block formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else if (part.startsWith('$') && part.endsWith('$')) {
          // Inline формула
          let math = part.slice(1, -1);
          math = math.replace(/([a-zA-Z0-9])_(?!{)([a-zA-Z0-9])/g, '$1_{$2}');
          math = math.replace(/([a-zA-Z0-9])\^(?!{)([a-zA-Z0-9])/g, '$1^{$2}');
          
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
            console.error('Error rendering inline formula:', e);
            span.textContent = part;
            span.className = 'text-red-500';
          }
          container.appendChild(span);
        } else {
          // Обычный текст
          const textNode = document.createTextNode(part);
          container.appendChild(textNode);
        }
      });
    } catch (error) {
      console.error('Error rendering math:', error);
      if (containerRef.current) {
        containerRef.current.textContent = text;
      }
    }
  }, [text]);

  if (!text) return null;

  return <span ref={containerRef} className={className}></span>;
}
