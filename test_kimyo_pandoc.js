/**
 * Test kimyo.docx parsing with Pandoc format
 */

const path = require('path');

// Simulate ChemistryParser cleanChemistryText
function cleanChemistryText(text) {
  let cleaned = text
    .replace(/\\\'/g, "'")
    .replace(/\\\./g, ".")
    .replace(/\\\)/g, ")")
    .replace(/\\`/g, "'")
    .replace(/\\/g, "")
    .replace(/\s+/g, ' ')
    .trim();
  
  cleaned = cleaned.replace(/∙/g, '\\cdot ');
  cleaned = cleaned.replace(/·/g, '\\cdot ');
  cleaned = cleaned.replace(/\\\*/g, ' \\cdot ');
  
  // CHEMISTRY: Convert Pandoc subscript/superscript to LaTeX format
  // (P)~2~ → (P)_2
  // X~3~(PO~4~)~2~ → X_3(PO_4)_2
  cleaned = cleaned.replace(/([A-Za-z0-9\(\)])~([^~\s]+)~/g, '$1_$2');
  cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
  
  // CHEMISTRY: Fix duplicate patterns (X3X3 → X3, P2P2 → P2)
  cleaned = cleaned.replace(/([A-Z][a-z]?\d+)\1+/g, '$1');
  
  cleaned = cleaned.replace(/\b([A-Z])O\s+ning/g, '$1_2O ning');
  cleaned = cleaned.replace(/\b([A-Z])O\s+ni/g, '$1_2O ni');
  cleaned = cleaned.replace(/([A-Z][a-z]?)\s+(\d+)/g, '$1$2');
  cleaned = cleaned.replace(/->/g, '→');
  cleaned = cleaned.replace(/<->/g, '⇌');
  
  return cleaned;
}

// Test with actual text from kimyo.docx
const testTexts = [
  "(P)~2~ ning molyar massasi 454 g/mol bo'lsa, ''X'' nomalum elementni toping.",
  "X~3~(PO~4~)~2~ ning molyar massasi 454 g/mol bo'lsa, ''X'' nomalum elementni toping.",
  "X3X3(PO4O4)~2~ ning molyar massasi 454 g/mol bo'lsa",
  "10^23^ molekula",
  "NH~3~ va H~2~O"
];

console.log('🧪 Testing kimyo.docx Pandoc format\n');
console.log('='.repeat(70));

testTexts.forEach((text, index) => {
  console.log(`\nTest ${index + 1}:`);
  console.log(`Input:  "${text}"`);
  const result = cleanChemistryText(text);
  console.log(`Output: "${result}"`);
  console.log('─'.repeat(70));
});

console.log('\n✅ All conversions completed');
