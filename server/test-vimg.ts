import path from 'path';
import { ImportOrchestrator } from './src/services/parsers/ImportOrchestrator';

const docxPath = path.resolve(__dirname, '../test/New folder/mart 9-B.docx');

async function main() {
  const orchestrator = new ImportOrchestrator();
  const result = await orchestrator.parseDocx(docxPath);

  console.log(`Questions: ${result.count} | Parser: ${result.parserUsed}\n`);
  // Show Q26-Q30 specifically
  result.questions.slice(25, 30).forEach((q, i) => {
    const qNum = i + 26;
    console.log(`Q${qNum}: ${q.text.substring(0, 80)}`);
    q.variants.forEach(v => {
      const hasImg = v.imageUrl ? `[IMG: ${v.imageUrl.substring(0, 40)}...]` : '';
      const mark = v.letter === q.correctAnswer ? '✓' : ' ';
      console.log(`  ${mark}${v.letter}) "${v.text}" ${hasImg}`);
    });
    console.log('');
  });
}

main().catch(console.error);
