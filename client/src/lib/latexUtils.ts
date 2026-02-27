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
 * Convert chemistry text with inline LaTeX (CH_4, CrO_4^{2-}, 10^{23}, \cdot) to TipTap JSON
 * Handles BOTH \(...\) delimited formulas AND bare inline chemistry formulas
 */
export function convertChemistryToTiptapJson(text: string): any {
  if (!text) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }

  // Collect all formula regions (both \(...\) delimited and inline chemistry)
  const regions: Array<{start: number; end: number; latex: string}> = [];

  const isOverlapping = (s: number, e: number) =>
    regions.some(r => (s >= r.start && s < r.end) || (e > r.start && e <= r.end));

  let m: RegExpExecArray | null;

  // 1. \(...\) and \[...\] delimited formulas
  const latexDelimited = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g;
  while ((m = latexDelimited.exec(text)) !== null) {
    const inner = m[0].slice(2, -2).trim();
    if (inner) regions.push({ start: m.index, end: m.index + m[0].length, latex: inner });
  }

  // 2. Complex formulas: X_3(PO_4)_2
  const complexPattern = /[A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+/g;
  while ((m = complexPattern.exec(text)) !== null) {
    if (!isOverlapping(m.index, m.index + m[0].length))
      regions.push({ start: m.index, end: m.index + m[0].length, latex: m[0] });
  }

  // 3. Simple formulas with optional charge: CH_4, CrO_4^{2-}, H_2SO_4
  const simplePattern = /(?:[A-Z][A-Za-z0-9]*_\d+)+(?:\^(?:\{[^}]+\}|\d+[+-]|[+-]\d+))?/g;
  while ((m = simplePattern.exec(text)) !== null) {
    if (!isOverlapping(m.index, m.index + m[0].length))
      regions.push({ start: m.index, end: m.index + m[0].length, latex: m[0] });
  }

  // 4. Element + charge (no subscript): Cr^{2+}, Fe^{3+}, O^{2-}
  const chargePattern = /[A-Z][a-z]?\^(?:\{[^}]+\}|\d+[+-]|[+-]\d+)/g;
  while ((m = chargePattern.exec(text)) !== null) {
    if (!isOverlapping(m.index, m.index + m[0].length))
      regions.push({ start: m.index, end: m.index + m[0].length, latex: m[0] });
  }

  // 5. Superscripts: 10^{23}, 6\cdot10^{23}
  const superPattern = /\d+\^(?:\d+|\{[^}]+\})/g;
  while ((m = superPattern.exec(text)) !== null) {
    if (!isOverlapping(m.index, m.index + m[0].length))
      regions.push({ start: m.index, end: m.index + m[0].length, latex: m[0] });
  }

  // 5.5. Isotope mass number: ^{14}N, ^{14}O, _{19}K^{39}
  const isotopePattern = /(?:_(?:\{[^}]+\}|\d+))?\^(?:\{[^}]+\}|\d+)[A-Z][a-z]?/g;
  while ((m = isotopePattern.exec(text)) !== null) {
    if (!isOverlapping(m.index, m.index + m[0].length))
      regions.push({ start: m.index, end: m.index + m[0].length, latex: m[0] });
  }

  // 6. LaTeX commands: \cdot, \times, \div
  const latexCmdPattern = /\\(?:cdot|times|div)/g;
  while ((m = latexCmdPattern.exec(text)) !== null) {
    if (!isOverlapping(m.index, m.index + m[0].length))
      regions.push({ start: m.index, end: m.index + m[0].length, latex: m[0] });
  }

  // Sort by position
  regions.sort((a, b) => a.start - b.start);

  if (regions.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
  }

  // Build TipTap content
  const paragraphContent: any[] = [];
  let lastEnd = 0;

  regions.forEach(r => {
    if (r.start > lastEnd) {
      const before = text.substring(lastEnd, r.start);
      if (before) paragraphContent.push({ type: 'text', text: before });
    }
    paragraphContent.push({ type: 'formula', attrs: { latex: r.latex } });
    lastEnd = r.end;
  });

  if (lastEnd < text.length) {
    const remaining = text.substring(lastEnd);
    if (remaining) paragraphContent.push({ type: 'text', text: remaining });
  }

  return { type: 'doc', content: [{ type: 'paragraph', content: paragraphContent }] };
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
