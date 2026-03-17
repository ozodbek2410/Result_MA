import { ParsedQuestionSchema } from '@resultma/shared';
import type { ParsedQuestion } from '@resultma/shared';

/**
 * V2 Pipeline: Regex fallback parser — AI ishlamaganda.
 *
 * BaseParser dagi 2000+ qator regex ni ~300 qatorga soddalashtiradi.
 * Faqat eng keng tarqalgan formatlarni qo'llab-quvvatlaydi:
 *   1) savol matni A) variant B) variant C) variant D) variant
 *
 * AI primary parser, bu faqat:
 * - Internet yo'q (offline)
 * - Groq API ishlamaydi
 * - Barcha API kalitlar band
 */

/**
 * Raw textni parse qilish (AI fallback sifatida).
 *
 * @param rawText — Pandoc/mammoth dan olingan text
 * @returns ParsedQuestion[] — Zod bilan validated
 */
export function parseWithRegex(rawText: string): ParsedQuestion[] {
  if (!rawText.trim()) return [];

  // 1. Math bloklarni saqlash (\(...\) ni buzmaslik uchun)
  const { text: safeText, mathBlocks } = hideMathBlocks(rawText);

  // 2. Asosiy tozalash
  const cleaned = cleanText(safeText);

  // 3. Savollarni ajratish
  const rawQuestions = splitQuestions(cleaned);

  // 4. Har bir savolni parse qilish
  const questions: ParsedQuestion[] = [];
  for (const rawQ of rawQuestions) {
    const parsed = parseOneQuestion(rawQ.number, rawQ.text, mathBlocks);
    if (parsed) {
      questions.push(parsed);
    }
  }

  console.log(`[RegexFallback] Parsed ${questions.length} questions from ${rawQuestions.length} blocks`);
  return questions;
}

// ============================================================
// Math block protection
// ============================================================

interface MathProtected {
  text: string;
  mathBlocks: string[];
}

function hideMathBlocks(text: string): MathProtected {
  const mathBlocks: string[] = [];

  // \(...\) inline math — saqlash
  let result = text.replace(/\\\([\s\S]*?\\\)/g, (match) => {
    mathBlocks.push(match);
    return `___MATH_${mathBlocks.length - 1}___`;
  });

  // \[...\] display math — saqlash
  result = result.replace(/\\\[[\s\S]*?\\\]/g, (match) => {
    mathBlocks.push(match);
    return `___MATH_${mathBlocks.length - 1}___`;
  });

  // $...$ inline math (pandoc) — saqlash
  result = result.replace(/\$([^$\n]+)\$/g, (match, inner) => {
    mathBlocks.push(`\\(${inner}\\)`);
    return `___MATH_${mathBlocks.length - 1}___`;
  });

  return { text: result, mathBlocks };
}

function restoreMathBlocks(text: string, mathBlocks: string[]): string {
  return text.replace(/___MATH_(\d+)___/g, (_, idx) => {
    const i = parseInt(idx);
    return i < mathBlocks.length ? mathBlocks[i] : '';
  });
}

// ============================================================
// Text cleaning
// ============================================================

function cleanText(text: string): string {
  let cleaned = text;

  // Cyrillic lookalikes → Latin (O'zbek DOCX da ko'p uchraydi)
  cleaned = cleaned.replace(/А/g, 'A').replace(/В/g, 'B')
    .replace(/С/g, 'C').replace(/Д/g, 'D');

  // Pandoc artifacts
  cleaned = cleaned.replace(/\[([^\]]+)\]\{\.mark\}/g, '**$1**'); // highlight → bold
  cleaned = cleaned.replace(/\[([^\]]+)\]\{\.underline\}/g, '$1'); // underline → plain
  cleaned = cleaned.replace(/<\/?(?:p|br|div)(?:\s[^>]*)?>/gi, ''); // HTML tags
  cleaned = cleaned.replace(/\\\r?\n/g, '\n'); // escaped newlines
  cleaned = cleaned.replace(/`[^`]*`\{=[a-z]+\}/g, ''); // raw inline

  // Ortiqcha bo'sh qatorlarni tozalash
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

// ============================================================
// Question splitting
// ============================================================

interface RawQuestion {
  number: number;
  text: string;
}

function splitQuestions(text: string): RawQuestion[] {
  const questions: RawQuestion[] = [];

  // Savol raqamini topish: "1)", "1.", "1 )", "1 ." formatlar
  const pattern = /(?:^|\n)\s*(\d+)\s*[.)]\s+/g;
  const markers: Array<{ num: number; index: number }> = [];

  let match;
  while ((match = pattern.exec(text)) !== null) {
    markers.push({ num: parseInt(match[1]), index: match.index });
  }

  if (markers.length === 0) return [];

  // Faqat ketma-ket raqamlarni olish (1, 2, 3, ...)
  const sequential = filterSequential(markers);

  // Har bir savol blokini ajratish
  for (let i = 0; i < sequential.length; i++) {
    const start = sequential[i].index;
    const end = i < sequential.length - 1 ? sequential[i + 1].index : text.length;
    const block = text.substring(start, end).trim();

    // Raqamni olib tashlash
    const cleanBlock = block.replace(/^\s*\d+\s*[.)]\s+/, '');
    if (cleanBlock.trim()) {
      questions.push({ number: sequential[i].num, text: cleanBlock });
    }
  }

  return questions;
}

/**
 * Faqat ketma-ket (ascending) raqamlarni filtrlash.
 * Sub-numbering (1a, 1b) va random raqamlarni o'tkazib yuboradi.
 */
function filterSequential(markers: Array<{ num: number; index: number }>): typeof markers {
  if (markers.length === 0) return [];

  // Eng uzun ascending subsequence topish
  const result: typeof markers = [];
  let expected = markers[0].num;

  // Birinchi "1" ni topish
  const firstOne = markers.find(m => m.num === 1);
  if (firstOne) {
    expected = 1;
  }

  for (const marker of markers) {
    if (marker.num === expected) {
      result.push(marker);
      expected++;
    }
  }

  // Agar ketma-ket topilmasa — hammasi qaytarish (better than nothing)
  return result.length >= 3 ? result : markers;
}

// ============================================================
// Single question parsing
// ============================================================

function parseOneQuestion(
  number: number,
  text: string,
  mathBlocks: string[]
): ParsedQuestion | null {
  // Variantlarni ajratish
  const { questionText, variants, correctAnswer } = extractVariants(text);

  if (!questionText.trim()) return null;

  // Math bloklarni qaytarish
  const finalText = restoreMathBlocks(questionText, mathBlocks);
  const finalVariants = variants.map(v => ({
    ...v,
    text: restoreMathBlocks(v.text, mathBlocks),
  }));

  const question = {
    text: finalText.trim(),
    variants: finalVariants,
    correctAnswer: correctAnswer as 'A' | 'B' | 'C' | 'D' | '',
    points: 1,
    needsReview: finalVariants.length < 4 ? true : undefined,
  };

  // Zod validate
  const validated = ParsedQuestionSchema.safeParse(question);
  if (!validated.success) {
    return { ...question, needsReview: true } as ParsedQuestion;
  }

  return validated.data;
}

// ============================================================
// Variant extraction
// ============================================================

interface ExtractedVariants {
  questionText: string;
  variants: Array<{ letter: 'A' | 'B' | 'C' | 'D'; text: string }>;
  correctAnswer: string;
}

function extractVariants(text: string): ExtractedVariants {
  const letters = ['A', 'B', 'C', 'D'] as const;

  // Pattern: A) text, B) text, C) text, D) text
  // Qo'llab-quvvatlanadigan formatlar: A), A., a), a.
  const variantPattern = /(?:^|\s)(?:\*\*)?([A-Da-d])\s*[.)]\s*(?:\*\*)?\s*/;

  // Variantlarni topish
  const positions: Array<{ letter: string; index: number; isBold: boolean }> = [];
  const fullPattern = /(?:^|\n|\s)(\*\*)?([A-Da-d])\s*[.)]\s*(\*\*)?\s*/g;

  let match;
  while ((match = fullPattern.exec(text)) !== null) {
    const letter = match[2].toUpperCase();
    if (letters.includes(letter as typeof letters[number])) {
      const isBold = !!(match[1] || match[3]);
      positions.push({ letter, index: match.index, isBold });
    }
  }

  // Kamida 2 ta variant topilishi kerak
  if (positions.length < 2) {
    return { questionText: text, variants: [], correctAnswer: '' };
  }

  // Birinchi A ni topish — undan oldingi text = savol matni
  const firstA = positions.find(p => p.letter === 'A');
  const splitIndex = firstA ? firstA.index : positions[0].index;
  const questionText = text.substring(0, splitIndex).trim();

  // Variantlarni ajratish
  const variants: ExtractedVariants['variants'] = [];
  let correctAnswer = '';

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const start = pos.index;
    const end = i < positions.length - 1 ? positions[i + 1].index : text.length;

    let varText = text.substring(start, end);
    // Variant boshidagi "A) " ni olib tashlash
    varText = varText.replace(/^\s*\*?\*?[A-Da-d]\s*[.)]\s*\*?\*?\s*/, '').trim();
    // Oxiridagi bold markerni tozalash
    varText = varText.replace(/\*\*$/g, '').trim();

    if (pos.isBold && !correctAnswer) {
      correctAnswer = pos.letter;
    }

    if (letters.includes(pos.letter as typeof letters[number])) {
      variants.push({
        letter: pos.letter as 'A' | 'B' | 'C' | 'D',
        text: varText,
      });
    }
  }

  // Bold bo'lmasa — text ichida ** qidirish
  if (!correctAnswer) {
    for (const v of variants) {
      if (v.text.startsWith('**') || v.text.endsWith('**')) {
        correctAnswer = v.letter;
        v.text = v.text.replace(/\*\*/g, '').trim();
        break;
      }
    }
  }

  return { questionText, variants, correctAnswer };
}
