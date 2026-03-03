import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';
async function main() {
  const p = new SmartUniversalParser();
  const qs = await p.parse(path.join(__dirname, '..', 'test', 'matem.docx'));
  console.log('Q8 text:', qs[7].text);
}
main().catch(console.error);
