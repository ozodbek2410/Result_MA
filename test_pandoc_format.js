/**
 * Test Pandoc format conversion
 * 
 * Проверяем конвертацию:
 * - (P)~2~ → (P)_2
 * - X~3~(PO~4~)~2~ → X_3(PO_4)_2
 * - 10^23^ → 10^{23}
 */

function cleanChemistryText(text) {
  let cleaned = text
    .replace(/\\\'/g, "'")
    .replace(/\\\./g, ".")
    .replace(/\\\)/g, ")")
    .replace(/\\`/g, "'")
    .replace(/\\/g, "")
    .replace(/\s+/g, ' ')
    .trim();
  
  // CHEMISTRY: Convert special characters to LaTeX
  cleaned = cleaned.replace(/∙/g, '\\cdot ');
  cleaned = cleaned.replace(/·/g, '\\cdot ');
  cleaned = cleaned.replace(/\\\*/g, ' \\cdot ');
  
  // CHEMISTRY: Convert Pandoc subscript/superscript to LaTeX format
  // NH~3~ → NH_3 (subscript)
  // 10^23^ → 10^{23} (superscript)
  cleaned = cleaned.replace(/([A-Za-z0-9\(\)])~([^~\s]+)~/g, '$1_$2');
  cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
  
  // CHEMISTRY: Fix duplicate patterns (X3X3 → X3, P2P2 → P2)
  cleaned = cleaned.replace(/([A-Z][a-z]?\d+)\1+/g, '$1');
  
  // CHEMISTRY: Fix XO → X_2O (add subscript if missing)
  cleaned = cleaned.replace(/\b([A-Z])O\s+ning/g, '$1_2O ning');
  cleaned = cleaned.replace(/\b([A-Z])O\s+ni/g, '$1_2O ni');
  
  // Kimyoviy formulalardagi bo'shliqlarni olib tashlash
  cleaned = cleaned.replace(/([A-Z][a-z]?)\s+(\d+)/g, '$1$2');
  
  // Reaksiya tenglamalarini formatlash
  cleaned = cleaned.replace(/->/g, '→');
  cleaned = cleaned.replace(/<->/g, '⇌');
  
  return cleaned;
}

// Test cases
const testCases = [
  {
    input: "(P)~2~ ning molyar massasi 454 g/mol bo'lsa",
    expected: "(P)_2 ning molyar massasi 454 g/mol bo'lsa"
  },
  {
    input: "X~3~(PO~4~)~2~ ning molyar massasi",
    expected: "X_3(PO_4)_2 ning molyar massasi"
  },
  {
    input: "10^23^ molekula",
    expected: "10^{23} molekula"
  },
  {
    input: "NH~3~ va H~2~O",
    expected: "NH_3 va H_2O"
  },
  {
    input: "X3X3(PO4O4)~2~",
    expected: "X3(PO4)_2"
  }
];

console.log('🧪 Testing Pandoc format conversion\n');
console.log('='.repeat(70));

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = cleanChemistryText(test.input);
  const success = result === test.expected;
  
  if (success) {
    passed++;
    console.log(`✅ Test ${index + 1}: PASSED`);
  } else {
    failed++;
    console.log(`❌ Test ${index + 1}: FAILED`);
    console.log(`   Input:    "${test.input}"`);
    console.log(`   Expected: "${test.expected}"`);
    console.log(`   Got:      "${result}"`);
  }
  console.log('─'.repeat(70));
});

console.log('\n' + '='.repeat(70));
console.log(`📊 Results: ${passed}/${testCases.length} passed`);
console.log('='.repeat(70));
