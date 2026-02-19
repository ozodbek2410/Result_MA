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


/**
 * Convert chemistry text with inline LaTeX (CH_4, 10^{23}, \cdot) to TipTap JSON
 * Kimyo uchun maxsus - oddiy LaTeX ni formula node ga aylantiradi
 */
export function convertChemistryToTiptapJson(text: string): any {
  if (!text) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    };
  }

  // Agar \(...\) yoki \[...\] bor bo'lsa, oddiy convertLatexToTiptapJson ishlatamiz
  if (text.includes('\\(') || text.includes('\\[')) {
    return convertLatexToTiptapJson(text);
  }

  // Kimyo formulalarini topamiz: CH_4, H_2O, X_3(PO_4)_2, 10^{23}, \cdot
  // Pattern 1: Murakkab formulalar (qavsli): X_3(PO_4)_2
  // Pattern 2: Oddiy formulalar: CH_4, H_2O
  // Pattern 3: Superscript: 10^{23}
  // Pattern 4: LaTeX commands: \cdot
  
  // Birinchi navbatda murakkab formulalarni topamiz (butun formula bir node bo'lishi kerak)
  // Masalan: X_3(PO_4)_2 → butun formula bir FormulaNode
  // Fixed regex: [A-Z][A-Za-z0-9]* to match PO, SO4, etc. (capital letters in compound)
  const complexFormulaPattern = /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g;
  
  // Agar murakkab formula bor bo'lsa, uni butunlay formula node qilamiz
  let hasComplexFormula = false;
  const complexMatches: Array<{ start: number; end: number; latex: string }> = [];
  
  let complexMatch;
  while ((complexMatch = complexFormulaPattern.exec(text)) !== null) {
    hasComplexFormula = true;
    complexMatches.push({
      start: complexMatch.index,
      end: complexMatch.index + complexMatch[0].length,
      latex: complexMatch[0]
    });
  }
  
  if (hasComplexFormula) {
    // Murakkab formulalar bilan ishlash
    const paragraphContent: any[] = [];
    let currentIndex = 0;
    
    complexMatches.forEach((match) => {
      // Matnni formula oldidan qo'shamiz
      if (match.start > currentIndex) {
        const beforeText = text.substring(currentIndex, match.start);
        if (beforeText) {
          paragraphContent.push({
            type: 'text',
            text: beforeText
          });
        }
      }
      
      // Formula qo'shamiz
      paragraphContent.push({
        type: 'formula',
        attrs: { latex: match.latex }
      });
      
      currentIndex = match.end;
    });
    
    // Qolgan matnni qo'shamiz
    if (currentIndex < text.length) {
      const remainingText = text.substring(currentIndex);
      if (remainingText) {
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
        content: paragraphContent
      }]
    };
  }
  
  // Oddiy formulalar uchun (CH_4, H_2SO_3, C_3H_8, etc.)
  // Match full formula: one or more element_number pairs
  // Example: CH_4 → C + H_4, H_2SO_3 → H_2 + SO_3, C_3H_8 → C_3 + H_8
  // Pattern: ([A-Z][A-Za-z0-9]*_\d+)+ to match consecutive element_number pairs
  const chemistryPattern = /((?:[A-Z][A-Za-z0-9]*_\d+)+)|(\d+)\^(\d+|{[^}]+})|\\cdot/g;
  
  const paragraphContent: any[] = [];
  let currentIndex = 0;
  let match;
  
  while ((match = chemistryPattern.exec(text)) !== null) {
    // Matnni formula oldidan qo'shamiz
    if (match.index > currentIndex) {
      const beforeText = text.substring(currentIndex, match.index);
      if (beforeText) {
        paragraphContent.push({
          type: 'text',
          text: beforeText
        });
      }
    }
    
    // Formula qo'shamiz
    const fullMatch = match[0];
    paragraphContent.push({
      type: 'formula',
      attrs: { latex: fullMatch }
    });
    
    currentIndex = match.index + fullMatch.length;
  }
  
  // Qolgan matnni qo'shamiz
  if (currentIndex < text.length) {
    const remainingText = text.substring(currentIndex);
    if (remainingText) {
      paragraphContent.push({
        type: 'text',
        text: remainingText
      });
    }
  }
  
  // Agar hech qanday formula topilmasa, oddiy matn qaytaramiz
  if (paragraphContent.length === 0) {
    return {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }]
    };
  }
  
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: paragraphContent
    }]
  };
}


/**
 * Convert physics text with inline LaTeX to TipTap JSON
 * Fizika uchun maxsus - matematik formulalar va fizik birliklar
 */
export function convertPhysicsToTiptapJson(text: string): any {
  if (!text) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    };
  }

  // Agar \(...\) yoki \[...\] bor bo'lsa, oddiy convertLatexToTiptapJson ishlatamiz
  if (text.includes('\\(') || text.includes('\\[')) {
    return convertLatexToTiptapJson(text);
  }

  // Fizika formulalarini topamiz: v_0, E^2, F = ma, \times, \div, \cdot
  // Pattern: variable_subscript, number^superscript, LaTeX commands
  const physicsPattern = /([A-Za-z])_(\d+|{[^}]+})|([A-Za-z0-9])\^(\d+|{[^}]+})|\\(times|div|cdot|approx|neq|leq|geq|to)/g;
  
  const paragraphContent: any[] = [];
  let currentIndex = 0;
  let match;
  
  while ((match = physicsPattern.exec(text)) !== null) {
    // Add text before formula
    if (match.index > currentIndex) {
      const beforeText = text.substring(currentIndex, match.index);
      if (beforeText) {
        paragraphContent.push({
          type: 'text',
          text: beforeText
        });
      }
    }
    
    // Add formula
    const fullMatch = match[0];
    paragraphContent.push({
      type: 'formula',
      attrs: { latex: fullMatch }
    });
    
    currentIndex = match.index + fullMatch.length;
  }
  
  // Add remaining text
  if (currentIndex < text.length) {
    const remainingText = text.substring(currentIndex);
    if (remainingText) {
      paragraphContent.push({
        type: 'text',
        text: remainingText
      });
    }
  }
  
  // If no formulas found, return plain text
  if (paragraphContent.length === 0) {
    return {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }]
    };
  }
  
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: paragraphContent
    }]
  };
}
