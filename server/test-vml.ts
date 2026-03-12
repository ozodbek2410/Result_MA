import AdmZip from 'adm-zip';

const zip = new AdmZip('c:/Users/ozodb/Desktop/Result_MA/test/matem.docx');
const doc = zip.getEntry('word/document.xml');
if (!doc) { console.log('No document.xml'); process.exit(1); }
const docXml = doc.getData().toString('utf-8');

// rId mapping
const rels = zip.getEntry('word/_rels/document.xml.rels');
const relsXml = rels!.getData().toString('utf-8');
const rIdMap = new Map<string, string>();
const relPattern = /Relationship[^>]*Id="(rId\d+)"[^>]*Target="media\/(image\d+\.[a-z]+)"/gi;
let relMatch;
while ((relMatch = relPattern.exec(relsXml)) !== null) {
  rIdMap.set(relMatch[1], relMatch[2]);
}
console.log('rId map:', Object.fromEntries(rIdMap));

// Test VML regex from BaseParser
const shapePattern = /v:shape[^>]*style="([^"]*)"[\s\S]*?v:imagedata[^>]*r:id="(rId\d+)"/gi;
let m;
let count = 0;
while ((m = shapePattern.exec(docXml)) !== null) {
  count++;
  const style = m[1];
  const rId = m[2];
  const filename = rIdMap.get(rId);
  const wMatch = style.match(/width:([\d.]+)(pt|in|cm|mm)/);
  const hMatch = style.match(/height:([\d.]+)(pt|in|cm|mm)/);
  console.log(`VML #${count}: ${rId} -> ${filename} | ${wMatch?.[0]} x ${hMatch?.[0]}`);
}
console.log(`Total VML matches: ${count}`);

if (count === 0) {
  // Debug: show raw XML around v:shape
  const idx = docXml.indexOf('v:shape');
  if (idx >= 0) {
    console.log('\nFirst v:shape context (500 chars):');
    console.log(docXml.substring(idx, idx + 500));
  }
}
