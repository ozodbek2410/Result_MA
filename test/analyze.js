const fs = require('fs');
const xml = fs.readFileSync('test/questions_raw.xml', 'utf8');

// Extract paragraphs
const texts = [];
const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
let m;
while ((m = paraRegex.exec(xml)) !== null) {
  const para = m[0];
  const runs = [];
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let t;
  while ((t = tRegex.exec(para)) !== null) {
    runs.push(t[1]);
  }
  if (runs.length > 0) {
    texts.push(runs.join(''));
  }
}

// Parse questions
const questions = [];
const optionRegex = /A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*)/;

for (let i = 0; i < texts.length; i++) {
  const line = texts[i].trim();
  if (!line) continue;
  
  const match = line.match(optionRegex);
  if (match) {
    // Extract question text (everything before A))
    const aIdx = line.indexOf('A)');
    const questionText = aIdx > 0 ? line.substring(0, aIdx).trim() : '';
    
    questions.push({
      num: questions.length + 1,
      text: questionText,
      A: match[1].trim(),
      B: match[2].trim(),
      C: match[3].trim(),
      D: match[4].trim(),
    });
  }
}

// Parse answers
const answersXml = fs.readFileSync('test/answers_raw.xml', 'utf8');
const ansTexts = [];
const paraRegex2 = /<w:p[ >][\s\S]*?<\/w:p>/g;
while ((m = paraRegex2.exec(answersXml)) !== null) {
  const para = m[0];
  const runs = [];
  const tRegex2 = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let t2;
  while ((t2 = tRegex2.exec(para)) !== null) {
    runs.push(t2[1]);
  }
  if (runs.length > 0) {
    ansTexts.push(runs.join(''));
  }
}

const answerKey = {};
for (const line of ansTexts) {
  const am = line.trim().match(/^(\d+)\s+([A-D])$/);
  if (am) {
    answerKey[parseInt(am[1])] = am[2];
  }
}

// Output
console.log('========================================');
console.log('  INGLIZ TILI - DOCX ANALYSIS');
console.log('========================================');
console.log('Total questions found:', questions.length);
console.log('Total answers found:', Object.keys(answerKey).length);
console.log('');

console.log('--- ANSWER KEY ---');
for (let i = 1; i <= 30; i++) {
  console.log(`  ${String(i).padStart(2)}) ${answerKey[i] || '?'}`);
}
console.log('');

console.log('--- QUESTIONS WITH ANSWERS ---');
for (const q of questions) {
  const correct = answerKey[q.num] || '?';
  console.log(`\n${q.num}. ${q.text}`);
  console.log(`   A) ${q.A}`);
  console.log(`   B) ${q.B}`);
  console.log(`   C) ${q.C}`);
  console.log(`   D) ${q.D}`);
  console.log(`   >> Correct: ${correct}`);
}
