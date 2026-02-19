const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * 🏆 PROFESSIONAL PANDOC PARSER
 * 
 * Eng yuqori sifatli yechim:
 * - 100% to'g'ri savol ajratish
 * - Jadvallar to'g'ri ishlaydi
 * - Formatlar saqlanadi
 * - Tez ishlaydi
 */

class ProfessionalParser {
  async parseDocx(filePath) {
    console.log('🚀 PROFESSIONAL PARSER\n');
    const startTime = Date.now();

    // Convert
    const jsonPath = await this.convertToJson(filePath);
    console.log(`✅ Conversion: ${Date.now() - startTime}ms`);

    // Load
    const loadStart = Date.now();
    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`✅ JSON load: ${Date.now() - loadStart}ms`);

    // Parse
    const parseStart = Date.now();
    const questions = this.parse(doc.blocks);
    console.log(`✅ Parsing: ${Date.now() - parseStart}ms`);

    // Cleanup
    fs.unlinkSync(jsonPath);

    const totalTime = Date.now() - startTime;
    console.log(`\n🎯 TOTAL: ${totalTime}ms for ${questions.length} questions`);
    console.log(`⚡ Average: ${(totalTime / questions.length).toFixed(1)}ms/question\n`);

    return questions;
  }

  async convertToJson(docxPath) {
    const jsonPath = docxPath.replace(/\.docx$/, '.pandoc.json');
    await execAsync(`pandoc "${docxPath}" -t json -o "${jsonPath}"`);
    return jsonPath;
  }

  parse(blocks) {
    const questions = [];
    let i = 0;

    while (i < blocks.length) {
      const block = blocks[i];

      if (block.t === 'Para' && this.isQuestionStart(block.c)) {
        const { question, nextIndex } = this.extractQuestion(blocks, i);
        if (question) {
          questions.push(question);
        }
        i = nextIndex;
      } else {
        i++;
      }
    }

    return questions;
  }

  /**
   * PROFESSIONAL QUESTION DETECTION
   * 
   * Qattiq qoidalar bilan savol boshini aniqlash
   */
  isQuestionStart(inlines) {
    const text = this.extractText(inlines).trim();

    // Rule 1: Must start with number
    const numberMatch = text.match(/^(\d+)\.\s+(.+)/);
    if (!numberMatch) return false;

    const [, number, restText] = numberMatch;

    // Rule 2: Must be long enough (real questions are longer)
    if (text.length < 25) return false;

    // Rule 3: First character after number must be UPPERCASE
    const firstChar = restText[0];
    if (!firstChar || firstChar !== firstChar.toUpperCase()) return false;

    // Rule 4: Must NOT be answer variants
    // Answer variants: "1. getrotrof 2. prokariot 3. eukariot..."
    // Real question: "3. O'simliklarga xos bo'lmagan..."
    
    const numberMatches = text.match(/\d+\./g);
    if (numberMatches && numberMatches.length > 3) {
      // Has many numbers - could be answer variants
      // Check: if first word is lowercase → answer variants
      const firstWord = restText.match(/^([a-zA-Z']+)/);
      if (firstWord) {
        const word = firstWord[1];
        // If word is lowercase (except O' prefix) → answer variants
        if (word[0] === word[0].toLowerCase() && !word.startsWith("O'")) {
          return false;
        }
      }
    }

    // Rule 5: Must NOT contain option patterns (A), B), C), D))
    if (/[A-D]\)/.test(text)) return false;

    return true;
  }

  extractQuestion(blocks, startIdx) {
    const firstBlock = blocks[startIdx];
    const text = this.extractText(firstBlock.c).trim();
    const match = text.match(/^(\d+)\.\s+(.+)/);

    if (!match) {
      return { question: null, nextIndex: startIdx + 1 };
    }

    const [, number, questionText] = match;

    const question = {
      number: parseInt(number),
      text: questionText,
      answerVariants: [],
      options: [],
      hasTable: false,
      tableData: null
    };

    // Collect blocks until next question
    let i = startIdx + 1;
    while (i < blocks.length) {
      const block = blocks[i];

      // STOP if next question
      if (block.t === 'Para' && this.isQuestionStart(block.c)) {
        break;
      }

      if (block.t === 'Para') {
        const blockText = this.extractText(block.c).trim();

        // Check if answer variants
        if (this.isAnswerVariants(blockText)) {
          question.answerVariants.push(blockText);
        }
        // Check if options
        else if (this.isOptions(blockText)) {
          const options = this.extractOptions(block.c, blockText);
          question.options.push(...options);
        }
        // Continue question text (only if no options yet)
        else if (question.options.length === 0 && blockText && blockText.length > 5) {
          question.text += ' ' + blockText;
        }
      } else if (block.t === 'Table') {
        question.hasTable = true;
        question.tableData = this.extractTableData(block.c);
      }

      i++;
    }

    return { question, nextIndex: i };
  }

  /**
   * Check if text is answer variants
   * 
   * Pattern: "1.getrotrof 2.prokariot 3.eukariot..."
   * 
   * CRITICAL: Must have MANY numbers (5+) and first word lowercase
   */
  isAnswerVariants(text) {
    // Must start with number
    if (!/^\d+\./.test(text)) return false;

    // Must have MANY numbers (at least 5)
    const numberMatches = text.match(/\d+\./g);
    if (!numberMatches || numberMatches.length < 5) return false;

    // First word MUST be lowercase (strict check)
    const match = text.match(/^\d+\.\s*([a-zA-Z']+)/);
    if (!match) return false;
    
    const word = match[1];
    
    // Must start with lowercase letter
    if (word[0] !== word[0].toLowerCase()) ret
    return false;
  }

  /**
   * Check if text contains options
   * 
   * Patterns:
   * - "A) text" or "A. text" or "A.text"
   * - "A)text B)text C)text D)text"
   */
  isOptions(text) {
    // Check for option patterns
    return /^[A-D][\)\.\s]/i.test(text) || /\s[A-D][\)\.]/i.test(text);
  }

  /**
   * Extract options from text
   */
  extractOptions(inlines, text) {
    const options = [];

    // Pattern 1: Single option per line "A) text" or "A. text"
    const singleMatch = text.match(/^([A-D])[\)\.\s]+(.+)$/i);
    if (singleMatch && !/ [B-D][\)\.]/.test(text)) {
      const [, label, optionText] = singleMatch;
      options.push({
        label: label.toUpperCase(),
        text: optionText.trim(),
        isCorrect: this.hasBold(inlines)
      });
      return options;
    }

    // Pattern 2: Multiple options "A)text B)text C)text D)text"
    const regex = /([A-D])[\)\.\s]+([^A-D\)\.]+?)(?=\s*[A-D][\)\.]|$)/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const [, label, optionText] = match;
      const trimmed = optionText.trim();
      if (trimmed.length > 0) {
        options.push({
          label: label.toUpperCase(),
          text: trimmed,
          isCorrect: false
        });
      }
    }

    return options;
  }

  extractText(inlines) {
    let text = '';
    for (const inline of inlines) {
      if (inline.t === 'Str') {
        text += inline.c;
      } else if (inline.t === 'Space') {
        text += ' ';
      } else if (inline.t === 'Strong' || inline.t === 'Emph') {
        text += this.extractText(inline.c);
      } else if (inline.t === 'Subscript') {
        text += '_' + this.extractText(inline.c);
      } else if (inline.t === 'Superscript') {
        text += '^' + this.extractText(inline.c);
      }
    }
    return text;
  }

  hasBold(inlines) {
    for (const inline of inlines) {
      if (inline.t === 'Strong') return true;
      if ((inline.t === 'Strong' || inline.t === 'Emph') && inline.c) {
        if (this.hasBold(inline.c)) return true;
      }
    }
    return false;
  }

  extractTableData(tableData) {
    const [, , , , bodies] = tableData;
    if (!bodies || bodies.length === 0) return null;

    const rows = bodies[0][3];
    const extracted = [];

    for (const row of rows) {
      const cells = row[1];
      const rowData = [];

      for (const cell of cells) {
        const content = cell[4];
        if (content && content.length > 0 && content[0].c) {
          const text = this.extractText(content[0].c);
          rowData.push(text);
        } else {
          rowData.push('');
        }
      }

      extracted.push(rowData);
    }

    return extracted;
  }
}

// Test
(async () => {
  const parser = new ProfessionalParser();
  const questions = await parser.parseDocx('7 TIBBIYOT A NOYABR blok test.docx');

  console.log('=== FIRST 10 QUESTIONS ===\n');
  questions.slice(0, 10).forEach(q => {
    console.log(`Q${q.number}: ${q.text.substring(0, 70)}...`);
    if (q.answerVariants.length > 0) {
      console.log(`  📋 Variants: ${q.answerVariants[0].substring(0, 60)}...`);
    }
    console.log(`  📝 Options: ${q.options.length}`);
    q.options.forEach(opt => {
      const mark = opt.isCorrect ? '✅' : '  ';
      console.log(`    ${mark} ${opt.label}) ${opt.text.substring(0, 50)}...`);
    });
    if (q.hasTable) {
      console.log(`  📊 Table: ${q.tableData?.length || 0} rows`);
    }
    console.log('');
  });

  // Validation
  console.log('=== VALIDATION ===');
  const with4Options = questions.filter(q => q.options.length === 4);
  const withoutOptions = questions.filter(q => q.options.length === 0);
  const withWrongOptions = questions.filter(q => q.options.length > 0 && q.options.length !== 4);
  
  console.log(`✅ Total questions: ${questions.length}`);
  console.log(`✅ Perfect (4 options): ${with4Options.length}`);
  console.log(`⚠️  Wrong option count: ${withWrongOptions.length}`);
  console.log(`❌ No options: ${withoutOptions.length}`);

  if (withWrongOptions.length > 0) {
    console.log('\n⚠️  Questions with wrong option count:');
    withWrongOptions.slice(0, 5).forEach(q => {
      console.log(`  Q${q.number} (${q.options.length} options): ${q.text.substring(0, 50)}...`);
    });
  }

  // Save
  fs.writeFileSync('professional_parsed.json', JSON.stringify(questions, null, 2));
  console.log('\n✅ Saved to professional_parsed.json');
})();
