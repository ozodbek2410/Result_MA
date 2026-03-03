import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

async function main() {
  const p = new SmartUniversalParser();
  const qs = await p.parse(path.join(__dirname, '..', 'test', 'matem.docx'));
  const q7 = qs[6];
  console.log('Q7 text:', JSON.stringify(q7.text));
  console.log('Q7 variants:');
  for (const v of q7.variants) {
    console.log(`  ${v.letter}: ${JSON.stringify(v.text)}`);
  }
}
main().catch(console.error);
