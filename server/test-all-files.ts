import { SmartUniversalParser } from './src/services/parsers/SmartUniversalParser';
import path from 'path';
import fs from 'fs';

const TEST_DIR = path.join(__dirname, '../test');

async function testFile(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const parser = new SmartUniversalParser();
  try {
    const questions = await parser.parse(filePath);
    const issues: string[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const allText = [q.text, ...q.variants.map(v => v.text)].join(' ');

      // Check for trailing backslash (e.g. "got\", "wet.\")
      if (/\\\s*$|\\\s+/.test(allText) || allText.includes('\\') && !allText.includes('\\(') && !allText.includes('\\)')) {
        const raw = allText.replace(/\n/g, ' ').substring(0, 100);
        issues.push(`  Q${i+1} backslash: ${raw}`);
      }
      // Check for \cdot not inside math
      if (/\\cdot/.test(allText)) {
        issues.push(`  Q${i+1} \\cdot: ${allText.substring(0, 80)}`);
      }
    }

    if (issues.length > 0) {
      console.log(`\n❌ ${fileName} (${questions.length}q):`);
      issues.forEach(i => console.log(i));
    } else {
      console.log(`✅ ${fileName} (${questions.length}q)`);
    }
  } catch (e: unknown) {
    console.log(`💥 ${fileName}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.docx'))
    .map(f => path.join(TEST_DIR, f));

  console.log(`Testing ${files.length} files...\n`);
  for (const file of files) {
    await testFile(file);
  }
}

main().catch(console.error);
