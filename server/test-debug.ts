import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

const testDir = path.join(__dirname, '..', 'test');
const fileName = process.argv[2] || '8-sinf Tibbiyot B #Blok test @Fevral 22.02.2026.docx';

async function main() {
  const parser = new SmartUniversalParser();
  const filePath = path.join(testDir, fileName);

  console.log(`FILE: ${fileName}\n`);

  const questions = await parser.parse(filePath);
  const detectedType = parser.getDetectedType();

  console.log(`\nDetected type: ${detectedType}`);
  console.log(`Total questions: ${questions.length}`);
  console.log(`Full (4 variants): ${questions.filter(q => q.variants.length === 4).length}`);
  console.log('');

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const textPreview = q.text.substring(0, 120).replace(/\n/g, ' ');
    const correctMark = q.correctAnswer && q.correctAnswer !== 'A' ? ` [correct=${q.correctAnswer}]` : '';
    const varCount = q.variants.length;
    const emptyVars = q.variants.filter(v => !v.text || v.text.trim() === '').length;
    const varInfo = emptyVars > 0 ? ` (${emptyVars} empty)` : '';

    console.log(`  ${String(i + 1).padStart(3)}. [${varCount} var${varInfo}]${correctMark} ${textPreview}`);

    if (varCount !== 4 || emptyVars > 0) {
      for (const v of q.variants) {
        const vText = v.text ? v.text.substring(0, 80).replace(/\n/g, ' ') : '(EMPTY)';
        console.log(`       ${v.letter}) ${vText}`);
      }
    }
  }
}

main().catch(console.error);
