const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

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
  const docxPath = path.join(__dirname, 'kimyo.docx');
  
  console.log('📄 kimyo.docx faylini markdown ga o\'girish...\n');
  
  const markdown = await extractTextWithPandoc(docxPath);
  
  // Save to file
  fs.writeFileSync('kimyo_markdown.txt', markdown, 'utf8');
  console.log('✅ Markdown fayl saqlandi: kimyo_markdown.txt\n');
  
  // Search for specific problems
  const lines = markdown.split('\n');
  
  console.log('='.repeat(70));
  console.log('🔍 MUAMMOLI QATORLARNI QIDIRISH');
  console.log('='.repeat(70));
  
  lines.forEach((line, idx) => {
    // Uglerod
    if (line.includes('Uglerod')) {
      console.log(`\n📌 ${idx + 1}-qator (Uglerod):`);
      console.log(`   ${line}`);
      if (line.includes('\\*')) {
        console.log('   ⚠️  \\ belgisi bor!');
      }
      if (line.includes('−24−24')) {
        console.log('   ⚠️  Minus belgisi muammosi!');
      }
    }
    
    // XO ning
    if (line.includes('XO ning') || line.includes('XO ni')) {
      console.log(`\n📌 ${idx + 1}-qator (XO):`);
      console.log(`   ${line}`);
      if (line.includes('bo\\`')) {
        console.log('   ⚠️  bo\\` belgisi bor!');
      }
      if (!line.includes('_')) {
        console.log('   ⚠️  Pastki indeks yo\'q (X_2O kerak)!');
      }
    }
  });
  
  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
