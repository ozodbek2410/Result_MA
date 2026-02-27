import { useEffect, useRef } from 'react';

interface LiteratureTextProps {
  text: string;
  className?: string;
}

/**
 * LiteratureText - Ona tili va Adabiyot matnlarini ko'rsatish uchun
 * 
 * Xususiyatlari:
 * - Oddiy matn (formulalar yo'q)
 * - Qo'shtirnoqlar va maxsus belgilarni saqlab qolish
 * - Paragraflar va qatorlarni to'g'ri formatlash
 * - She'r va badiiy matnlarni chiroyli ko'rsatish
 */
export default function LiteratureText({ text, className = '' }: LiteratureTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  console.log('📚 [LITERATURETEXT] Component rendered with text:', text?.substring(0, 100));

  useEffect(() => {
    if (!containerRef.current || !text) return;

    try {
      containerRef.current.innerHTML = '';

      console.log('🔍 [LITERATURETEXT] ===== START RENDERING =====');
      console.log('🔍 [LITERATURETEXT] Original text:', text.substring(0, 200));

      let cleanedText = text;
      
      // Clean HTML tags
      cleanedText = cleanedText.replace(/<p>/gi, '');
      cleanedText = cleanedText.replace(/<\/p>/gi, '\n');
      cleanedText = cleanedText.replace(/<br\s*\/?>/gi, '\n');
      cleanedText = cleanedText.replace(/<[^>]+>/g, '');
      
      // Preserve special characters
      cleanedText = cleanedText.trim();
      
      console.log('🔍 [LITERATURETEXT] After cleanup:', cleanedText.substring(0, 200));

      // Render as plain text with line breaks
      const container = containerRef.current;
      
      // Split by line breaks and create text nodes
      const lines = cleanedText.split('\n');
      
      lines.forEach((line, index) => {
        if (line.trim()) {
          const textNode = document.createTextNode(line);
          container.appendChild(textNode);
          
          // Add line break if not last line
          if (index < lines.length - 1) {
            container.appendChild(document.createElement('br'));
          }
        }
      });
      
      console.log('✅ [LITERATURETEXT] ===== RENDERING COMPLETE =====');
    } catch (error) {
      console.error('❌ [LITERATURETEXT] Fatal error:', error);
      if (containerRef.current) {
        containerRef.current.textContent = text;
      }
    }
  }, [text]);

  if (!text) return null;

  return <span ref={containerRef} className={className}></span>;
}
