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
      
      // Convert to Markdown
      const markdown = await this.convertToMarkdown(filePath);
      
      console.log('📝 [PHYSICS] Markdown length:', markdown.length);
      
      // Parse with physics-specific rules
      const questions = this.parseMarkdown(markdown);
      
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // PRIORITY 1: OPTIONS (A), B), C), D))
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

      // PRIORITY 2: QUESTION or VARIANT
      const match = line.match(/^(\d+)[\\.]\s*(.+)/);
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

        if (this.isPhysicsQuestion(text)) {
          // Check if this is actually a variant
          if (current && (!current.variants || current.variants.length === 0) && num === 1 && this.isPhysicsVariant(text)) {
            variantLines.push(line);
            state = 'VARIANTS';
            continue;
          }
          
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
          current = {
            text: this.cleanPhysicsText(text).replace(/^\.\s+/, ''),
            variants: [],
            correctAnswer: 'A',
            points: 1,
          };
          state = 'QUESTION';
          variantLines = [];
        } else if (this.isPhysicsVariant(text) && current && (!current.variants || current.variants.length === 0)) {
          variantLines.push(line);
          state = 'VARIANTS';
        }
        continue;
      }

      // Continue building current question or variants
      if (current) {
        if (state === 'QUESTION' && line.length > 10 && current.text) {
          current.text += ' ' + this.cleanPhysicsText(line);
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
    
    return cleaned;
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
      console.log('⚠️  XATOLAR TOPILDI - Qo\'lda tuzatish kerak');
      console.log('='.repeat(70));
      console.log(`📊 Natija: ${fullCount}/${questions.length} to'liq (${accuracy}%)`);
      console.log('='.repeat(70));

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
