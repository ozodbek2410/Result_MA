import { BaseParser, ParsedQuestion } from './BaseParser';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * 📚 LITERATURE PARSER - Ona tili va Adabiyot fani uchun maxsus
 * 
 * Ona tili va Adabiyot xususiyatlari:
 * - Badiiy matnlar va she'rlar
 * - Yozuvchi va shoir nomlari
 * - Asar nomlari (qo'shtirnoq ichida)
 * - Adabiy atamalar (metafora, qofia, vazn, janr)
 * - Grammatik qoidalar (fe'l, ot, sifat, ravish)
 * - Imlo va tinish belgilari
 * - Matn tahlili
 * - Badiiy-ifodaviy vositalar
 * - Adabiyot tarixi (davr, yo'nalish)
 * - Iqtiboslar va parchalar
 * 
 * Accuracy target: 95%+
 */
export class LiteratureParser extends BaseParser {
  async parse(filePath: string): Promise<ParsedQuestion[]> {
    try {
      console.log('📚 [LITERATURE] Parsing DOCX with literature-specific rules...');
      const startTime = Date.now();
      
      // Extract images (adabiyotda kam, lekin bo'lishi mumkin)
      await this.extractImagesFromDocx(filePath);
      
      // Convert to Markdown using BaseParser method
      const markdown = await this.extractTextWithPandoc(filePath);
      
      console.log('📝 [LITERATURE] Markdown length:', markdown.length);
      
      // Parse with literature-specific rules
      const questions = this.parseMarkdown(markdown);
      
      const duration = Date.now() - startTime;
      console.log(`✅ [LITERATURE] Parsed ${questions.length} questions in ${duration}ms`);
      
      // Validate and report issues
      this.validateAndReportIssues(questions);
      
      return questions;
    } catch (error) {
      console.error('❌ [LITERATURE] Error:', error);
      throw new Error(
        `Failed to parse literature DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Markdown dan savollarni ajratish (adabiyot uchun maxsus)
   */
  protected parseMarkdown(markdown: string): ParsedQuestion[] {
    const lines = markdown.split('\n');
    const questions: ParsedQuestion[] = [];
    
    let current: Partial<ParsedQuestion> | null = null;
    let state: 'IDLE' | 'QUESTION' | 'COLLECTING_OPTIONS' = 'IDLE';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if line is a single option (A), B), C), or D))
      const singleOptionMatch = line.match(/^([A-D])\\?\)\s*(.+)/i);
      
      if (singleOptionMatch && current && state === 'COLLECTING_OPTIONS') {
        const [, letter, text] = singleOptionMatch;
        
        if (!current.variants) {
          current.variants = [];
        }
        
        // Add this option
        current.variants.push({
          letter: letter.toUpperCase(),
          text: this.cleanLiteratureText(text),
        });
        
        // If we have all 4 options, finalize question
        if (current.variants.length >= 4) {
          questions.push(this.finalizeQuestion(current));
          current = null;
          state = 'IDLE';
        }
        continue;
      }

      // Check if line has multiple options (A) ... B) ... C) ... D))
      const options = this.extractOptions(line);
      if (options.length >= 2) {
        if (current) {
          if (!current.variants) {
            current.variants = [];
          }
          for (const opt of options) {
            if (current.variants.length >= 4) break;
            if (!current.variants.some(v => v.letter === opt.label)) {
              current.variants.push({
                letter: opt.label,
                text: opt.text,
              });
            }
          }
          
          if (current.variants && current.variants.length >= 4) {
            questions.push(this.finalizeQuestion(current));
            current = null;
            state = 'IDLE';
          } else {
            state = 'COLLECTING_OPTIONS';
          }
        }
        continue;
      }

      // Check if line is a question (starts with number)
      // Support both "1." and "1)" formats
      const questionMatch = line.match(/^(\d+)[.)]\s*(.+)/);
      if (questionMatch) {
        const [, number, text] = questionMatch;
        const num = parseInt(number);

        if (num < 1 || num > 100) continue;

        // IMPORTANT: Agar hozirgi savol bor va bu kichik raqam (1-5) bo'lsa,
        // bu yangi savol emas, balki ro'yxat elementi bo'lishi mumkin
        if (current && num <= 5 && state !== 'IDLE') {
          // Bu ro'yxat elementi, savol matni ga qo'shamiz
          current.text += ' ' + num + '. ' + this.cleanLiteratureText(text);
          continue;
        }

        // Save previous question if exists
        if (current) {
          questions.push(this.finalizeQuestion(current));
        }

        // Start new question
        current = {
          text: this.cleanLiteratureText(text),
          variants: [],
          correctAnswer: 'A',
          points: 1,
        };
        state = 'QUESTION';
        continue;
      }

      // Continue building current question text
      if (current && state === 'QUESTION') {
        // Check if this line might be start of options
        if (singleOptionMatch) {
          // This is first option, switch to collecting mode
          const [, letter, text] = singleOptionMatch;
          current.variants = [{
            letter: letter.toUpperCase(),
            text: this.cleanLiteratureText(text),
          }];
          state = 'COLLECTING_OPTIONS';
        } else if (line.length > 5) {
          // Continue question text
          current.text += ' ' + this.cleanLiteratureText(line);
        }
      }
    }

    // Save last question
    if (current) {
      questions.push(this.finalizeQuestion(current));
    }

    return questions;
  }

  /**
   * Adabiyot savoli ekanligini aniqlash
   */
  private isLiteratureQuestion(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Adabiyot kalitlari
    const literatureKeywords = [
      // Ona tili
      'fe\'l', 'ot', 'sifat', 'ravish', 'olmosh', 'son', 'yukla',
      'bog\'lovchi', 'modal', 'undov', 'takrorla', 'qo\'shma',
      'gap', 'so\'z', 'jumla', 'kesim', 'ega', 'to\'ldiruvchi',
      'aniqlovchi', 'hol', 'imlo', 'tinish', 'vergul', 'nuqta',
      
      // Adabiyot
      'asar', 'she\'r', 'roman', 'qissa', 'hikoya', 'doston',
      'yozuvchi', 'shoir', 'muallif', 'qahramon', 'obraz',
      'mavzu', 'g\'oya', 'janr', 'uslub', 'badiiy', 'ifodaviy',
      'metafora', 'tashbeh', 'majoz', 'kinoya', 'qofia', 'vazn',
      'misra', 'bayt', 'band', 'davr', 'yo\'nalish', 'maktab',
      'realizm', 'romantizm', 'klassik', 'zamonaviy',
      
      // Savol so'zlari
      'kim', 'nima', 'qaysi', 'qanday', 'necha', 'qachon',
      'qayer', 'nega', 'nima uchun', 'toping', 'aniqlang',
      'ko\'rsating', 'ajrating', 'belgilang'
    ];
    
    // Check keywords
    if (literatureKeywords.some(keyword => lowerText.includes(keyword))) {
      return true;
    }
    
    // Check for quotes (asar nomlari)
    if (text.includes('"') || text.includes('«') || text.includes('»')) {
      return true;
    }
    
    // Check for question marks or question words
    if (text.includes('?') || /\b(qanday|qaysi|kim|nima|necha|qachon|qayer|nega|toping|aniqlang)\b/i.test(text)) {
      return true;
    }
    
    return false;
  }

  /**
   * Variant ekanligini aniqlash
   */
  private isLiteratureVariant(text: string): boolean {
    // Juda qisqa matn (< 15 belgi)
    if (text.length < 15) return true;
    
    // Faqat yozuvchi/shoir ismi
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(text)) {
      return true;
    }
    
    // Faqat asar nomi (qo'shtirnoqda)
    if (/^["«].*["»]$/.test(text)) {
      return true;
    }
    
    return false;
  }

  /**
   * Adabiyot uchun maxsus matn tozalash
   * Oddiy matn, maxsus formatlash yo'q
   */
  private cleanLiteratureText(text: string): string {
    let cleaned = text
      .replace(/\\\'/g, "'")
      .replace(/\\\./g, ".")
      .replace(/\\\)/g, ")")
      .replace(/\s+/g, ' ')
      .trim();
    
    // LITERATURE: Preserve quotes and special characters
    // Qo'shtirnoqlarni saqlaymiz (asar nomlari uchun)
    cleaned = cleaned.replace(/\\"/g, '"');
    
    // Tire va defislarni saqlaymiz
    cleaned = cleaned.replace(/\\-/g, '-');
    
    // Maxsus belgilarni saqlaymiz
    cleaned = cleaned.replace(/\\&/g, '&');
    
    return cleaned;
  }

  /**
   * Javoblarni ajratish (ona tili uchun maxsus)
   * Bir qatorda yozilgan javoblarni ham ajratadi
   */
  private extractOptions(line: string): Array<{ label: string; text: string }> {
    const options: Array<{ label: string; text: string }> = [];
    
    line = line.replace(/\\\)/g, ')').replace(/\\\./g, '.').replace(/\\\'/g, "'");

    // Pattern 1: A) text B) text C) text D) text (with parentheses)
    const withParen = /([A-D])\)\s*([^A-D)]+?)(?=\s*[A-D]\)|$)/g;
    let match;
    
    while ((match = withParen.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        options.push({ label, text: this.cleanLiteratureText(trimmed) });
      }
    }
    
    if (options.length >= 2) return options;

    // Pattern 2: A text B text C text D text (without parentheses)
    const noParenMulti = /([A-D])\s+([^A-D]+?)(?=\s+[A-D]\s+|$)/g;
    let found = false;
    
    while ((match = noParenMulti.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0 && /^[A-D]$/.test(label)) {
        options.push({ label, text: this.cleanLiteratureText(trimmed) });
        found = true;
      }
    }
    
    if (found && options.length >= 2) return options;

    // Pattern 3: A) text (single - only if no other options found)
    const noParenSingle = /^([A-D])\s+(.+)$/;
    const singleMatch = noParenSingle.exec(line);
    if (singleMatch && !/ [B-D][\)\.\s]/.test(line)) {
      const [, label, text] = singleMatch;
      options.push({ label, text: this.cleanLiteratureText(text.trim()) });
      return options;
    }

    return options;
  }

  /**
   * Xatolarni tekshirish va hisobot
   */
  private validateAndReportIssues(questions: ParsedQuestion[]): void {
    const issues: Array<{
      number: number;
      text: string;
      variantCount: number;
      variants: Array<{ letter: string; text: string }>;
    }> = [];

    questions.forEach((q, idx) => {
      const variantCount = q.variants?.length || 0;
      if (variantCount < 4) {
        issues.push({
          number: idx + 1,
          text: q.text,
          variantCount,
          variants: q.variants || [],
        });
      }
    });

    if (issues.length > 0) {
      const fullCount = questions.length - issues.length;
      const accuracy = ((fullCount / questions.length) * 100).toFixed(1);

      console.log('\n' + '='.repeat(70));
      console.log('⚠️  OGOHLANTIRISHLAR - Faylda muammolar topildi');
      console.log('='.repeat(70));
      console.log(`📊 Natija: ${fullCount}/${questions.length} to'liq (${accuracy}%)`);
      console.log(`⚠️  ${issues.length} ta savol muammoli (lekin import qilindi)`);      console.log('='.repeat(70));

      issues.forEach((issue, idx) => {
        console.log(`\n📌 XATO #${idx + 1}: Savol ${issue.number}`);
        console.log('─'.repeat(70));
        console.log(`📝 Savol: ${issue.text.substring(0, 100)}...`);
        console.log(`⚠️  Muammo: ${issue.variantCount}/4 javob topildi`);

        if (issue.variants.length > 0) {
          console.log(`📋 Topilgan javoblar:`);
          issue.variants.forEach((v) => {
            console.log(`   ${v.letter}) ${v.text}`);
          });
        } else {
          console.log(`📋 Hech qanday javob topilmadi`);
        }

        console.log(`\n💡 Tavsiya:`);
        console.log(`   1. Word faylida savol ${issue.number} ni tekshiring`);
        console.log(`   2. Javoblar A), B), C), D) formatida ekanligiga ishonch hosil qiling`);
        console.log(`   3. Har bir javob alohida qatorda bo'lishi kerak`);
      });

      console.log('\n' + '='.repeat(70));
    } else {
      console.log(`\n✅ [LITERATURE] 100% to'liq! Barcha savollar 4ta javobga ega.\n`);
    }
  }

  /**
   * Finalize question
   */
  private finalizeQuestion(q: Partial<ParsedQuestion>): ParsedQuestion {
    return {
      text: q.text || '',
      variants: q.variants || [],
      correctAnswer: q.correctAnswer || 'A',
      points: q.points || 1,
      imageUrl: q.imageUrl,
    };
  }
}
