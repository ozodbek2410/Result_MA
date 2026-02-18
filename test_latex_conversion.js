// LaTeX → OMML Test Script
// Senior dasturchilar qanday test qiladi

const latexToOmml = require('latex-to-omml');

// Test formulalar
const testCases = [
  // Oddiy
  { latex: '\\sqrt{2}', expected: 'ishlashi kerak' },
  { latex: '\\frac{1}{2}', expected: 'ishlashi kerak' },
  
  // Bo'shliqlar bilan
  { latex: '\\sqrt{2} + \\sqrt{3}', expected: 'muammo bo\'lishi mumkin' },
  { latex: '\\sqrt{2}+\\sqrt{3}', expected: 'ishlashi kerak' },
  
  // Murakkab
  { latex: '\\sqrt{\\sqrt{2}}', expected: 'ishlashi kerak' },
  { latex: '\\frac{\\sqrt{2}}{\\sqrt{3}}', expected: 'ishlashi kerak' },
  
  // Xatoli
  { latex: '\\sqrtt{2}', expected: 'xato' },
  { latex: '- \\sqrt{2}', expected: 'muammo' },
  { latex: '0,5', expected: 'xato (vergul)' },
];

console.log('🧪 LaTeX → OMML Test\n');

testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.latex}`);
  console.log(`Kutilgan: ${test.expected}`);
  
  try {
    const omml = latexToOmml(test.latex);
    console.log('✅ Natija: Muvaffaqiyatli');
    console.log(`OMML: ${omml.substring(0, 100)}...`);
  } catch (error) {
    console.log('❌ Natija: Xato');
    console.log(`Xato: ${error.message}`);
  }
  
  console.log('---\n');
});

// CleanLatex funksiyasi test
console.log('\n🧹 CleanLatex Test\n');

function cleanLatex(latex) {
  let cleaned = latex.trim();
  
  // Typo
  cleaned = cleaned.replace(/sqrrt/g, 'sqrt');
  cleaned = cleaned.replace(/sqrtt/g, 'sqrt');
  
  // Vergul → nuqta
  cleaned = cleaned.replace(/(\d),(\d)/g, '$1.$2');
  
  // 00. → 0.
  cleaned = cleaned.replace(/00\./g, '0.');
  
  // Bo'shliqlar
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\s*\+\s*/g, '+');
  cleaned = cleaned.replace(/\s*-\s*/g, '-');
  
  // Boshida minus
  if (cleaned.startsWith('-')) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
}

const cleanTests = [
  '\\sqrt{2} + \\sqrt{3}',
  '\\sqrtt{2}',
  '- \\sqrt{2}',
  '0,5',
  '00,9',
];

cleanTests.forEach(latex => {
  const cleaned = cleanLatex(latex);
  console.log(`Original: ${latex}`);
  console.log(`Cleaned:  ${cleaned}`);
  
  try {
    const omml = latexToOmml(cleaned);
    console.log('✅ Konvertatsiya: Muvaffaqiyatli\n');
  } catch (error) {
    console.log(`❌ Konvertatsiya: Xato - ${error.message}\n`);
  }
});
