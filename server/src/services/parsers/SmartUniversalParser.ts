import { BaseParser, ParsedQuestion } from './BaseParser';

type DetectedContentType = 'math' | 'physics' | 'chemistry' | 'biology' | 'literature' | 'history' | 'english' | 'generic';

/**
 * Smart Universal Parser — auto-detects subject type and applies appropriate cleaning.
 * Based on MathParser pipeline (most robust: bold/highlight correct answer detection).
 * Combines safe cleanup rules from ALL subject-specific parsers.
 */
export class SmartUniversalParser extends BaseParser {
  private detectedType: DetectedContentType = 'generic';

  getDetectedType(): DetectedContentType {
    return this.detectedType;
  }

  async parse(filePath: string): Promise<ParsedQuestion[]> {
    try {
      console.log('🧠 [SMART] Universal parser — auto-detect mode');

      // 1. Extract images
      await this.extractImagesFromDocx(filePath);

      // 2. Extract tables
      await this.extractTablesFromDocx(filePath);

      // 3. Get raw markdown via Pandoc
      let rawMarkdown = await this.extractTextWithPandoc(filePath);
      console.log('📝 [SMART] Raw Markdown length:', rawMarkdown.length);

      // 4. Handle multiple variants (1-Variant, 2-Variant)
      rawMarkdown = this.handleMultipleVariants(rawMarkdown);

      // 5. Auto-detect content type BEFORE cleaning
      this.detectedType = this.detectContentType(rawMarkdown);
      console.log(`🔍 [SMART] Detected content type: ${this.detectedType}`);

      // 6. Clean text (universal preCleanText from MathParser)
      const { cleanText, mathBlocks } = this.preCleanText(rawMarkdown);
      console.log('🧹 [SMART] Cleaned text length:', cleanText.length);
      console.log('🧹 [SMART] Math blocks found:', mathBlocks.length);

      // 7. Parse questions using BaseParser's robust pipeline
      const questions = this.parseQuestions(cleanText, mathBlocks);

      // 8. Attach media
      for (const question of questions) {
        this.attachMediaToQuestion(question);
      }

      // 9. Post-process with subject-specific text cleanup
      for (const question of questions) {
        question.text = this.subjectSpecificClean(question.text);
        for (const v of question.variants) {
          v.text = this.subjectSpecificClean(v.text);
        }
      }

      console.log(`✅ [SMART] Parsed ${questions.length} questions (type: ${this.detectedType})`);

      // 10. Validate and report
      this.validateAndReportIssues(questions);

      return questions;
    } catch (error) {
      console.error('❌ [SMART] Error:', error);
      throw new Error(
        `Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Auto-detect content type from raw markdown using score-based heuristics.
   * Uzbek suffixlar uchun trailing \b ishlatilmaydi (hukmdorni, xalifalar, etc.)
   */
  private detectContentType(markdown: string): DetectedContentType {
    let mathScore = 0;
    let physicsScore = 0;
    let chemistryScore = 0;
    let biologyScore = 0;
    let literatureScore = 0;
    let historyScore = 0;
    let englishScore = 0;

    // Math indicators
    if (/\\(?:frac|sqrt|sum|int|prod|lim)\{/.test(markdown)) mathScore += 5;
    if (markdown.includes('\\(') || markdown.includes('$$')) mathScore += 3;
    if (/\\(?:mathbf|boldsymbol)\{/.test(markdown)) mathScore += 2;
    if (/\^{.*?}/.test(markdown) || /_{.*?}/.test(markdown)) mathScore += 2;

    // Physics indicators (only specific compound terms)
    if (/\b(?:m\/s|km\/h|m\/s²|kg\/m|kPa|MPa|kVt)/i.test(markdown)) physicsScore += 4;
    if (/\b(?:tezlik|tezlanish|energiya|quvvat|bosim|chastota|to'lqin|impuls|inertsiya)/i.test(markdown)) physicsScore += 3;
    if (/\b(?:Nyuton|Joul|Vatt|Amper|Volt|Paskal|Gerts|Faradey)/.test(markdown)) physicsScore += 3;

    // Chemistry indicators
    if (/[A-Z][a-z]?(?:~\d+~|\d+)[A-Z]/.test(markdown)) chemistryScore += 4;
    if (/\b(?:reaksiya|oksid|kislota|eritma|molekula|valentlik|molyar|g\/mol)/i.test(markdown)) chemistryScore += 3;
    if (/(?:->|<->|→|⇌)/.test(markdown)) chemistryScore += 2;

    // Biology indicators
    if (/\b(?:hujayra|fotosintez|xlorofill|mitoz|meioz|genotip|fenotip|xromosoma)/i.test(markdown)) biologyScore += 4;
    if (/\b(?:biologiya|anatomiya|fiziologiya|genetika|ekologiya|evolyutsiya|DNK|RNK)/i.test(markdown)) biologyScore += 3;

    // History indicators
    if (/\b(?:sulton|xalifa|imperator|podshoh|hukmdor|sulola|xonlik|saltanat|bosqin|istilo)/i.test(markdown)) historyScore += 4;
    if (/\b(?:asr|milod|eramiz|urush|jang|shartnoma|mustaqillik|qo'shin|lashkar)/i.test(markdown)) historyScore += 3;
    if (/\b(?:Mo'g'ul|Temur|Saljuq|Rim\b|Arab|Turkiston|Buxoro|Samarqand|Xorazm)/.test(markdown)) historyScore += 3;

    // Literature / Ona tili indicators
    if (/\b(?:she'r|roman|qissa|hikoya|doston|yozuvchi|shoir|asar|badiiy)/i.test(markdown)) literatureScore += 4;
    if (/\b(?:fe'l|sifat|ravish|kesim|bo'lak|turkum|undov|kelishik|imlo)/i.test(markdown)) literatureScore += 3;
    if (/\b(?:to'g'ri yozilgan|noto'g'ri yozilgan|qo'shimcha|gap bo'laklari)/i.test(markdown)) literatureScore += 3;

    // English indicators
    if (/\b(?:Choose|correct|answer|sentence|which|following|grammar|tense)\b/i.test(markdown)) englishScore += 4;
    if (/\b(?:Present|Past|Future|Simple|Continuous|Perfect|Passive|Active)\b/.test(markdown)) englishScore += 3;
    if (/\b(?:noun|verb|adjective|adverb|preposition|pronoun|article)\b/i.test(markdown)) englishScore += 3;
    if (/\b(?:Fill in|gaps?|blanks?|underlined|appropriate)\b/i.test(markdown)) englishScore += 2;
    // Fill-in-the-blank + English pronouns/auxiliaries = strong English signal
    if (/\\_\\_|_{3,}/.test(markdown)) {
      if (/\b(?:she|he|they|we|it|the|was|were|has|had|did|does|my|his|her)\b/i.test(markdown)) englishScore += 5;
    }

    console.log(`📊 [SMART] Scores: math=${mathScore} phys=${physicsScore} chem=${chemistryScore} bio=${biologyScore} lit=${literatureScore} hist=${historyScore} eng=${englishScore}`);

    const allScores = { math: mathScore, physics: physicsScore, chemistry: chemistryScore, biology: biologyScore, literature: literatureScore, history: historyScore, english: englishScore };
    const maxScore = Math.max(...Object.values(allScores));

    if (maxScore === 0) return 'generic';

    // Priority: math with LaTeX but no specific physics keywords → math
    if (mathScore >= 5 && physicsScore < 4) return 'math';
    // Physics: must have physics-specific keywords + formulas
    if (physicsScore >= 4 && mathScore >= 3) return 'physics';
    // Chemistry: chemical formulas or terms
    if (chemistryScore >= 3) return 'chemistry';

    // Highest score wins
    const winner = Object.entries(allScores).reduce((a, b) => a[1] >= b[1] ? a : b);
    return winner[0] as DetectedContentType;
  }

  /**
   * Handle multiple variants in one file (from MathParser)
   * Converts "1-Variant: 1-30" + "2-Variant: 1-30" → "1-60"
   */
  private handleMultipleVariants(markdown: string): string {
    const variantPattern = /(\d+)-Variant/gi;
    const variantMatches = Array.from(markdown.matchAll(variantPattern));

    if (variantMatches.length === 2) {
      console.log('📋 [SMART] Found 2 variants, merging...');
      const variant1Start = variantMatches[0].index!;
      const variant2Start = variantMatches[1].index!;
      const variant1Text = markdown.substring(variant1Start, variant2Start);
      let variant2Text = markdown.substring(variant2Start);

      for (let i = 30; i >= 1; i--) {
        const oldPattern = new RegExp(`(^|\\n|\\s)${i}([.)])`, 'g');
        variant2Text = variant2Text.replace(oldPattern, `$1${i + 30}$2`);
      }

      console.log('✅ [SMART] Variants merged: 1-30 + 31-60');
      return variant1Text + '\n\n' + variant2Text;
    }

    return markdown;
  }

  /**
   * Universal preCleanText — MathParser pipeline + safe rules from ALL parsers
   */
  protected preCleanText(text: string): { cleanText: string; mathBlocks: string[] } {
    let cleaned = text;

    // 1. Basic Pandoc cleanup (safe for ALL subjects)
    cleaned = cleaned.replace(/\\`/g, '`');
    cleaned = cleaned.replace(/`/g, "'");
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/\s+#{1,6}\s+/g, ' ');

    // 1.5. Strip Pandoc table formatting (grid tables with +---+ and | borders)
    cleaned = cleaned.replace(/^[+|][-=+:]+[+|]$/gm, '');
    cleaned = cleaned.replace(/^\|\s*(.*?)\s*\|$/gm, '$1');

    // 2. Pandoc subscript/superscript to LaTeX (safe for ALL — no match if absent)
    cleaned = cleaned.replace(/([A-Za-z0-9\(\)])~([^~\s]+)~/g, '$1_$2');
    cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^$2');

    // 3. Unpack \mathbf{} before hiding (safe — no match if absent)
    for (let i = 0; i < 3; i++) {
      cleaned = cleaned.replace(/\\(?:mathbf|boldsymbol|bf)\{([^{}]*)\}/g, '**$1**');
    }

    // 4. Convert dollars to \(...\) (safe — no match if absent)
    cleaned = cleaned.replace(/\$\$(.*?)\$\$/gs, '\\($1\\)');
    cleaned = cleaned.replace(/\$(.*?)\$/gs, '\\($1\\)');

    // 5. Extract variant letters from inside formulas (safe — no match if absent)
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (mathBlock) => {
      return mathBlock.replace(
        /([0-9}\s])(\*\*|__)?([A-D])(\*\*|__)?(?:\\?\)|\\?\.)/g,
        '$1 \\) $2$3) \\( '
      );
    });
    cleaned = cleaned.replace(/\\\(\s*\\\)/g, ' ');

    // 6. ALWAYS hide math blocks as ___MATH_N___ (CRITICAL — safe for ALL)
    const mathBlocks: string[] = [];
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (match) => {
      const cleanMath = match.replace(/\\ /g, ' ');
      mathBlocks.push(cleanMath);
      return ` ___MATH_${mathBlocks.length - 1}___ `;
    });

    // 7. Separate words from formula placeholders
    cleaned = cleaned.replace(/(___MATH_\d+___)([a-zA-Z])/g, '$1 $2');
    cleaned = cleaned.replace(/([a-zA-Z])(___MATH_\d+___)/g, '$1 $2');

    // 8. Clean escapes in text
    cleaned = cleaned.replace(/\\([.\(\)\[\]])/g, '$1');

    // 9. Split inline questions BEFORE normalizing dots → parens
    // "D) variant_text 18. New question" → newline before 18.
    cleaned = cleaned.replace(/([A-D]\)[^\n]*?[a-z0-9,;)\]'"*_}])\s+(\d{1,3})\.\s*([A-ZQ«"'(])/g, '$1\n$2. $3');

    // 10. Normalize question numbers: "1." → "1)"
    cleaned = cleaned.replace(/(^|\s|\n)(\*\*|__)?(\d+)(\*\*|__)?\.\s*/g, '$1$2$3$4) ');
    cleaned = cleaned.replace(/([^\s\n])(\*\*|__)?([A-D])(\*\*|__)?\)/g, '$1 $2$3$4)');
    cleaned = cleaned.replace(/(\d+|[A-D])(\*\*|__)?\)([^\s\n])/g, '$1$2) $3');

    // 11. Split inline questions AFTER normalizing (for N) format too)
    // "D) variant_text 18) New question" → newline before 18)
    cleaned = cleaned.replace(/(D\)[^\n]*?[a-z0-9,;)\]'"*_}])\s+(\d{1,3})\)\s+/g, '$1\n$2) ');

    // 12. Variant format without paren: "A text **B text** C text D text" → "A) text **B) text** C) text D) text"
    // Only when exactly 4 uppercase letters appear as variant markers at word boundaries
    cleaned = cleaned.replace(/^(.*?\?\s*)A\s+(.+?)\s+\*\*B\s+(.+?)\*\*\s+C\s+(.+?)\s+D\s+(.+)$/gm,
      '$1A) $2 **B) $3** C) $4 D) $5');
    cleaned = cleaned.replace(/^(.*?\?\s*)\*\*A\s+(.+?)\*\*\s+B\s+(.+?)\s+C\s+(.+?)\s+D\s+(.+)$/gm,
      '$1**A) $2** B) $3 C) $4 D) $5');

    return { cleanText: cleaned, mathBlocks };
  }

  /**
   * Subject-specific text cleanup — applied AFTER parsing
   */
  private subjectSpecificClean(text: string): string {
    let cleaned = text;

    // SAFE FOR ALL: Unicode math symbols to LaTeX (no match if absent)
    cleaned = cleaned.replace(/×/g, '\\times ');
    cleaned = cleaned.replace(/÷/g, '\\div ');
    cleaned = cleaned.replace(/≈/g, '\\approx ');
    cleaned = cleaned.replace(/≠/g, '\\neq ');
    cleaned = cleaned.replace(/≤/g, '\\leq ');
    cleaned = cleaned.replace(/≥/g, '\\geq ');
    cleaned = cleaned.replace(/∙/g, '\\cdot ');
    cleaned = cleaned.replace(/·/g, '\\cdot ');

    // CHEMISTRY-SPECIFIC: Only when chemistry detected
    if (this.detectedType === 'chemistry') {
      // Duplicate formula removal: H2OH2O → H2O
      cleaned = cleaned.replace(/([A-Z][a-z]?\d+)\1+/g, '$1');
      // Reaction arrows
      cleaned = cleaned.replace(/<->/g, '\u21CC'); // ⇌
      cleaned = cleaned.replace(/->/g, '\u2192');  // →
    }

    // PHYSICS/MATH: Merge adjacent LaTeX blocks
    if (this.detectedType === 'physics' || this.detectedType === 'math') {
      // number \operator \(expr\) → \(number \operator expr\)
      cleaned = cleaned.replace(/([\d,\.]+)\s*\\(cdot|times|div)\s*\\\((.*?)\\\)/g, '\\($1 \\$2 $3\\)');
      cleaned = cleaned.replace(/\\\((.*?)\\\)\s*\\(cdot|times|div)\s*([\d,\.]+)/g, '\\($1 \\$2 $3\\)');
      cleaned = cleaned.replace(/\\\((.*?)\\\)\s*\\\((.*?)\\\)/g, '\\($1 $2\\)');
    }

    return cleaned;
  }

  /**
   * Validate and report parsing issues
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
      console.log(`⚠️  ${issues.length} ta savol muammoli — ${fullCount}/${questions.length} to'liq (${accuracy}%)`);
      console.log('='.repeat(70));

      issues.forEach((issue, idx) => {
        console.log(`📌 #${idx + 1}: Savol ${issue.number} — ${issue.variantCount}/4 javob`);
        console.log(`   "${issue.text.substring(0, 80)}..."`);
      });
      console.log('='.repeat(70) + '\n');
    } else {
      console.log(`\n✅ [SMART] 100% to'liq! Barcha ${questions.length} savol 4ta javobga ega.\n`);
    }
  }
}
