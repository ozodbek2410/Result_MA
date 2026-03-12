import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';

async function test() {
  const parser = new SmartUniversalParser();
  const filePath = path.resolve(__dirname, '..', 'test', 'matem.docx');
  console.log('Parsing:', filePath);
  const questions = await parser.parse(filePath);
  console.log('Total questions:', questions.length);
  
  for (const q of questions) {
    if (q.number >= 25 && q.number <= 27) {
      console.log('--- Q' + q.number + ' ---');
      console.log('text:', (q.text || '').substring(0, 100));
      console.log('imageUrl:', (q as any).imageUrl || 'none');
      console.log('imageWidth:', (q as any).imageWidth, 'imageHeight:', (q as any).imageHeight);
      console.log('media:', JSON.stringify((q as any).media || []));
      for (const v of q.variants) {
        const va = v as any;
        if (va.imageUrl) {
          console.log('  V-' + v.letter + ': img=' + va.imageUrl + ' w=' + va.imageWidth + ' h=' + va.imageHeight);
        }
      }
    }
  }
  
  // Check parser internals
  const p = parser as any;
  const keys = Object.keys(p).filter(k => k.toLowerCase().includes('image') || k.toLowerCase().includes('dim'));
  console.log('\nParser image-related keys:', keys);
  for (const k of keys) {
    const val = p[k];
    if (val instanceof Map) {
      console.log(k + ' (Map):');
      for (const [mk, mv] of val.entries()) {
        console.log('  ' + mk + ':', JSON.stringify(mv));
      }
    } else if (val) {
      console.log(k + ':', JSON.stringify(val).substring(0, 200));
    }
  }
}

test().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
