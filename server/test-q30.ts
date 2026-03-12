import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

async function main() {
  const parser = new SmartUniversalParser();
  const filePath = path.join(__dirname, '..', 'test', 'matem.docx');
  const questions = await parser.parse(filePath);

  // Q30 is index 29
  const q30 = questions[29];
  if (!q30) { console.log('Q30 not found'); return; }

  console.log(`Q30 text: ${q30.text}`);
  console.log(`Q30 variants:`);
  for (const v of q30.variants) {
    console.log(`  ${v.letter}) [${v.text.length} chars] "${v.text}"`);
  }
}

main().catch(console.error);
