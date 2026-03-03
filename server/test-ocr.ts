import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

async function main() {
  const p = new SmartUniversalParser();
  const qs = await p.parse(path.join(__dirname, '..', 'test', 'matem.docx'));

  qs.forEach((q, i) => {
    if (q.imageUrl) {
      console.log(`Q${i + 1}: imageUrl=${q.imageUrl} dims=${q.imageWidth}x${q.imageHeight}`);
    }
    q.variants?.forEach((v: any) => {
      if (v.imageUrl) {
        console.log(`  V${v.letter}: imageUrl=${v.imageUrl}`);
      }
    });
  });
}
main().catch(console.error);
