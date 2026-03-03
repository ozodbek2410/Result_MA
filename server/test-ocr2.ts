import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

async function main() {
  const p = new SmartUniversalParser();
  const qs = await p.parse(path.join(__dirname, '..', 'test', 'matem.docx'));
  const q20 = qs[19];
  const q21 = qs[20];
  console.log('Q20 text:', q20.text);
  console.log('Q20 variants:');
  for (const v of q20.variants) {
    console.log(`  ${v.letter}: text="${v.text}" img=${v.imageUrl || 'none'}`);
  }
  console.log('\nQ21 text:', q21.text);
  console.log('Q21 variants:');
  for (const v of q21.variants) {
    console.log(`  ${v.letter}: text="${v.text}" img=${v.imageUrl || 'none'}`);
  }
}
main().catch(console.error);
