const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

async function extractTextWithPandoc(docxPath) {
  try {
    const pandocPaths = [
      'pandoc',
      'C:\\Program Files\\Pandoc\\pandoc.exe',
    ];

    let pandocPath = 'pandoc';
    for (const testPath of pandocPaths) {
      try {
        await execFileAsync(testPath, ['--version']);
        pandocPath = testPath;
        break;
      } catch {
        continue;
      }
    }

    const { stdout } = await execFileAsync(pandocPath, [
      docxPath,
      '-t', 'markdown',
      '--wrap=none',
      '--markdown-headings=atx'
    ]);

    return stdout;
  } catch (error) {
    console.error('❌ Pandoc xato:', error);
    throw new Error('Pandoc topilmadi');
  }
}

async function main() {
  const docxPath = path.join(__dirname, 'onatili.docx');
  
  console.log('📄 onatili.docx faylini markdown ga o\'girish...\n');
  
  const markdown = await extractTextWithPandoc(docxPath);
  
  // Barcha savollarni topish
  const questionPattern = /^(\d+)\\\.\s*(.+)/gm;
  const matches = Array.from(markdown.matchAll(questionPattern));
  
  console.log('='.repeat(70));
  console.log(`📊 JAMI TOPILGAN SAVOLLAR: ${matches.length}`);
  console.log('='.repeat(70));
  
  matches.forEach((match, idx) => {
    const [fullMatch, number, text] = match;
    console.log(`\n${idx + 1}. Savol raqami: ${number}`);
    console.log(`   Matn: ${text.substring(0, 80)}...`);
  });
  
  console.log('\n' + '='.repeat(70));
  console.log('📝 TO\'LIQ MARKDOWN:');
  console.log('='.repeat(70));
  console.log(markdown);
}

main().catch(console.error);
