import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

async function main() {
  const parser = new SmartUniversalParser();
  const filePath = path.join(__dirname, '..', 'test', 'matem.docx');

  const questions = await parser.parse(filePath);

  // Q22 (import page) = Q23 (parser, 1-indexed) = index 22
  // Check Q22, Q23, Q29 specifically
  const checkIdxs = [21, 22, 28]; // 0-indexed

  for (const idx of checkIdxs) {
    const q = questions[idx];
    if (!q) continue;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Q${idx + 1} FULL text:`);
    console.log(q.text);
    console.log(`\nQ${idx + 1} text type: ${typeof q.text}`);
    console.log(`Q${idx + 1} has \\(: ${q.text.includes('\\(')}`);
    console.log(`Q${idx + 1} has \\): ${q.text.includes('\\)')}`);
    console.log(`\nQ${idx + 1} variants:`);
    for (const v of q.variants) {
      console.log(`  ${v.letter}) ${v.text}`);
      console.log(`     type=${typeof v.text}, has\\(=${v.text.includes('\\(')}, has\\)=${v.text.includes('\\)')}`);
    }
  }

  console.log(`\nTotal: ${questions.length} questions`);
}

main().catch(console.error);
