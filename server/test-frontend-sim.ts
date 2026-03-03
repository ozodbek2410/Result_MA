/**
 * Simulate convertLatexToTiptapJson on server to verify output
 */

// Simulated convertLatexToTiptapJson (copy of client logic)
function convertLatexToTiptapJson(text: string): any {
  if (!text) return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };

  let cleanedText = text.replace(/\\text\{([^}]+)\}/g, '$1');

  if (!cleanedText.includes('\\(') && !cleanedText.includes('\\[')) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: cleanedText }] }] };
  }

  const paragraphContent: any[] = [];
  let currentIndex = 0;
  const formulaRegex = /\\[()\[\]]/g;
  let match;
  let inFormula = false;
  let formulaStart = -1;
  let formulaType: '(' | '[' | null = null;

  while ((match = formulaRegex.exec(cleanedText)) !== null) {
    const symbol = match[0];

    if (!inFormula) {
      if (symbol === '\\(' || symbol === '\\[') {
        if (match.index > currentIndex) {
          const beforeText = cleanedText.substring(currentIndex, match.index);
          if (beforeText) paragraphContent.push({ type: 'text', text: beforeText });
        }
        inFormula = true;
        formulaStart = match.index + 2;
        formulaType = symbol === '\\(' ? '(' : '[';
      }
    } else {
      const expectedEnd = formulaType === '(' ? '\\)' : '\\]';
      if (symbol === expectedEnd) {
        const latex = cleanedText.substring(formulaStart, match.index);
        paragraphContent.push({ type: 'formula', attrs: { latex: latex.trim() } });
        inFormula = false;
        formulaType = null;
        currentIndex = match.index + 2;
      }
    }
  }

  if (currentIndex < cleanedText.length) {
    const remainingText = cleanedText.substring(currentIndex);
    if (remainingText.trim()) paragraphContent.push({ type: 'text', text: remainingText });
  }

  return { type: 'doc', content: [{ type: 'paragraph', content: paragraphContent.length > 0 ? paragraphContent : [] }] };
}

// Test texts from parser
const tests = [
  {
    label: 'Q22',
    text: 'Agar \\(x^{2} + \\frac{9}{4}y^{2} + x + 3y + \\frac{5}{4} = 0\\) tenglik o\'rinli bo\'lsa xy ni toping.'
  },
  {
    label: 'Q23',
    text: 'Hisoblang: \\(\\frac{\\sqrt{7} + \\sqrt{5}}{\\sqrt{28} + \\sqrt{21} + \\sqrt{20} + \\sqrt{15}} - \\frac{\\sqrt{3} + \\sqrt{5}}{\\sqrt{20} - \\sqrt{15} + \\sqrt{12} - 3}\\)'
  },
  {
    label: 'Q23-C',
    text: '2 \\(\\sqrt{3}\\)'
  },
  {
    label: 'Q29',
    text: 'Ko\'phadning darajasini toping. \\(P(x;y) = 100x^{12}y{15} - 33x^{33} - 11,5xy - 2026\\)'
  }
];

for (const t of tests) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${t.label}: "${t.text}"`);
  const json = convertLatexToTiptapJson(t.text);
  console.log('\nTipTap JSON:');
  console.log(JSON.stringify(json, null, 2));

  // Check what TipTap would display as text
  const content = json.content[0]?.content || [];
  console.log('\nRendered nodes:');
  for (const node of content) {
    if (node.type === 'text') console.log(`  TEXT: "${node.text}"`);
    else if (node.type === 'formula') console.log(`  FORMULA: "${node.attrs.latex}"`);
  }
}

// Also test: what happens when JSON object is passed to RichTextEditor?
console.log('\n' + '='.repeat(60));
console.log('JSON stringify test (simulates what happens if value gets stringified):');
const q23json = convertLatexToTiptapJson(tests[1].text);
const stringified = JSON.stringify(q23json);
console.log(`typeof object: ${typeof q23json}`);
console.log(`typeof stringified: ${typeof stringified}`);
console.log(`JSON.parse works: ${JSON.parse(stringified).type === 'doc'}`);
