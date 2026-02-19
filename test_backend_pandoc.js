/**
 * Test backend ChemistryParser Pandoc conversion
 */

// Simulate backend cleanChemistryText
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
  
  // UPDATED: Include parentheses in regex
  cleaned = cleaned.replace(/([A-Za-z0-9\(\)])~([^~\s]+)~/g, '$1_$2');
  cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
  
  cleaned = cleaned.replace(/([A-Z][a-z]?\d+)\1+/g, '$1');
  cleaned = cleaned.replace(/\b([A-Z])O\s+ning/g, '$1_2O ning');
  cleaned = cleaned.replace(/\b([A-Z])O\s+ni/g, '$1_2O ni');
  cleaned = cleaned.replace(/([A-Z][a-z]?)\s+(\d+)/g, '$1$2');
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
    input: "X3(P O4)~2~ ning molyar massasi",
    expected: "X3(P O4)_2 ning molyar massasi"
  }
];

console.log('🧪 Testing Backend ChemistryParser Pandoc conversion\n');
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
