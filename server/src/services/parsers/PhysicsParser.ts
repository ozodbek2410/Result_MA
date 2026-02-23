import { BaseParser, ParsedQuestion } from './BaseParser';

/**
 * ⚡ PHYSICS PARSER - Fizika fani uchun maxsus
 * 
 * Fizika xususiyatlari:
 * - Matematik formulalar (F = ma, E = mc², v = s/t)
 * - Fizik birliklar (m/s, kg, N, J, W, Pa, V, A, Ω)
 * - Vektorlar (→, ⃗)
 * - Yunoncha harflar (α, β, γ, θ, λ, μ, ρ, σ, ω)
 * - Indekslar va darajalar (v₀, x², E₀, t₁)
 * - Fizik konstantalar (g = 9.8 m/s², c = 3×10⁸ m/s)
 * - Grafik va diagrammalar
 * - Raqamli hisoblashlar (10⁶, 10⁻³)
 * - Nisbatlar va proporsiyalar
 * 
 * Accuracy target: 95%+
 */
export class PhysicsParser extends BaseParser {
  async parse(filePath: string): Promise<ParsedQuestion[]> {
    try {
      console.log('⚡ [PHYSICS] Parsing DOCX with physics-specific rules...');
      const startTime = Date.now();
      
      // Extract images (fizikada grafik va diagrammalar ko'p)
      await this.extractImagesFromDocx(filePath);
      
      // Extract tables (fizikada jadvallar ko'p)
      await this.extractTablesFromDocx(filePath);
      
      // Convert to Markdown
      const markdown = await this.convertToMarkdown(filePath);
      
      console.log('📝 [PHYSICS] Markdown length:', markdown.length);
      
      // Parse with physics-specific rules
      const questions = this.parseMarkdown(markdown);
      
      // Media qo'shish
      for (const question of questions) {
        this.attachMediaToQuestion(question);
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ [PHYSICS] Parsed ${questions.length} questions in ${duration}ms`);
      
      // Validate and report issues
      this.validateAndReportIssues(questions);
      
      return questions;
    } catch (error) {
      console.error('❌ [PHYSICS] Error:', error);
      throw new Error(
        `Failed to parse physics DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Markdown dan savollarni ajratish (fizika uchun maxsus)
   */
  protected parseMarkdown(markdown: string): ParsedQuestion[] {
    const lines = markdown.split('\n');
    const questions: ParsedQuestion[] = [];
    
    let current: Partial<ParsedQuestion> | null = null;
    let state: 'IDLE' | 'QUESTION' | 'OPTIONS' | 'VARIANTS' = 'IDLE';
    let variantLines: string[] = [];
    let pendingImageMarker: string | null = null; // Rasm markerni keyingi savol uchun saqlash

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Rasm marker qatorlarini savol matniga qo'shish
      if (line.includes('___IMAGE_')) {
        if (current) {
          current.text = (current.text || '') + ' ' + line;
        } else {
          // current null — keyingi savolga biriktirish uchun saqlash
          pendingImageMarker = line;
        }
        continue;
      }

      // PRIORITY 1: RAQAMLI QATOR (savol yoki variant)
      // MUHIM: Bu extractOptions DAN OLDIN bo'lishi kerak!
      // Aks holda "14. Moddiy nuqta A nuqtadan D nuqtaga..." dagi "A" va "D" variant deb hisoblanadi
      const match = line.match(/^(\d+)[.)]\s*(.+)/);
      if (match) {
        const [, number, text] = match;
        const num = parseInt(number);

        if (num < 1 || num > 100) continue;

        // Check if this is a variant (short text or starts with ")")
        if (text.startsWith(')') || (text.length < 20 && !this.isPhysicsQuestion(text))) {
          if (current && state === 'QUESTION') {
            if (!variantLines.length) {
              current.text += '\n\n';
            }
            variantLines.push(line);
            state = 'VARIANTS';
          }
          continue;
        }

        // Check if this is actually a variant (faqat 1-raqam va qisqa matn)
        if (current && (!current.variants || current.variants.length === 0) && num === 1 && this.isPhysicsVariant(text)) {
          variantLines.push(line);
          state = 'VARIANTS';
          continue;
        }

        // Agar qisqa matn va variant ga o'xshasa — variant sifatida qo'shish
        if (this.isPhysicsVariant(text) && current && (!current.variants || current.variants.length === 0)) {
          variantLines.push(line);
          state = 'VARIANTS';
          continue;
        }

        // DEFAULT: har qanday raqamli qatorni SAVOL deb qabul qilish

        // Save previous question
        if (current) {
          if (variantLines.length > 0) {
            const variantsText = '\n\n' + variantLines.map(v => this.cleanPhysicsText(v)).join(' ');
            current.text = (current.text || '') + variantsText;
            variantLines = [];
          }
          questions.push(this.finalizeQuestion(current));
        }

        // Start new question
        let questionText = this.cleanPhysicsText(text).replace(/^\.\s+/, '');
        // Agar oldingi savoldan qolgan rasm marker bo'lsa — yangi savolga biriktirish
        if (pendingImageMarker) {
          questionText = pendingImageMarker + ' ' + questionText;
          pendingImageMarker = null;
        }
        current = {
          text: questionText,
          variants: [],
          correctAnswer: 'A',
          points: 1,
          originalNumber: num,
        };
        state = 'QUESTION';
        variantLines = [];

        // Savol matni ichida inline variantlar bormi? (masalan: "20. Savol matni A)1 B)2 C)3 D)4")
        const inlineOpts = this.extractOptions(text);
        if (inlineOpts.length >= 2) {
          // Savol matnini variantlardan ajratish — birinchi variant boshlanish joyini topish
          const firstOptMatch = text.match(/[A-D]\)\s*/);
          if (firstOptMatch && firstOptMatch.index !== undefined) {
            current.text = this.cleanPhysicsText(text.substring(0, firstOptMatch.index)).replace(/^\.\s+/, '');
            if (pendingImageMarker) {
              current.text = pendingImageMarker + ' ' + current.text;
              pendingImageMarker = null;
            }
          }
          for (const opt of inlineOpts) {
            if (current.variants!.length >= 4) break;
            if (!current.variants!.some(v => v.letter === opt.label)) {
              current.variants!.push({ letter: opt.label, text: opt.text });
            }
          }
          if (current.variants!.length >= 4) {
            questions.push(this.finalizeQuestion(current));
            current = null;
            state = 'IDLE';
          } else {
            state = 'OPTIONS'; // Qisman inline variantlar topildi, qolganlarini kutish
          }
        }
        continue;
      }

      // PRIORITY 2: OPTIONS (A), B), C), D)) — faqat raqamsiz qatorlar uchun
      const options = this.extractOptions(line);
      if (options.length >= 2) {
        if (current) {
          // Mixed line: savol davomi + variantlar (masalan: "bo'ladi? A)1 B)2 C)3 D)4")
          if (state === 'QUESTION') {
            const firstOptMatch = line.match(/[A-D]\)\s*/);
            if (firstOptMatch && firstOptMatch.index && firstOptMatch.index > 3) {
              const preText = line.substring(0, firstOptMatch.index).trim();
              if (preText.length > 3) {
                current.text = (current.text || '') + ' ' + this.cleanPhysicsText(preText);
              }
            }
          }

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
            if (variantLines.length > 0) {
              const variantsText = '\n\n' + variantLines.map(v => this.cleanPhysicsText(v)).join(' ');
              current.text = (current.text || '') + variantsText;
              variantLines = [];
            }

            questions.push(this.finalizeQuestion(current));
            current = null;
            state = 'IDLE';
          } else {
            state = 'OPTIONS';
          }
        }
        continue;
      }

      // Yakka variant qatori: "A)273 K da..." yoki "D) 220"
      if (current && (state === 'OPTIONS' || state === 'QUESTION')) {
        const singleVar = line.match(/^(\*\*|__)?([A-D])(\*\*|__)?\)\s*(.+)/i);
        if (singleVar) {
          const letter = singleVar[2].toUpperCase();
          let vText = singleVar[4].trim();
          vText = this.cleanPhysicsText(vText);
          if (!current.variants!.some(v => v.letter === letter)) {
            current.variants!.push({ letter, text: vText });
          }
          state = 'OPTIONS';
          if (current.variants!.length >= 4) {
            questions.push(this.finalizeQuestion(current));
            current = null;
            state = 'IDLE';
          }
          continue;
        }
      }

      // Continue building current question or variants
      if (current) {
        if (state === 'QUESTION' && line.length > 10 && current.text) {
          current.text += ' ' + this.cleanPhysicsText(line);
        } else if (state === 'OPTIONS' && current.variants && current.variants.length > 0) {
          // Variant matn davomi (masalan: C variant 2 qatorda yozilgan)
          const lastVariant = current.variants[current.variants.length - 1];
          lastVariant.text += ' ' + this.cleanPhysicsText(line);
        } else if (state === 'VARIANTS') {
          const numberCount = (line.match(/\d+[\.\)]/g) || []).length;
          if (numberCount >= 2) {
            variantLines.push(line);
          }
        }
      }
    }

    // Save last question
    if (current) {
      if (variantLines.length > 0) {
        const variantsText = '\n\n' + variantLines.map(v => this.cleanPhysicsText(v)).join(' ');
        current.text = (current.text || '') + variantsText;
      }
      questions.push(this.finalizeQuestion(current));
    }

    return questions;
  }

  /**
   * Fizika savoli ekanligini aniqlash
   */
  private isPhysicsQuestion(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Fizika kalitlari
    const physicsKeywords = [
      'tezlik', 'tezlanish', 'kuch', 'massa', 'energiya', 'quvvat',
      'bosim', 'temperatura', 'issiqlik', 'tok', 'kuchlanish', 'qarshilik',
      'magnit', 'elektr', 'yorug\'lik', 'tovush', 'to\'lqin', 'chastota',
      'amplituda', 'period', 'impuls', 'moment', 'ishqalanish', 'gravitatsiya',
      'potensial', 'kinetik', 'mexanik', 'termodinamik', 'optik',
      'hisoblang', 'toping', 'aniqlang', 'qancha', 'necha', 'qaysi'
    ];
    
    // Fizik birliklar
    const physicsUnits = [
      'm/s', 'km/h', 'kg', 'n', 'j', 'w', 'pa', 'v', 'a', 'ω', 'hz',
      'm²', 'm³', 'kg/m³', 'n/m', 'j/kg', 'w/m²'
    ];
    
    // Check keywords
    if (physicsKeywords.some(keyword => lowerText.includes(keyword))) {
      return true;
    }
    
    // Check units
    if (physicsUnits.some(unit => lowerText.includes(unit))) {
      return true;
    }
    
    // Check for formulas (=, +, -, *, /)
    if (/[=+\-*/]/.test(text) && /\d/.test(text)) {
      return true;
    }
    
    // Check for question marks or question words
    if (text.includes('?') || /\b(qanday|qancha|necha|qaysi|aniqlang|toping|hisoblang)\b/i.test(text)) {
      return true;
    }
    
    return false;
  }

  /**
   * Variant ekanligini aniqlash
   */
  private isPhysicsVariant(text: string): boolean {
    // Juda qisqa matn (< 15 belgi)
    if (text.length < 15) return true;
    
    // Faqat raqamlar va birliklar
    if (/^\d+[\.,]?\d*\s*(m\/s|kg|n|j|w|pa|v|a|ω|hz|m|km|s)?$/i.test(text)) {
      return true;
    }
    
    return false;
  }

  /**
   * Fizika uchun maxsus matn tozalash
   * LaTeX formatida qaytaradi (matematika kabi)
   */
  private cleanPhysicsText(text: string): string {
    let cleaned = text
      .replace(/\\\'/g, "'")
      .replace(/\\\./g, ".")
      .replace(/\\\)/g, ")")
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ')
      .trim();

    // Convert $...$ inline math to \(...\) format (Pandoc LaTeX → frontend render)
    cleaned = cleaned.replace(/\$\$(.*?)\$\$/gs, '\\($1\\)');
    cleaned = cleaned.replace(/\$(.*?)\$/gs, '\\($1\\)');
    
    // PHYSICS: Convert special characters to LaTeX
    // × → \times (multiplication)
    cleaned = cleaned.replace(/×/g, '\\times ');
    cleaned = cleaned.replace(/∙/g, '\\cdot ');
    cleaned = cleaned.replace(/·/g, '\\cdot ');
    
    // ÷ → \div (division)
    cleaned = cleaned.replace(/÷/g, '\\div ');
    
    // ≈ → \approx (approximately)
    cleaned = cleaned.replace(/≈/g, '\\approx ');
    
    // ≠ → \neq (not equal)
    cleaned = cleaned.replace(/≠/g, '\\neq ');
    
    // ≤ → \leq, ≥ → \geq
    cleaned = cleaned.replace(/≤/g, '\\leq ');
    cleaned = cleaned.replace(/≥/g, '\\geq ');
    
    // → → \to (arrow)
    cleaned = cleaned.replace(/→/g, '\\to ');
    
    // PHYSICS: Convert Pandoc subscript/superscript to LaTeX format
    // v~0~ → v_0 (subscript)
    // 10^8^ → 10^{8} (superscript)
    cleaned = cleaned.replace(/([A-Za-z0-9])~([^~\s]+)~/g, '$1_$2');
    cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
    
    // Fizik birliklarni formatlash
    // m/s, kg/m³, N/m va h.k.
    // (hozircha oddiy qoldiramiz, keyin yaxshilaymiz)

    // MERGE: LaTeX operatorlar \(...\) math bloklariga birlashtiriladi
    // Muammo: "7,2\cdot \(10^{-27}\)" — \cdot tashqarida qoladi
    // Natija: "\(7,2 \cdot 10^{-27}\)" — hammasi bitta math blokda

    // Pattern 1: number\operator \(expr\) → \(number \operator expr\)
    // Masalan: 7,2\cdot \(10^{-27}\) → \(7,2 \cdot 10^{-27}\)
    cleaned = cleaned.replace(/([\d,\.]+)\s*\\(cdot|times|div)\s*\\\((.*?)\\\)/g, '\\($1 \\$2 $3\\)');

    // Pattern 2: \(expr\) \operator number → \(expr \operator number\)
    // Masalan: \(10^{23}\)\cdot 5 → \(10^{23} \cdot 5\)
    cleaned = cleaned.replace(/\\\((.*?)\\\)\s*\\(cdot|times|div)\s*([\d,\.]+)/g, '\\($1 \\$2 $3\\)');

    // Pattern 3: adjacent math blocks \(expr1\)\(expr2\) → \(expr1 expr2\)
    cleaned = cleaned.replace(/\\\((.*?)\\\)\s*\\\((.*?)\\\)/g, '\\($1 $2\\)');

    // Tashqarida qolgan LaTeX operatorlarni unicode ga qaytarish
    // \(…\) ichidagi content o'zgarmaydi
    cleaned = cleaned.replace(/\\cdot\s?(?![^\\(]*\\\))/g, '·');
    cleaned = cleaned.replace(/\\times\s?(?![^\\(]*\\\))/g, '×');
    cleaned = cleaned.replace(/\\div\s?(?![^\\(]*\\\))/g, '÷');

    return cleaned;
  }

  /**
   * Convert DOCX to Markdown using Pandoc
   */
  private async convertToMarkdown(docxPath: string): Promise<string> {
    return await this.extractTextWithPandoc(docxPath);
  }

  /**
   * Finalize question with default values
   */
  private finalizeQuestion(q: Partial<ParsedQuestion>): ParsedQuestion {
    return {
      text: q.text || '',
      variants: q.variants || [],
      correctAnswer: q.correctAnswer || 'A',
      points: q.points || 1,
      originalNumber: q.originalNumber,
      imageUrl: q.imageUrl,
    };
  }

  /**
   * Javoblarni ajratish
   */
  private extractOptions(line: string): Array<{ label: string; text: string }> {
    const options: Array<{ label: string; text: string }> = [];
    
    line = line.replace(/\\\)/g, ')').replace(/\\\./g, '.').replace(/\\\'/g, "'");

    // Pattern: A) text B) text C) text D) text
    const noParenMulti = /([A-D])\s+([^A-D]+?)(?=\s+[A-D]\s+|$)/g;
    let match;
    let found = false;
    
    while ((match = noParenMulti.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0 && /^[A-D]$/.test(label)) {
        options.push({ label, text: this.cleanPhysicsText(trimmed) });
        found = true;
      }
    }
    
    if (found) return options;

    // Pattern: A) text (single)
    const noParenSingle = /^([A-D])\s+(.+)$/;
    const singleMatch = noParenSingle.exec(line);
    if (singleMatch && !/ [B-D][\)\.\s]/.test(line)) {
      const [, label, text] = singleMatch;
      options.push({ label, text: this.cleanPhysicsText(text.trim()) });
      return options;
    }

    // Pattern: A) text B) text (with parentheses)
    const withParen = /([A-D])\)\s*([^A-D)]+?)(?=\s*[A-D]\)|$)/g;
    while ((match = withParen.exec(line)) !== null) {
      const [, label, text] = match;
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        options.push({ label, text: this.cleanPhysicsText(trimmed) });
      }
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
      console.log(`\n✅ [PHYSICS] 100% to'liq! Barcha savollar 4ta javobga ega.\n`);
    }
  }
}
