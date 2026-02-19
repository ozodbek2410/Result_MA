const fs = require('fs');
const path = require('path');

// Simulate the extractOptions method
function extractOptions(line) {
  const options = [];
  
  line = line.replace(/\\\)/g, ')').replace(/\\\./g, '.').replace(/\\\'/g, "'");

  // Pattern 1: A) text B) text C) text D) text (with parentheses)
  const withParen = /([A-D])\)\s*([^A-D)]+?)(?=\s*[A-D]\)|$)/g;
  let match;
  
  while ((match = withParen.exec(line)) !== null) {
    const [, label, text] = match;
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      options.push({ label, text: trimmed });
    }
  }
  
  if (options.length >= 2) return options;

  // Pattern 2: A text B text C text D text (without parentheses)
  const noParenMulti = /([A-D])\s+([^A-D]+?)(?=\s+[A-D]\s+|$)/g;
  let found = false;
  
  while ((match = noParenMulti.exec(line)) !== null) {
    const [, label, text] = match;
    const trimmed = text.trim();
    if (trimmed.length > 0 && /^[A-D]$/.test(label)) {
      options.push({ label, text: trimmed });
      found = true;
    }
  }
  
  if (found && options.length >= 2) return options;

  // Pattern 3: A) text (single - only if no other options found)
  const noParenSingle = /^([A-D])\s+(.+)$/;
  const singleMatch = noParenSingle.exec(line);
  if (singleMatch && !/ [B-D][\)\.\s]/.test(line)) {
    const [, label, text] = singleMatch;
    options.push({ label, text: text.trim() });
    return options;
  }

  return options;
}

// Test cases from onatili.docx
const testCases = [
  // Question 1 - inline format
  "A) daftar//varag'i, temir-tersak B) qarindosh//urug', katta//kichik C) nim//qorong'i, ustiga//ustak D)biri//yo'la, odob//axloq",
  
  // Question 9 - has correct answers
  "A) Inson o'z hayotida ko'p narsalarni ko'radi. B) Inson o'z hayotida ko'p narsalarni ko'radi. C) Inson o'z hayotida ko'p narsalarni ko'radi. D) Inson o'z hayotida ko'p narsalarni ko'radi.",
  
  // Question with escaped characters
  "A\\) daftar\\/\\/varag'i B\\) qarindosh\\/\\/urug' C\\) nim\\/\\/qorong'i D\\)biri\\/\\/yo'la",
  
  // Simple format
  "A) text1 B) text2 C) text3 D) text4"
];

console.log('='.repeat(70));
console.log('LITERATURE PARSER - extractOptions TEST');
console.log('='.repeat(70));

testCases.forEach((testCase, idx) => {
  console.log(`\n📝 Test Case ${idx + 1}:`);
  console.log(`Input: ${testCase.substring(0, 100)}...`);
  
  const result = extractOptions(testCase);
  
  console.log(`✅ Found ${result.length} options:`);
  result.forEach(opt => {
    console.log(`   ${opt.label}) ${opt.text.substring(0, 50)}...`);
  });
  
  if (result.length < 4) {
    console.log(`⚠️  WARNING: Only ${result.length}/4 options found!`);
  }
});

console.log('\n' + '='.repeat(70));
