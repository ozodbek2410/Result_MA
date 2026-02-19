const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

async function extractTextWithPandoc(docxPath) {
  try {
    const pandocPaths = [
      'pandoc',
      'C:\\Program Files\\Pandoc\\pandoc.exe',
      'C:\\Program Files (x86)\\Pandoc\\pandoc.exe',
      '/usr/local/bin/pandoc',
      '/usr/bin/pandoc',
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
    console.error('❌ Pandoc error:', error);
    throw new Error('Pandoc not found or failed to convert DOCX');
  }
}

async function main() {
  const docxPath = path.join(__dirname, 'onatili.docx');
  
  console.log('📄 Converting onatili.docx to markdown...\n');
  
  const markdown = await extractTextWithPandoc(docxPath);
  
  console.log('📝 First 2000 characters of markdown:');
  console.log('='.repeat(70));
  console.log(markdown.substring(0, 2000));
  console.log('='.repeat(70));
  
  // Find first question
  const lines = markdown.split('\n');
  console.log('\n📋 First 30 lines:');
  lines.slice(0, 30).forEach((line, idx) => {
    console.log(`${idx + 1}: ${line}`);
  });
}

main().catch(console.error);
