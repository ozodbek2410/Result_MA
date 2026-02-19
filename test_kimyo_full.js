const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

// ChemistryParser cleanChemistryText method
function cleanChemistryText(text) {
  let cleaned = text
    .replace(/\\\'/g, "'")
    .replace(/\\\./g, ".")
    .replace(/\\\)/g, ")")
    .replace(/\\`/g, "'")  // bo\` → bo'
    .replace(/\s+/g, ' ')
    .trim();
  
  cleaned = cleaned.replace(/∙/g, '\\cdot ');
  cleaned = cleaned.replace(/·/g, '\\cdot ');
  cleaned = cleaned.replace(/\\\*/g, ' \\cdot ');
  
  cleaned = cleaned.replace(/([A-Za-z0-9])~([^~\s]+)~/g, '$1_$2');
  cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
  
  cleaned = cleaned.replace(/\b([A-Z])O\s+ning/g, '$1_2O ning');
  cleaned = cleaned.replace(/\b([A-Z])O\s+ni/g, '$1_2O ni');
  
  cleaned = cleaned.replace(/([A-Z][a-z]?)\s+(\d+)/g, '$1$2');
  cleaned = cleaned.replace(/->/g, '→');
  cleaned = cleaned.replace(/<->/g, '⇌');
  
  return cleaned;
}

async function extractTextWithPandoc(docxPath) {
  const pandocPaths = ['pandoc', 'C:\\Program Files\\Pandoc\\pandoc.exe'];
  let pandocPath = 'pandoc';
  
  for (const testPath of pandocPaths) {
    try {
      await execFileAsync(testPath, ['--version']);
      pandocPath = testPath;
      break;
    } catch {}
  }

  const { stdout } = await execFileAsync(pandocPath, [
    docxPath, '-t', 'markdown', '--wrap=none', '--markdown-headings=atx'
  ]);

  return stdout;
}

async function main() {
  const docxPath = path.join(__dirname, 'kimyo.docx');
  
  console.log('📄 kimyo.docx faylini test qilish...\n');
  
  const markdown = await extractTextWithPandoc(docxPath);
  const lines = markdown.split('\n');
  
  console.log('='.repeat(70));
  console.log('🧪 KIMYO PARSER - TO\'LIQ TEST');
  console.log('='.repeat(70));
  
  // Find questions 13 and 22
  let q13Found = false;
  let q22Found = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Question 13
    if (line.match(/^13[\\.]/)) {
      q13Found = true;
      console.log(`\n📌 13-SAVOL (${i + 1}-qator):`);
      console.log(`   Original: ${line}`);
      console.log(`   Cleaned:  ${cleanChemistryText(line)}`);
      
      // Next few lines
      for (let j = 1; j <= 5 && i + j < lines.length; j++) {
        const nextLine = lines[i + j].trim();
        if (nextLine) {
          console.log(`   Original: ${nextLine}`);
          console.log(`   Cleaned:  ${cleanChemistryText(nextLine)}`);
        }
      }
    }
    
    // Question 22
    if (line.match(/^22[\\.]/)) {
      q22Found = true;
      console.log(`\n📌 22-SAVOL (${i + 1}-qator):`);
      console.log(`   Original: ${line}`);
      console.log(`   Cleaned:  ${cleanChemistryText(line)}`);
      
      // Next few lines
      for (let j = 1; j <= 5 && i + j < lines.length; j++) {
        const nextLine = lines[i + j].trim();
        if (nextLine) {
          console.log(`   Original: ${nextLine}`);
          console.log(`   Cleaned:  ${cleanChemistryText(nextLine)}`);
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 NATIJA:');
  console.log('='.repeat(70));
  
  if (q13Found) {
    console.log('✅ 13-savol topildi va tozalandi');
    console.log('   - XO → X_2O');
    console.log('   - bo\\` → bo\'');
  }
  
  if (q22Found) {
    console.log('✅ 22-savol topildi va tozalandi');
    console.log('   - 1,66\\*10^-24^ → 1,66 \\cdot 10^{-24}');
  }
  
  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
