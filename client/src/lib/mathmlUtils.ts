/**
 * Utilities for converting MathML to LaTeX format
 * MathML is the format used by Microsoft Word when copying equations
 */

/**
 * Check if text contains MathML markup
 */
export function hasMathML(text: string): boolean {
  if (!text) return false;
  return text.includes('<math') || text.includes('<mml:math');
}

/**
 * Extract MathML blocks from text
 */
export function extractMathML(text: string): Array<{ start: number; end: number; mathml: string }> {
  const results: Array<{ start: number; end: number; mathml: string }> = [];
  
  // Ищем <math...>...</math> или <mml:math...>...</mml:math>
  const mathRegex = /<(mml:)?math[^>]*>[\s\S]*?<\/(mml:)?math>/gi;
  let match: RegExpExecArray | null;
  
  while ((match = mathRegex.exec(text)) !== null) {
    results.push({
      start: match.index,
      end: match.index + match[0].length,
      mathml: match[0]
    });
  }
  
  return results;
}

/**
 * Convert MathML to LaTeX
 * Supports common MathML elements used by Microsoft Word
 */
export function mathmlToLatex(mathml: string): string {
  if (!mathml) return '';
  
  // Удаляем namespace префиксы (mml:)
  let cleaned = mathml.replace(/mml:/g, '');
  
  // Создаем временный DOM элемент для парсинга
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleaned, 'text/xml');
  
  // Проверяем на ошибки парсинга
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    console.error('MathML parsing error:', parserError.textContent);
    return '';
  }
  
  const mathElement = doc.querySelector('math');
  if (!mathElement) return '';
  
  return convertNode(mathElement);
}

/**
 * Recursively convert MathML node to LaTeX
 */
function convertNode(node: Element): string {
  const tagName = node.tagName.toLowerCase().replace('mml:', '');
  
  switch (tagName) {
    case 'math':
      // Root element - process children
      return Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' ');
    
    case 'mi': // Identifier (variables)
    case 'mn': // Number
      return node.textContent || '';
    
    case 'mo': // Operator
      const opText = node.textContent || '';
      return unicodeToLatex(opText);
    
    case 'mtext': // Text
      return `\\text{${node.textContent || ''}}`;
    
    case 'mrow': // Row (grouping)
      return Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' ');
    
    case 'msup': // Superscript (x^2)
      const base = convertNode(node.children[0] as Element);
      const sup = convertNode(node.children[1] as Element);
      return `${base}^{${sup}}`;
    
    case 'msub': // Subscript (x_1)
      const baseS = convertNode(node.children[0] as Element);
      const sub = convertNode(node.children[1] as Element);
      return `${baseS}_{${sub}}`;
    
    case 'msubsup': // Both subscript and superscript
      const baseB = convertNode(node.children[0] as Element);
      const subB = convertNode(node.children[1] as Element);
      const supB = convertNode(node.children[2] as Element);
      return `${baseB}_{${subB}}^{${supB}}`;
    
    case 'mfrac': // Fraction
      const numerator = convertNode(node.children[0] as Element);
      const denominator = convertNode(node.children[1] as Element);
      return `\\frac{${numerator}}{${denominator}}`;
    
    case 'msqrt': // Square root
      const content = Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' ');
      return `\\sqrt{${content}}`;
    
    case 'mroot': // N-th root
      const radicand = convertNode(node.children[0] as Element);
      const index = convertNode(node.children[1] as Element);
      return `\\sqrt[${index}]{${radicand}}`;
    
    case 'mfenced': // Fenced expression (parentheses, brackets, etc.)
      const open = node.getAttribute('open') || '(';
      const close = node.getAttribute('close') || ')';
      const inner = Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' ');
      
      // Convert to LaTeX delimiters
      const openLatex = open === '(' ? '(' : open === '[' ? '[' : open === '{' ? '\\{' : open;
      const closeLatex = close === ')' ? ')' : close === ']' ? ']' : close === '}' ? '\\}' : close;
      
      return `${openLatex}${inner}${closeLatex}`;
    
    case 'mover': // Over (like hat, bar)
      const baseO = convertNode(node.children[0] as Element);
      const over = convertNode(node.children[1] as Element);
      
      // Common accents
      if (over === '¯' || over === '―') return `\\overline{${baseO}}`;
      if (over === '^' || over === '∧') return `\\hat{${baseO}}`;
      if (over === '˜' || over === '~') return `\\tilde{${baseO}}`;
      if (over === '→') return `\\vec{${baseO}}`;
      
      return `\\overset{${over}}{${baseO}}`;
    
    case 'munder': // Under
      const baseU = convertNode(node.children[0] as Element);
      const under = convertNode(node.children[1] as Element);
      return `\\underset{${under}}{${baseU}}`;
    
    case 'munderover': // Both under and over (like sum, integral)
      const baseUO = convertNode(node.children[0] as Element);
      const underUO = convertNode(node.children[1] as Element);
      const overUO = convertNode(node.children[2] as Element);
      
      // Check if base is a large operator
      const baseText = node.children[0].textContent || '';
      if (baseText === '∑') return `\\sum_{${underUO}}^{${overUO}}`;
      if (baseText === '∫') return `\\int_{${underUO}}^{${overUO}}`;
      if (baseText === '∏') return `\\prod_{${underUO}}^{${overUO}}`;
      
      return `\\underset{${underUO}}{\\overset{${overUO}}{${baseUO}}}`;
    
    case 'mtable': // Table (matrix)
      const rows = Array.from(node.children)
        .map(row => {
          const cells = Array.from((row as Element).children)
            .map(cell => convertNode(cell as Element))
            .join(' & ');
          return cells;
        })
        .join(' \\\\ ');
      return `\\begin{matrix} ${rows} \\end{matrix}`;
    
    case 'mtr': // Table row
      return Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' & ');
    
    case 'mtd': // Table cell
      return Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' ');
    
    case 'mspace': // Space
      return ' ';
    
    case 'mstyle': // Style (usually just process children)
      return Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' ');
    
    case 'semantics': // Semantic annotation (process first child only)
      if (node.children.length > 0) {
        return convertNode(node.children[0] as Element);
      }
      return '';
    
    default:
      console.warn(`Unknown MathML element: ${tagName}`);
      return Array.from(node.children)
        .map(child => convertNode(child as Element))
        .join(' ');
  }
}

/**
 * Convert special Unicode math symbols to LaTeX
 */
function unicodeToLatex(text: string): string {
  const replacements: Record<string, string> = {
    '≤': '\\leq',
    '≥': '\\geq',
    '≠': '\\neq',
    '±': '\\pm',
    '∓': '\\mp',
    '×': '\\times',
    '÷': '\\div',
    '∞': '\\infty',
    '∑': '\\sum',
    '∏': '\\prod',
    '∫': '\\int',
    '√': '\\sqrt',
    'π': '\\pi',
    'α': '\\alpha',
    'β': '\\beta',
    'γ': '\\gamma',
    'δ': '\\delta',
    'ε': '\\epsilon',
    'θ': '\\theta',
    'λ': '\\lambda',
    'μ': '\\mu',
    'σ': '\\sigma',
    'φ': '\\phi',
    'ω': '\\omega',
    'Δ': '\\Delta',
    'Σ': '\\Sigma',
    'Ω': '\\Omega',
    '∈': '\\in',
    '∉': '\\notin',
    '⊂': '\\subset',
    '⊃': '\\supset',
    '∪': '\\cup',
    '∩': '\\cap',
    '∅': '\\emptyset',
    '→': '\\rightarrow',
    '←': '\\leftarrow',
    '↔': '\\leftrightarrow',
    '⇒': '\\Rightarrow',
    '⇐': '\\Leftarrow',
    '⇔': '\\Leftrightarrow',
  };
  
  let result = text;
  for (const [unicode, latex] of Object.entries(replacements)) {
    result = result.replace(new RegExp(unicode, 'g'), latex);
  }
  
  return result;
}

/**
 * Convert text with MathML to text with LaTeX formulas
 * Используется при импорте из Word или вставке из буфера обмена
 */
export function convertMathMLToLatex(text: string): string {
  if (!text || !hasMathML(text)) return text;
  
  console.log('🔄 Converting MathML to LaTeX...');
  
  const mathBlocks = extractMathML(text);
  if (mathBlocks.length === 0) return text;
  
  console.log(`✅ Found ${mathBlocks.length} MathML block(s)`);
  
  let result = '';
  let lastIndex = 0;
  
  for (const block of mathBlocks) {
    // Add text before MathML
    result += text.substring(lastIndex, block.start);
    
    // Convert MathML to LaTeX
    const latex = mathmlToLatex(block.mathml);
    if (latex) {
      console.log(`✅ Converted: ${latex}`);
      result += `\\(${latex}\\)`;
    } else {
      console.warn('❌ Failed to convert MathML block');
    }
    
    lastIndex = block.end;
  }
  
  // Add remaining text
  result += text.substring(lastIndex);
  
  return result;
}

/**
 * Convert MathML to TipTap JSON format
 * Используется для вставки формул в редактор
 */
export function convertMathMLToTiptapJson(mathml: string): any {
  const latex = mathmlToLatex(mathml);
  
  if (!latex) {
    return null;
  }
  
  return {
    type: 'formula',
    attrs: { latex: latex.trim() }
  };
}
