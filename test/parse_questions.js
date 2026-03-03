const fs = require('fs');
const xml = fs.readFileSync('test/questions_raw.xml', 'utf8');
const texts = [];
const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
let m;
while ((m = paraRegex.exec(xml)) !== null) {
  const para = m[0];
  const runs = [];
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let t;
  while ((t = tRegex.exec(para)) !== null) {
    runs.push(t[1]);
  }
  if (runs.length > 0) {
    texts.push(runs.join(''));
  }
}
console.log('=== QUESTIONS FILE PARAGRAPHS ===');
texts.forEach((t, i) => console.log(i + ':', JSON.stringify(t)));
