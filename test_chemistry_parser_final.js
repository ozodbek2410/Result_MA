// Test ChemistryParser cleanChemistryText method

function cleanChemistryText(text) {
  let cleaned = text
    .replace(/\\\'/g, "'")
    .replace(/\\\./g, ".")
    .replace(/\\\)/g, ")")
    .replace(/\\`/g, "'")  // bo\` → bo'
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // CHEMISTRY: Convert special characters to LaTeX
  cleaned = cleaned.replace(/∙/g, '\\cdot ');
  cleaned = cleaned.replace(/·/g, '\\cdot ');
  
  // CHEMISTRY: Fix escaped asterisk (1,66\*10 → 1,66 \cdot 10)
  cleaned = cleaned.replace(/\\\*/g, ' \\cdot ');
  
  // CHEMISTRY: Convert Pandoc subscript/superscript to LaTeX format
  cleaned = cleaned.replace(/([A-Za-z0-9])~([^~\s]+)~/g, '$1_$2');
  cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
  
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

console.log('='.repeat(70));
console.log('🧪 CHEMISTRY PARSER - cleanChemistryText TEST');
console.log('='.repeat(70));

const testCases = [
  {
    name: '13-savol (XO ning)',
    input: 'XO ning molyar massasi 28g/mol bo\\`lsa , X elementni aniqlang.',
    expected: 'X_2O ning molyar massasi 28g/mol bo\'lsa , X elementni aniqlang.'
  },
  {
    name: '22-savol (Uglerod)',
    input: '(1 u.b = 1,66\\*10^-24^ g )',
    expected: '(1 u.b = 1,66 \\cdot 10^{-24} g )'
  },
  {
    name: 'Pandoc subscript',
    input: 'H~2~SO~4~',
    expected: 'H_2SO_4'
  },
  {
    name: 'Pandoc superscript',
    input: '10^23^',
    expected: '10^{23}'
  }
];

testCases.forEach((test, idx) => {
  console.log(`\n📝 Test ${idx + 1}: ${test.name}`);
  console.log(`   Input:    ${test.input}`);
  
  const result = cleanChemistryText(test.input);
  console.log(`   Output:   ${result}`);
  console.log(`   Expected: ${test.expected}`);
  
  if (result === test.expected) {
    console.log(`   ✅ PASS`);
  } else {
    console.log(`   ❌ FAIL`);
  }
});

console.log('\n' + '='.repeat(70));
