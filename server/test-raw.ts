import { execSync } from 'child_process';
import path from 'path';

const testDir = path.join(__dirname, '..', 'test');
const fileName = process.argv[2] || '8-sinf Tibbiyot B #Blok test @Fevral 22.02.2026.docx';
const filePath = path.join(testDir, fileName);

// Get raw pandoc markdown
const pandocPaths = ['pandoc', 'C:\\Program Files\\Pandoc\\pandoc.exe'];
let rawMd = '';
for (const p of pandocPaths) {
  try {
    rawMd = execSync(`"${p}" "${filePath}" -t markdown --wrap=none`, { encoding: 'utf-8', timeout: 30000 });
    break;
  } catch { /* try next */ }
}

console.log(rawMd);
