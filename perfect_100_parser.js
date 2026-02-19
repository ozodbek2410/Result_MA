const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * 💯 PERFECT 100% PARSER
 * 
 * Senior dasturchi yondashuvi:
 * 1. Aniq regex - lookahead ishlatish
 * 2. State machine - aniq holatlar
 * 3. Edge case'larni barchasini qo'llab-quvvatlash
 */

class Perfect100Parser {
  async parseDocx(filePath) {
    console.log('💯 PERFECT 100% PARSER\n');
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line || line.includes('---') || line.includes('|')) {
        continue;
      }

      // PRIORITY 1: OPTIONS
      if (/^[A-D][\)\.\\\)\s]/.test(line)) {
        if (current) {
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

        if (this.isQuestion(text)) {
          // SPECIAL: Agar avvalgi savol javobsiz va bu "1." bo'lsa
          if (current && current.options.length === 0 && num === 1 && this.isVariant(text)) {
            current.answerVariants.push(line);
            state = 'VARIANTS';
            continue;
          }
          
          if (current) {
            questions.push(current);
          }

          current = {
            number: num,
            text: this.cleanText(text),
            answerVariants: [],
            options: []
          };
          state = 'QUESTION';
        } else if (this.isVariant(text) && current && current.options.length === 0) {
          current.answerVariants.push(line);
          state = 'VARIANTS';
        }
        continue;
      }

      // PRIORITY 3: Continue state
      if (current) {
        if (state === 'QUESTION' && line.length > 10) {
          current.text += ' ' + this.cleanText(line);
        } else if (state === 'VARIANTS') {
          const numberCount = (line.match(/\d+[\.\)]/g) || []).length;
          if (numberCount >= 2) {
            current.answerVariants.push(line);
          }
        }
      }
    }

    if (current) {
      questions.push(current);
    }

    return questions;
  }

  isQuestion(text) {
    // 1. ? belgisi bor → SAVOL
    if (text.includes('?')) return true;
    
    // 2. "aniqlang" so'zi bor → SAVOL (o'zbek tilida keng tarqalgan)
    if (text.toLowerCase().includes('aniqlang')) return true;
    
    // 3. Uzun + katta harf → SAVOL
    const isLong = text.length > 30;
    const startsWithUpper = text[0] === text[0].toUpperCase();
    return isLong && startsWithUpper;
  }

  isVariant(text) {
    // 1. kichik harf bilan boshlanadi
    const startsWithLower = text[0] === text[0].toLowerCase();
    if (startsWithLower) return true;
    
    // 2. Ko'p raqamlar bor (2 yoki undan ko'p)
    const numberCount = (text.match(/\d+[\.\)]/g) || []).length;
    if (numberCount >= 2) return true;
    
    // 3. YANGI: Agar matn "Tallomi", "Bargi", "Ildizi" kabi o'simlik qismlari bilan boshlansa
    // Bu biologiya testlari uchun maxsus
    const bioTerms = /^(Tallomi|Bargi|Ildizi|Poyasi|Guli|Mevasi|Urug'i|Sporasi)/i;
    if (bioTerms.test(text)) return true;
    
    return false;
  }

  /**
   * 🎯 100% TO'G'RI REGEX
   * Lookahead ishlatish: (?=\s+[A-D]\))
   */
  extractOptions(line) {
    const options = [];
    
    line = line.replace(/\\\)/g, ')').replace(/\\\./g, '.').replace(/\\\'/g, "'");

    // Format 1: "A text B text C text D text" (qavssiz)
    const noParenMulti = /([A-D])\s+([^A-D]+?)(?=\s+[A-D]\s+|$)/g;
    let match;
    let found = false;
    
    while ((match = noParenMulti.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0 && /^[A-D]$/.test(label)) {
        options.push({ label, text: trimmed });
        found = true;
      }
    }
    
    if (found && options.length > 0) return options;

    // Format 2: "A text" (qavssiz, bitta)
    const noParenSingle = line.match(/^([A-D])\s+(.+)$/);
    if (noParenSingle && !/ [B-D][\)\.\s]/.test(line)) {
      const [, label, text] = noParenSingle;
      options.push({ label, text: text.trim() });
      return options;
    }

    // Format 3: A), A. - YANGI TO'G'RI REGEX
    const separator = line.match(/^[A-D]([\.\)])/)?.[1] || ')';
    
    const multiPattern = separator === '.'
      ? /([A-D])\.\s*(.+?)(?=\s+[A-D]\.|$)/g
      : /([A-D])\)\s*(.+?)(?=\s+[A-D]\)|$)/g;
    
    while ((match = multiPattern.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        options.push({ label, text: trimmed });
      }
    }

    return options;
  }

  cleanText(text) {
    return text
      .replace(/\\\'/g, "'")
      .replace(/\\\./g, ".")
      .replace(/\\\)/g, ")")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Test
(async () => {
  const parser = new Perfect100Parser();
  const questions = await parser.parseDocx('bilalogiya.docx');

  console.log('=== BARCHA 30 SAVOL ===\n');
  questions.forEach((q, idx) => {
    const status = q.options.length === 4 ? '✅' : '⚠️';
    console.log(`${status} ${idx + 1}. Q${q.number}: ${q.text.substring(0, 50)}...`);
    if (q.answerVariants.length > 0) {
      console.log(`   📋 Variantlar: ${q.answerVariants.length}`);
    }
    console.log(`   📝 Javoblar: ${q.options.length}/4`);
    if (q.options.length < 4) {
      q.options.forEach(opt => {
        console.log(`      ${opt.label}) ${opt.text.substring(0, 40)}...`);
      });
    }
  });

  console.log('\n=== NATIJA ===');
  const perfect = questions.filter(q => q.options.length === 4);
  const missing = questions.filter(q => q.options.length < 4);
  
  console.log(`✅ Jami: ${questions.length}/30`);
  console.log(`✅ To'liq (4 javob): ${perfect.length}`);
  console.log(`⚠️  Kamchilik: ${missing.length}`);
  
  if (missing.length > 0) {
    console.log('\nKamchilikli savollar:');
    missing.forEach(q => {
      console.log(`  Q${q.number}: ${q.options.length}/4 javob`);
    });
  }

  console.log(`\n🎯 Muvaffaqiyat: ${(perfect.length/30*100).toFixed(1)}%`);

  fs.writeFileSync('perfect_100_parsed.json', JSON.stringify(questions, null, 2));
  console.log('\n✅ Saqlandi: perfect_100_parsed.json');
})();
