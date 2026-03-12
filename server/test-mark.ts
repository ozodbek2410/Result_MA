import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';

async function test() {
  const parser = new SmartUniversalParser();
  const questions = await parser.parse('./uploads/file-1772004039695-191760001.docx');

  // Check ALL questions for raw LaTeX issues
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const hasRawLatex = q.text.includes('\\frac') || q.text.includes('\\sqrt') || q.text.includes('{=html}');
    const variantIssue = q.variants.some(v =>
      v.text.includes('\\frac') || v.text.includes('{=html}') || v.text.includes(']{.mark}')
    );
    if (hasRawLatex || variantIssue) {
      console.log('Q' + (i+1) + ' [ISSUE] text: ' + q.text.substring(0, 100));
      for (const v of q.variants) {
        if (v.text.includes('\\frac') || v.text.includes('{=html}')) {
          console.log('  ' + v.letter + ': ' + v.text.substring(0, 80));
        }
      }
    }
  }

  // Also check Q22, Q23 specifically
  for (const idx of [21, 22]) {
    const q = questions[idx];
    if (!q) continue;
    console.log('---');
    console.log('Q' + (idx+1) + ' correct=' + q.correctAnswer);
    console.log('  FULL text: ' + q.text);
    for (const v of q.variants) {
      console.log('  ' + v.letter + ': ' + v.text);
    }
  }
  console.log('Total:', questions.length);
}
test().catch(e => console.error('ERR:', e.message));
