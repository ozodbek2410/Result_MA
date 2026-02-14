/**
 * Utilities for converting LaTeX format to TipTap JSON format
 */

import { hasMathML, convertMathMLToLatex } from './mathmlUtils';

/**
 * Check if text contains LaTeX formulas or MathML
 */
export function hasLatexFormulas(text: string): boolean {
  if (!text) return false;
  // Ищем \( или \[ (одинарный слеш, так как в JS строке он уже распарсен)
  // Или проверяем наличие MathML
  return text.includes('\\(') || text.includes('\\[') || hasMathML(text);
}

/**
 * Convert text with LaTeX formulas \\(...\\) to TipTap JSON format
 * Также поддерживает MathML из Word
 */
export function convertLatexToTiptapJson(text: string): any {
  if (!text) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    };
  }

  // Сначала конвертируем MathML в LaTeX (если есть)
  let processedText = text;
  if (hasMathML(text)) {
    console.log('🔄 Detected MathML in text, converting to LaTeX...');
    processedText = convertMathMLToLatex(text);
  }

  // Убираем \text{} обертки (AI иногда добавляет их)
  let cleanedText = processedText.replace(/\\text\{([^}]+)\}/g, '$1');

  // Если нет формул, возвращаем простой текст
  if (!hasLatexFormulas(cleanedText)) {
    return {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: cleanedText }]
      }]
    };
  }

  const paragraphContent: any[] = [];
  let currentIndex = 0;
  
  // Ищем все формулы в тексте
  // Паттерн: \( ... \) где внутри может быть что угодно кроме \)
  const formulaRegex = /\\[()\[\]]/g;
  let match;
  let inFormula = false;
  let formulaStart = -1;
  let formulaType: '(' | '[' | null = null;
  
  while ((match = formulaRegex.exec(cleanedText)) !== null) {
    const symbol = match[0]; // \( или \) или \[ или \]
    
    if (!inFormula) {
      // Начало формулы
      if (symbol === '\\(' || symbol === '\\[') {
        // Добавляем текст перед формулой
        if (match.index > currentIndex) {
          const beforeText = cleanedText.substring(currentIndex, match.index);
          if (beforeText) {
            paragraphContent.push({
              type: 'text',
              text: beforeText
            });
          }
        }
        
        inFormula = true;
        formulaStart = match.index + 2; // После \( или \[
        formulaType = symbol === '\\(' ? '(' : '[';
      }
    } else {
      // Конец формулы
      const expectedEnd = formulaType === '(' ? '\\)' : '\\]';
      if (symbol === expectedEnd) {
        // Извлекаем LaTeX формулы
        const latex = cleanedText.substring(formulaStart, match.index);
        
        paragraphContent.push({
          type: 'formula',
          attrs: { latex: latex.trim() }
        });
        
        inFormula = false;
        formulaType = null;
        currentIndex = match.index + 2; // После \) или \]
      }
    }
  }
  
  // Добавляем оставшийся текст после последней формулы
  if (currentIndex < cleanedText.length) {
    const remainingText = cleanedText.substring(currentIndex);
    if (remainingText.trim()) {
      paragraphContent.push({
        type: 'text',
        text: remainingText
      });
    }
  }
  
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: paragraphContent.length > 0 ? paragraphContent : []
    }]
  };
}

/**
 * Convert text with LaTeX formulas to HTML (fallback method)
 * Также поддерживает MathML из Word
 */
export function convertLatexToHtml(text: string): string {
  if (!text) return '<p></p>';
  
  // Сначала конвертируем MathML в LaTeX (если есть)
  let processedText = text;
  if (hasMathML(text)) {
    console.log('🔄 Detected MathML in text, converting to LaTeX...');
    processedText = convertMathMLToLatex(text);
  }
  
  let html = processedText;
  
  // Заменяем \( ... \) на <span data-type="formula" data-latex="...">
  html = html.replace(/\\\(([^)]+)\\\)/g, (match, latex) => {
    return `<span data-type="formula" data-latex="${latex.trim()}"></span>`;
  });
  
  // Заменяем \[ ... \] на блочные формулы
  html = html.replace(/\\\[([^\]]+)\\\]/g, (match, latex) => {
    return `<p><span data-type="formula" data-latex="${latex.trim()}"></span></p>`;
  });
  
  // Оборачиваем в параграф если нет HTML тегов
  if (!html.includes('<p>') && !html.includes('<div>') && !html.includes('<span')) {
    html = `<p>${html}</p>`;
  }
  
  return html;
}

/**
 * Convert TipTap JSON to text with LaTeX formulas
 * Используется для печати и экспорта
 */
export function convertTiptapJsonToText(json: any): string {
  if (!json) return '';
  
  // Если это строка, пытаемся распарсить
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json);
    } catch {
      // Если не JSON, возвращаем как есть
      return json;
    }
  }
  
  // Если это не объект, возвращаем как есть
  if (typeof json !== 'object') {
    return String(json);
  }
  
  // Рекурсивная функция для обработки узлов
  function processNode(node: any): string {
    if (!node) return '';
    
    // Текстовый узел
    if (node.type === 'text') {
      return node.text || '';
    }
    
    // Формула - возвращаем в LaTeX формате для MathText
    if (node.type === 'formula') {
      const latex = node.attrs?.latex || '';
      return `\\(${latex}\\)`;
    }
    
    // Параграф
    if (node.type === 'paragraph') {
      const content = node.content?.map(processNode).join('') || '';
      return content;
    }
    
    // Документ
    if (node.type === 'doc') {
      return node.content?.map(processNode).join('\n') || '';
    }
    
    // Обработка content если есть
    if (node.content) {
      return node.content.map(processNode).join('');
    }
    
    return '';
  }
  
  return processNode(json);
}
