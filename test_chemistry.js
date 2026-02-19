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
  const docxPath = path.join(__dirname, 'kimyo.docx');
  
  console.log('📄 kimyo.docx faylini markdown ga o\'girish...\n');
  
  const markdown = await extractTextWithPandoc(docxPath);
  
  // 3 va 5-savollarni topish
  const lines = markdown.split('\n');
  
  console.log('='.repeat(70));
  console.log('🔍 3 VA 5-SAVOLLARNI QIDIRISH');
  console.log('='.repeat(70));
  
  let foundQ3 = false;
  let foundQ5 = false;
  let q3Lines = [];
  let q5Lines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 3-savol
    if (line.match(/^3[\\.\\)]/)) {
      foundQ3 = true;
      foundQ5 = false;
      console.log(`\n📌 3-SAVOL topildi (${i + 1}-qator):`);
    }
    
    // 5-savol
    if (line.match(/^5[\\.\\)]/)) {
      foundQ5 = true;
      foundQ3 = false;
      console.log(`\n📌 5-SAVOL topildi (${i + 1}-qator):`);
    }
    
    // 6-savol (5-savol tugadi)
    if (line.match(/^6[\\.\\)]/)) {
      foundQ5 = false;
    }
    
    // 4-savol (3-savol tugadi)
    if (line.match(/^4[\\.\\)]/)) {
      foundQ3 = false;
    }
    
    if (foundQ3) {
      q3Lines.push(line);
      console.log(`   ${line}`);
    }
    
    if (foundQ5) {
      q5Lines.push(line);
      console.log(`   ${line}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 TAHLIL:');
  console.log('='.repeat(70));
  
  console.log('\n3-SAVOL:');
  console.log('─'.repeat(70));
  q3Lines.forEach(line => console.log(line));
  
  console.log('\n\n5-SAVOL:');
  console.log('─'.repeat(70));
  q5Lines.forEach(line => console.log(line));
  
  console.log('\n' + '='.repeat(70));
  console.log('🔍 MUAMMOLAR:');
  console.log('='.repeat(70));
  
  const q3Text = q3Lines.join(' ');
  const q5Text = q5Lines.join(' ');
  
  // Check for backslashes
  if (q3Text.includes('\\*') || q3Text.includes('\\-')) {
    console.log('⚠️  3-savolda \\ belgilar bor (1,66\\*10−24−24)');
  }
  
  if (q5Text.includes('bo\\`')) {
    console.log('⚠️  5-savolda \\ belgilar bor (bo\\`)');
  }
  
  if (q5Text.includes('XO') && !q5Text.includes('X_')) {
    console.log('⚠️  5-savolda XO pastki indeks yo\'q (X_2O kerak)');
  }
}

main().catch(console.error);
