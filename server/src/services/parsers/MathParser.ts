import { BaseParser, ParsedQuestion } from './BaseParser';

/**
 * Math-specific parser
 * Handles LaTeX formulas, equations, and mathematical notation
 */
export class MathParser extends BaseParser {
  async parse(filePath: string): Promise<ParsedQuestion[]> {
    try {
      console.log('📐 [MATH] Parsing DOCX with math support...');
      
      await this.extractImagesFromDocx(filePath);
      let rawMarkdown = await this.extractTextWithPandoc(filePath);
      
      console.log('📝 [MATH] Raw Markdown length:', rawMarkdown.length);
      
      // Check for multiple variants (e.g., "1-Variant", "2-Variant")
      rawMarkdown = this.handleMultipleVariants(rawMarkdown);
      
      // DEBUG: Save markdown after handleMultipleVariants
      const fs = require('fs');
      fs.writeFileSync('after_handle_variants.txt', rawMarkdown);
      console.log('💾 [DEBUG] Saved markdown after handleMultipleVariants');
      
      const { cleanText, mathBlocks } = this.preCleanText(rawMarkdown);
      
      console.log('🧹 [MATH] Cleaned text length:', cleanText.length);
      console.log('🧹 [MATH] Math blocks found:', mathBlocks.length);
      
      const questions = this.parseQuestions(cleanText, mathBlocks);
      console.log(`✅ [MATH] Parsed ${questions.length} questions`);
      
      // Xatolarni tekshirish va chiroyli ko'rsatish
      this.validateAndReportIssues(questions);
      
      return questions;
    } catch (error) {
      console.error('❌ [MATH] Error:', error);
      throw new Error(
        `Failed to parse math DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle multiple variants in one file
   * Converts "1-Variant: 1-30" + "2-Variant: 1-30" → "1-60"
   */
  private handleMultipleVariants(markdown: string): string {
    const variantPattern = /(\d+)-Variant/gi;
    const variantMatches = Array.from(markdown.matchAll(variantPattern));
    
    if (variantMatches.length === 2) {
      console.log('📋 [MATH] Found 2 variants, merging...');
      
      const variant1Start = variantMatches[0].index!;
      const variant2Start = variantMatches[1].index!;
      
      const variant1Text = markdown.substring(variant1Start, variant2Start);
      let variant2Text = markdown.substring(variant2Start);
      
      // Renumber variant 2 questions: 1. → 31., 2. → 32., etc.
      // Pattern matches: start of line OR after space/punctuation
      for (let i = 30; i >= 1; i--) {
        const oldPattern = new RegExp(`(^|\\n|\\s)${i}([.)])`, 'g');
        const newNum = i + 30;
        variant2Text = variant2Text.replace(oldPattern, `$1${newNum}$2`);
      }
      
      console.log('✅ [MATH] Variants merged: 1-30 + 31-60');
      return variant1Text + '\n\n' + variant2Text;
    }
    
    return markdown;
  }

  /**
   * Xatolarni tekshirish va chiroyli ko'rsatish
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
        if (issue.variantCount === 0) {
          console.log(`   - Javoblar qatori formatini tekshiring`);
          console.log(`   - A) B) C) D) formatda yozilganligini tasdiqlang`);
        } else if (issue.variantCount < 4) {
          console.log(`   - ${4 - issue.variantCount} ta javob yo'qolgan`);
          console.log(`   - Javoblar orasida probel yoki format xatosi bo'lishi mumkin`);
          console.log(`   - DOCX faylida Savol ${issue.number} javoblarini tekshiring`);
        }
        console.log('─'.repeat(70));
      });

      console.log('\n' + '='.repeat(70));
      console.log('📝 QO\'LDA TUZATISH:');
      console.log('='.repeat(70));
      console.log(`1. DOCX faylini oching`);
      console.log(`2. Savol raqamlarini toping: ${issues.map((i) => `Q${i.number}`).join(', ')}`);
      console.log(`3. Javoblar qatorini to'g'rilang`);
      console.log(`4. Format: A)javob1 B)javob2 C)javob3 D)javob4`);
      console.log(`5. Qayta import qiling`);
      console.log('='.repeat(70) + '\n');
    } else {
      console.log('\n✅ [MATH] 100% to\'liq! Barcha savollar 4ta javobga ega.\n');
    }
  }

  /**
   * Math-specific text cleaning with LaTeX support
   */
  protected preCleanText(text: string): { cleanText: string; mathBlocks: string[] } {
    let cleaned = text;
    
    // DEBUG: Check if Q5 exists before cleaning
    const q5Before = cleaned.match(/5\. ikki sonning[^\n]*/);
    if (q5Before) {
      console.log('🔍 [DEBUG] Q5 BEFORE preCleanText:', q5Before[0].substring(0, 100));
    }

    // 1. Basic cleaning
    cleaned = cleaned.replace(/\\`/g, '`');
    cleaned = cleaned.replace(/`/g, "'");
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/\s+#{1,6}\s+/g, ' ');

    // 2. Convert Pandoc subscript/superscript to LaTeX
    cleaned = cleaned.replace(/([A-Za-z0-9])~([^~\s]+)~/g, '$1_$2');
    cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^$2');

    // 3. Unpack \mathbf{} before hiding formulas
    for (let i = 0; i < 3; i++) {
      cleaned = cleaned.replace(/\\(?:mathbf|boldsymbol|bf)\{([^{}]*)\}/g, '**$1**');
    }

    // 4. Convert dollars to LaTeX
    cleaned = cleaned.replace(/\$\$(.*?)\$\$/gs, '\\($1\\)');
    cleaned = cleaned.replace(/\$(.*?)\$/gs, '\\($1\\)');

    // 5. Extract variants from inside formulas
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (mathBlock) => {
      return mathBlock.replace(
        /([0-9}\s])(\*\*|__)?([A-D])(\*\*|__)?(?:\\?\)|\\?\.)/g,
        '$1 \\) $2$3) \\( '
      );
    });
    cleaned = cleaned.replace(/\\\(\s*\\\)/g, ' ');

    // 6. Remove image markers from Pandoc
    cleaned = cleaned.replace(/!\[\]\(media\/image(\d+)\.[a-z]+\)(\{[^}]*\})?/gi, ' ___IMAGE_$1___ ');
    cleaned = cleaned.replace(/!\[.*?\]\(.*?image(\d+).*?\)(\{[^}]*\})?/gi, ' ___IMAGE_$1___ ');

    // 7. Hide math blocks (protection)
    const mathBlocks: string[] = [];
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (match) => {
      let cleanMath = match.replace(/\\ /g, ' ');
      mathBlocks.push(cleanMath);
      return ` ___MATH_${mathBlocks.length - 1}___ `;
    });

    // 8. Separate words from formulas
    cleaned = cleaned.replace(/(___MATH_\d+___)([a-zA-Z])/g, '$1 $2');
    cleaned = cleaned.replace(/([a-zA-Z])(___MATH_\d+___)/g, '$1 $2');

    // 9. Clean escapes in text
    cleaned = cleaned.replace(/\\([.\(\)\[\]])/g, '$1');

    // 10. Normalize question numbers and variants
    cleaned = cleaned.replace(/(^|\s|\n)(\*\*|__)?(\d+)(\*\*|__)?\.\s*/g, '$1$2$3$4) ');
    cleaned = cleaned.replace(/([^\s\n])(\*\*|__)?([A-D])(\*\*|__)?\)/gi, '$1 $2$3$4)');
    cleaned = cleaned.replace(/(\d+|[A-D])(\*\*|__)?\)([^\s\n])/gi, '$1$2) $3');
    
    // DEBUG: Check if Q5 exists after cleaning
    const q5After = cleaned.match(/5\) ikki sonning[^\n]*/);
    if (q5After) {
      console.log('🔍 [DEBUG] Q5 AFTER preCleanText:', q5After[0].substring(0, 100));
    } else {
      console.log('❌ [DEBUG] Q5 LOST in preCleanText!');
    }

    return { cleanText: cleaned, mathBlocks };
  }
}
