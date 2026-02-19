const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * 🧪 CHEMISTRY PARSER TEST - 100% ACCURACY
 */

class ChemistryParserTest {
  async parseDocx(filePath) {
    console.log('🧪 CHEMISTRY PARSER TEST\n');
    const startTime = Date.now();

    const mdPath = await this.convertToMarkdown(filePath);
    const content = fs.readFileSync(mdPath, 'utf-8');
    fs.unlinkSync(mdPath);

    const questions = this.parse(content);

    const totalTime = Date.now() - startTime;
    console.log(`\n✅ TOTAL: ${totalTime}ms for ${questions.length} questions\n`);

    return questions;
  }

  async convertToMarkdown(docxPath) {
    const mdPath = docxPath.replace(/\.docx$/, '_parsed.md');
    await execAsync(`pandoc "${docxPath}" -t markdown -o "${mdPath}"`);
    return mdPath;
  }

  parse(content) {
    const lines = content.split('\n');
    const questions = [];
    let state = 'IDLE';
    let current = null;
    let variantLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line || line.includes('---') || line.includes('|')) {
        continue;
      }

      // PRIORITY 1: OPTIONS
      if (/^[A-D][\)\.\\\)\s]/.test(line)) {
        if (current) {
          // Variantlarni qo'shish
          if (variantLines.length > 0) {
            current.text += '\n\n' + variantLines.map(v => this.cleanChemistryText(v)).join(' ');
            variantLines = [];
          }
          
          const options = this.extractOptions(line);
          current.options.push(...options);
          
          if (current.options.length >= 4) {
            questions.push(current);
            current = null;
            state = 'IDLE';
          } else {
            state = 'OPTIONS';
          }
        }
        continue;
      }

      // PRIORITY 2: QUESTION or VARIANT
      const match = line.match(/^(\d+)[\\.]\s*(.+)/);
      if (match) {
        const [, number, text] = match;
        const num = parseInt(number);

        if (num < 1 || num > 100) continue;

        // SPECIAL: Agar matn ")" bilan boshlanadi yoki juda qisqa bo'lsa, bu variant
        if (text.startsWith(')') || (text.length < 20 && !this.isChemistryQuestion(text))) {
          if (current && state === 'QUESTION') {
            variantLines.push(line);
            state = 'VARIANTS';
          }
          continue;
        }

        if (this.isChemistryQuestion(text)) {
          if (current) {
            // Variantlarni qo'shish
            if (variantLines.length > 0) {
              current.text += '\n\n' + variantLines.map(v => this.cleanChemistryText(v)).join(' ');
              variantLines = [];
            }
            questions.push(current);
          }

          current = {
            number: num,
            text: this.cleanChemistryText(text),
            options: []
          };
          state = 'QUESTION';
          variantLines = [];
        }
        continue;
      }

      // PRIORITY 3: Continue state
      if (current) {
        if (state === 'QUESTION' && line.length > 10) {
          current.text += ' ' + this.cleanChemistryText(line);
        } else if (state === 'VARIANTS') {
          const numberCount = (line.match(/\d+[\.\)]/g) || []).length;
          if (numberCount >= 2) {
            variantLines.push(line);
          }
        }
      }
    }

    if (current) {
      // Variantlarni qo'shish
      if (variantLines.length > 0) {
        current.text += '\n\n' + variantLines.map(v => this.cleanChemistryText(v)).join(' ');
      }
      questions.push(current);
    }

    return questions;
  }

  isChemistryQuestion(text) {
    // 1. ? belgisi bor → SAVOL
    if (text.includes('?')) return true;
    
    // 2. "aniqlang", "toping", "hisoblang" so'zlari → SAVOL
    if (text.toLowerCase().includes('aniqlang')) return true;
    if (text.toLowerCase().includes('toping')) return true;
    if (text.toLowerCase().includes('hisoblang')) return true;
    
    // 3. "necha", "qancha", "qaysi" so'zlari → SAVOL
    if (text.toLowerCase().includes('necha')) return true;
    if (text.toLowerCase().includes('qancha')) return true;
    if (text.toLowerCase().includes('qaysi')) return true;
    
    // 4. Uzun + katta harf → SAVOL
    const isLong = text.length > 30;
    const startsWithUpper = text[0] === text[0].toUpperCase();
    return isLong && startsWithUpper;
  }

  cleanChemistryText(text) {
    let cleaned = text
      .replace(/\\\'/g, "'")
      .replace(/\\\./g, ".")
      .replace(/\\\)/g, ")")
      .replace(/\s+/g, ' ')
      .trim();
    
    // CHEMISTRY: Convert special characters
    cleaned = cleaned.replace(/∙/g, '\\cdot ');
    cleaned = cleaned.replace(/·/g, '\\cdot ');
    
    // CHEMISTRY: Convert Pandoc subscript/superscript to LaTeX format
    // NH~3~ → NH_3 (subscript)
    // 10^23^ → 10^{23} (superscript)
    cleaned = cleaned.replace(/([A-Za-z0-9])~([^~\s]+)~/g, '$1_$2');
    cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
    
    // Kimyoviy formulalardagi bo'shliqlarni olib tashlash
    cleaned = cleaned.replace(/([A-Z][a-z]?)\s+(\d+)/g, '$1$2');
    
    // Reaksiya tenglamalarini formatlash
    cleaned = cleaned.replace(/->/g, '→');
    cleaned = cleaned.replace(/<->/g, '⇌');
    
    return cleaned;
  }

  extractOptions(line) {
    const options = [];
    
    line = line.replace(/\\\)/g, ')').replace(/\\\./g, '.').replace(/\\\'/g, "'");

    const noParenMulti = /([A-D])\s+([^A-D]+?)(?=\s+[A-D]\s+|$)/g;
    let match;
    let found = false;
    
    while ((match = noParenMulti.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0 && /^[A-D]$/.test(label)) {
        options.push({ label, text: this.cleanChemistryText(trimmed) });
        found = true;
      }
    }
    
    if (found && options.length > 0) return options;

    const noParenSingle = line.match(/^([A-D])\s+(.+)$/);
    if (noParenSingle && !/ [B-D][\)\.\s]/.test(line)) {
      const [, label, text] = noParenSingle;
      options.push({ label, text: this.cleanChemistryText(text.trim()) });
      return options;
    }

    const separator = line.match(/^[A-D]([\.\)])/)?.[1] || ')';
    
    const multiPattern = separator === '.'
      ? /([A-D])\.\s*(.+?)(?=\s+[A-D]\.|$)/g
      : /([A-D])\)\s*(.+?)(?=\s+[A-D]\)|$)/g;
    
    while ((match = multiPattern.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        options.push({ label, text: this.cleanChemistryText(trimmed) });
      }
    }

    return options;
  }
}

// Test
const parser = new ChemistryParserTest();
const filePath = process.argv[2] || 'kimyo.docx';

parser.parseDocx(filePath).then(questions => {
  console.log('=== BARCHA SAVOLLAR ===\n');
  
  let fullCount = 0;
  let issueCount = 0;
  const issues = [];
  
  questions.forEach((q, i) => {
    const status = q.options.length >= 4 ? '✅' : '⚠️';
    console.log(`${status} ${i + 1}. Q${q.number}: ${q.text.substring(0, 50)}...`);
    console.log(`   📝 Javoblar: ${q.options.length}/4`);
    
    if (q.options.length >= 4) {
      fullCount++;
    } else {
      issueCount++;
      issues.push({
        number: q.number,
        text: q.text,
        optionCount: q.options.length,
        options: q.options
      });
    }
  });
  
  console.log('\n=== NATIJA ===');
  console.log(`✅ Jami: ${questions.length}/30`);
  console.log(`✅ To'liq (4 javob): ${fullCount}`);
  console.log(`⚠️  Kamchilik: ${issueCount}`);
  console.log(`\n🎯 Muvaffaqiyat: ${(fullCount / 30 * 100).toFixed(1)}%`);
  
  // XATOLARNI BATAFSIL KO'RSATISH
  if (issues.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 XATOLAR BATAFSIL (Qo\'lda tuzatish kerak)');
    console.log('='.repeat(70));
    
    issues.forEach((issue, idx) => {
      console.log(`\n📌 XATO #${idx + 1}: Savol ${issue.number}`);
      console.log('─'.repeat(70));
      console.log(`📝 Savol matni:`);
      console.log(`   ${issue.text}`);
      console.log(`\n⚠️  Muammo: ${issue.optionCount}/4 javob topildi`);
      console.log(`\n📋 Topilgan javoblar:`);
      
      if (issue.options.length > 0) {
        issue.options.forEach(opt => {
          console.log(`   ${opt.label}) ${opt.text}`);
        });
      } else {
        console.log(`   (Hech qanday javob topilmadi)`);
      }
      
      console.log(`\n💡 Tavsiya:`);
      if (issue.optionCount === 0) {
        console.log(`   - Javoblar qatori formatini tekshiring`);
        console.log(`   - A) B) C) D) formatda yozilganligini tasdiqlang`);
      } else if (issue.optionCount < 4) {
        console.log(`   - ${4 - issue.optionCount} ta javob yo'qolgan`);
        console.log(`   - Javoblar orasida probel yoki format xatosi bo'lishi mumkin`);
        console.log(`   - Word faylida javoblar qatorini tekshiring`);
      }
      
      console.log('─'.repeat(70));
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('📝 QO\'LDA TUZATISH KERAK:');
    console.log('='.repeat(70));
    console.log(`1. kimyo.docx faylini oching`);
    console.log(`2. Yuqoridagi savol raqamlarini toping (${issues.map(i => `Q${i.number}`).join(', ')})`);
    console.log(`3. Javoblar qatorini tekshiring va to'g'rilang`);
    console.log(`4. Format: A)javob1 B)javob2 C)javob3 D)javob4`);
    console.log(`5. Qayta test qiling: node test_chemistry_parser.js`);
    console.log('='.repeat(70) + '\n');
  }
  
  // Save to JSON
  fs.writeFileSync('chemistry_parsed.json', JSON.stringify(questions, null, 2));
  console.log('\n✅ Saqlandi: chemistry_parsed.json');
});
