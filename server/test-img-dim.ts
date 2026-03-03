import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';
import fs from 'fs';

async function main() {
  const p = new SmartUniversalParser();
  const qs = await p.parse(path.join(__dirname, '..', 'test', 'matem.docx'));

  // Q20 = index 19, image1.wmf
  const q20 = qs[19];
  console.log('\nQ20 (image1):');
  console.log('  imageWidth:', q20.imageWidth, 'imageHeight:', q20.imageHeight);
  console.log('  imageUrl:', q20.imageUrl);

  // Check actual PNG file dimensions
  if (q20.imageUrl) {
    const pngPath = path.join(__dirname, '..', q20.imageUrl);
    if (fs.existsSync(pngPath)) {
      const buf = fs.readFileSync(pngPath);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      console.log('  PNG natural:', w, 'x', h);
      console.log('  Display at VML:', q20.imageWidth, 'x', q20.imageHeight);
      console.log('  Scale factor:', (q20.imageWidth! / w).toFixed(3));
    }
  }
}
main().catch(console.error);
