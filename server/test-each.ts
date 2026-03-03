import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

const FILE = process.argv[2] || '../test/ingliz.docx';

async function main() {
  const parser = new SmartUniversalParser();
  const questions = await parser.parse(path.resolve(__dirname, FILE));

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const texts = [q.text, ...q.variants.map(v => `${v.letter}: ${v.text}`)];
    const allText = texts.join(' | ');

    // Check for trailing backslash in words like "got\" "wet.\"
    const hasTrailingBackslash = /[a-zA-Z.]\\s/.test(allText) || /[a-zA-Z.]\$/.test(allText) || /[a-zA-Z.]\[|]/.test(allText);
    const hasCdot = /\cdot/.test(allText);

    if (hasTrailingBackslash || hasCdot) {
      console.log(`\nBAD Q${i + 1} [${q.correctAnswer}]:`);
      texts.forEach(t => console.log('  ' + t.substring(0, 120)));
    } else {
      console.log(`OK  Q${i + 1} [${q.correctAnswer}] ${q.text.substring(0, 60)}`);
    }
  }
  console.log(`\nTotal: ${questions.length}`);
}
main().catch(e => console.error('ERR:', e.message));
