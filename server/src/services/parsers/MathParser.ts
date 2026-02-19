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
      const rawMarkdown = await this.extractTextWithPandoc(filePath);
      
      console.log('📝 [MATH] Raw Markdown length:', rawMarkdown.length);
      
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

    return { cleanText: cleaned, mathBlocks };
  }
}
