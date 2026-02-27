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

    // Chemistry: check BEFORE math since chemistry files also have LaTeX (subscripts, superscripts)
    if (chemistryScore >= 3 && chemistryScore >= mathScore) return 'chemistry';
    // Math with LaTeX but no specific physics keywords → math
    if (mathScore >= 5 && physicsScore < 4) return 'math';
    // Physics: must have physics-specific keywords + formulas
    if (physicsScore >= 4 && mathScore >= 3) return 'physics';
    // Chemistry: lower score but still present
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

    // 0. Strip HTML tags from pandoc output (<p>, <br>, <div>)
    cleaned = cleaned.replace(/<\/?(?:p|br|div)(?:\s[^>]*)?>/gi, '');

    // 0. Remove pandoc trailing backslash line breaks (hard line breaks)
    // "gulukogen\" → "gulukogen", "a-1,4,6; b-2,3,5\" → "a-1,4,6; b-2,3,5"
    cleaned = cleaned.replace(/\\$/gm, '');
    cleaned = cleaned.replace(/\\\*\*/g, '**'); // "b-2,3,5\**" → "b-2,3,5**"

    // 0.1. Pandoc {.mark} span — Word highlight → bold (BEFORE math protection!)
    // [C)]{.mark} → **C)** , [C) 33]{.mark} → **C) 33**
    cleaned = cleaned.replace(/\[([^\]]+)\]\{\.mark\}/g, '**$1**');

    // 0.1. Normalize Cyrillic variant markers to Latin
    // С) → C), В) → B), А) → A) (Cyrillic look-alikes)
    cleaned = cleaned.replace(/\u0410(\s*\))/g, 'A$1');
    cleaned = cleaned.replace(/\u0412(\s*\))/g, 'B$1');
    cleaned = cleaned.replace(/\u0421(\s*\))/g, 'C$1');

    // 0.2. Normalize **D**) → **D)** (bold wraps only letter, paren outside → move inside)
    cleaned = cleaned.replace(/\*\*([A-D])\*\*(\s*\))/g, '**$1)** ');

    // 0.3. Strip pandoc italic: *text* → text (preserve **bold**)
    // *A) 2;6 **D**) 3;7* → A) 2;6 **D**) 3;7
    // *1, 3,7* → 1, 3,7 , *6*) → 6)
    cleaned = cleaned.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/gs, '$1');

    // 0.4. Strip remaining standalone * (DOCX correct answer markers)
    // "3 va 6*" → "3 va 6", "aniqlang. *" → "aniqlang.", "E*" → "E"
    // Won't touch **bold** markers since each * has adjacent *
    cleaned = cleaned.replace(/(?<!\*)\*(?!\*)/g, '');

    // 1. Basic Pandoc cleanup (safe for ALL subjects)
    cleaned = cleaned.replace(/\\`/g, '`');
    cleaned = cleaned.replace(/`[^`]*`\{=[a-z]+\}/g, ''); // raw inline before backtick→quote
    cleaned = cleaned.replace(/`/g, "'");
    cleaned = cleaned.replace(/'[^']*'\{=[a-z]+\}/g, ''); // raw inline after backtick→quote
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/\s+#{1,6}\s+/g, ' ');

    // 1.5. Strip Pandoc table formatting (grid tables with +---+ and | borders)
    cleaned = cleaned.replace(/^[+|][-=+:]+[+|]$/gm, '');
    cleaned = cleaned.replace(/^\|\s*(.*?)\s*\|$/gm, '$1');

    // 2. Pandoc subscript/superscript to LaTeX (safe for ALL — no match if absent)
    cleaned = cleaned.replace(/([A-Za-z0-9\(\)])~([^~\s]+)~/g, '$1_$2');
    // Also handle subscript at start/after space/punctuation/bold: ~19~K → _{19}K
    cleaned = cleaned.replace(/(^|\s|[.\)*])~([^~\s]+)~/gm, (_, pre, content) => {
      return content.length > 1 ? `${pre}_{${content}}` : `${pre}_${content}`;
    });
    // Multi-char superscripts need braces: ^2-^ → ^{2-}, ^23^ → ^{23}
    // Unicode \p{L} handles Cyrillic letters too (О^2-^ → О^{2-})
    cleaned = cleaned.replace(/([\p{L}\d])\^([^\^\s]+)\^/gu, (_, pre, content) => {
      return content.length > 1 ? `${pre}^{${content}}` : `${pre}^${content}`;
    });
    // Superscript at start/after space/punctuation/bold: ^14^N → ^{14}N
    // Also handles 2.^14^N where . precedes ^ (before question number normalization)
    cleaned = cleaned.replace(/(^|\s|[.\)*])(\^)([^\^\s]+)\^/gm, (_, pre, _caret, content) => {
      return content.length > 1 ? `${pre}^{${content}}` : `${pre}^${content}`;
    });

    // 3. Unpack \mathbf{} before hiding (safe — no match if absent)
    for (let i = 0; i < 3; i++) {
      cleaned = cleaned.replace(/\\(?:mathbf|boldsymbol|bf)\{([^{}]*)\}/g, '**$1**');
    }

    // 4. Convert dollars to \(...\) (safe — no match if absent)
    cleaned = cleaned.replace(/\$\$(.*?)\$\$/gs, '\\($1\\)');
    cleaned = cleaned.replace(/\$(.*?)\$/gs, '\\($1\\)');
    // 4.5. Fix \bullet → \cdot in math context (multiplication, not bullet point)
    cleaned = cleaned.replace(/\\bullet/g, '\\cdot');

    // 5. Extract variant letters from inside formulas (safe — no match if absent)
    // Added ( to lookback to handle variant at start of math block: \(A){Cl}^{-1}...
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (mathBlock) => {
      return mathBlock.replace(
        /([0-9}\s(])(\*\*|__)?([A-D])(\*\*|__)?(?:\\?\)|\\?\.)/g,
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

    // 8. Clean escapes in text (including \< \> \_ from pandoc)
    cleaned = cleaned.replace(/\\([.\(\)\[\]<>_])/g, '$1');

    // 9. Split inline questions BEFORE normalizing dots → parens
    // "D) variant_text 18. New question" → newline before 18.
    cleaned = cleaned.replace(/([A-D]\)[^\n]*?[a-z0-9,;)\]'"*_}])\s+(\d{1,3})\.\s*([A-ZQ«"'(])/g, '$1\n$2. $3');

    // 10. Normalize question numbers: "1." → "1)"
    // (?!\d) — o'nli sonlarni buzmaslik uchun (32.8 → 32.8, 1. → 1))
    cleaned = cleaned.replace(/(^|\s|\n)(\*\*|__)?(\d+)(\*\*|__)?\.(?!\d)\s*/g, '$1$2$3$4) ');
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

    // Scientific notation: 169,32·10^{-27} → \(169{,}32 \cdot 10^{-27}\)
    // Fix double dash in exponent first: ^{--24} → ^{-24}
    cleaned = cleaned.replace(/\^{--(\d+)}/g, '^{-$1}');
    // Full scientific notation with middle dot (·/∙)
    cleaned = cleaned.replace(/([\d,\.]+)\s*[·∙]\s*(\d+)\^(\{[^}]+\})/g, (_, num, base, exp) => {
      const latexNum = num.replace(/,/g, '{,}');
      return `\\(${latexNum} \\cdot ${base}^${exp}\\)`;
    });
    // Remaining middle dots → \cdot (only useful inside existing LaTeX)
    cleaned = cleaned.replace(/∙/g, '\\cdot ');
    cleaned = cleaned.replace(/·/g, '\\cdot ');

    // CHEMISTRY-SPECIFIC: Only when chemistry detected
    if (this.detectedType === 'chemistry') {
      // Fix Cyrillic lookalikes used as element symbols: О^{2-} → O^{2-}, С_2 → C_2
      cleaned = cleaned.replace(/\u041E(?=[_^{\d])/g, 'O'); // Cyrillic О → Latin O
      cleaned = cleaned.replace(/\u0421(?=[_^{\d])/g, 'C'); // Cyrillic С → Latin C
      cleaned = cleaned.replace(/\u041D(?=[_^{\d])/g, 'H'); // Cyrillic Н → Latin H

      // Duplicate formula removal: H2OH2O → H2O
      cleaned = cleaned.replace(/([A-Z][a-z]?\d+)\1+/g, '$1');
      // Reaction arrows
      cleaned = cleaned.replace(/<->/g, '\u21CC'); // ⇌
      cleaned = cleaned.replace(/->/g, '\u2192');  // →

      // Wrap chemistry formulas with subscript/superscript in LaTeX blocks
      // Skip text already inside \(...\)
      const chemBlocks: string[] = [];
      cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (m) => { chemBlocks.push(m); return `\x00C${chemBlocks.length - 1}\x00`; });

      // Isotope notation: ^{14}N, ^{13}C (mass number before element)
      cleaned = cleaned.replace(/(\^(?:\{[^}]+\}|\d))([A-Z][a-z]?)(?=\s|$|[^_^{a-z\d])/g, '\\($1$2\\)');

      // Isotope with atomic number: _{19}K^{39}, _{17}Cl^{35}
      cleaned = cleaned.replace(/(_(?:\{[^}]+\}|\d))([A-Z][a-z]?)(\^(?:\{[^}]+\}|\d))?/g, (m, sub, elem, sup) => {
        return sup ? `\\(${sub}${elem}${sup}\\)` : `\\(${sub}${elem}\\)`;
      });

      // Re-protect new \(...\) blocks from isotope regexes before chemistry formula regex
      cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (m) => { chemBlocks.push(m); return `\x00C${chemBlocks.length - 1}\x00`; });

      // Match chemistry formulas: sequences of element symbols, digits, brackets with _/^
      // Examples: K_3[Fe(CN)_6], Mn^{2+}, SO_3, Al(OH)_3, Ca^{2+}
      cleaned = cleaned.replace(/([A-Z][a-z]?[\d_^{}\[\]()A-Za-z+\-]*(?:[_^](?:\{[^}]+\}|\d))[A-Za-z\d_^{}\[\]()+\-]*)/g,
        (match) => {
          if (!/[_^]/.test(match)) return match;
          if (/^[A-D]$/.test(match)) return match;
          return `\\(${match}\\)`;
        }
      );

      // Electron configurations: 4d^8, 3s^2, 2p^{6}, 4f^{14}
      // Use \d (not \d+) so 2s^22p^5 parses as 2s^2 + 2p^5, not 2s^22
      cleaned = cleaned.replace(/(\d+[spdf])(\^(?:\{[^}]+\}|\d))(?![spdf])/g, '\\($1$2\\)');

      // Merge adjacent LaTeX: \(X\) _3 → \(X_3\), \(X\)_3 → \(X_3\)
      cleaned = cleaned.replace(/\\\(([\s\S]*?)\\\)\s*([_^](?:\{[^}]+\}|\d))/g, '\\($1$2\\)');

      cleaned = cleaned.replace(/\x00C(\d+)\x00/g, (_, i) => chemBlocks[parseInt(i)]);
    }

    // PHYSICS/MATH: Wrap bare ^/_ expressions and merge adjacent LaTeX blocks
    if (this.detectedType === 'physics' || this.detectedType === 'math') {
      // Protect existing \(...\) blocks from modification
      const exprBlocks: string[] = [];
      cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (m) => { exprBlocks.push(m); return `\x00E${exprBlocks.length - 1}\x00`; });

      // Wrap bare superscript/subscript: 120^9, 10^{23}, 2^{x+1}, n! etc.
      // Match: digits/letters followed by ^ and digit or {braced content}, optionally with more terms
      cleaned = cleaned.replace(/(\d[\d.]*)\^(\{[^}]+\}|\d+)/g, '\\($1^$2\\)');

      // Wrap algebraic equations with exponents: x^2+6x+4=0, (x^2+x+1)(x^2+x+2)=12
      cleaned = cleaned.replace(
        /(\(?[a-zA-Z]\^(?:\{[^}]+\}|\d+)[a-zA-Z\d+\-*^{}() ]*=[+\-]?\d+\)?)/g,
        (match) => {
          // Skip if contains multi-letter words (non-math text)
          const stripped = match.replace(/\^\{[^}]+\}/g, '');
          if (/[a-zA-Z]{2,}/.test(stripped)) return match;
          return `\\(${match}\\)`;
        }
      );

      // Restore protected blocks
      cleaned = cleaned.replace(/\x00E(\d+)\x00/g, (_, i) => exprBlocks[parseInt(i)]);

      // number \operator \(expr\) → \(number \operator expr\)
      cleaned = cleaned.replace(/([\d,\.]+)\s*\\(cdot|times|div)\s*\\\((.*?)\\\)/g, '\\($1 \\$2 $3\\)');
      cleaned = cleaned.replace(/\\\((.*?)\\\)\s*\\(cdot|times|div)\s*([\d,\.]+)/g, '\\($1 \\$2 $3\\)');
      cleaned = cleaned.replace(/\\\((.*?)\\\)\s*\\\((.*?)\\\)/g, '\\($1 $2\\)');
      // Standalone \operator between letters/numbers: A\cdot B → \(A \cdot B\)
      // Protect existing \(...\) blocks to avoid nesting
      const _blocks: string[] = [];
      let _tmp = cleaned.replace(/\\\([\s\S]*?\\\)/g, (m) => { _blocks.push(m); return `\x00M${_blocks.length - 1}\x00`; });
      _tmp = _tmp.replace(/([A-Za-z0-9])\s*\\(cdot|times|div)\s*([A-Za-z0-9])/g, '\\($1 \\$2 $3\\)');
      cleaned = _tmp.replace(/\x00M(\d+)\x00/g, (_, i) => _blocks[parseInt(i)]);
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
