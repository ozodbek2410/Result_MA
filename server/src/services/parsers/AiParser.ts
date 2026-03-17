import { GroqService } from '../groqService';
import { ParsedQuestionSchema } from '@resultma/shared';
import type { ParsedQuestion } from '@resultma/shared';

/**
 * V2 Pipeline: AI-first parser — Groq LLM bilan structured parsing.
 *
 * Hozirgi regex-based pipeline o'rniga AI ni PRIMARY parser qiladi.
 * Formulalar server tomonida aniqlanadi — client formula detect qilishi SHART EMAS.
 */

// AI dan kutiladigan javob formati
interface AiQuestionResponse {
  detectedSubject?: string;
  questions: Array<{
    number: number;
    text: string;
    variants?: Record<string, string>;
    correctAnswer?: string;
  }>;
}

/**
 * AI uchun system prompt — ingliz tilida (LLM uchun yaxshiroq natija beradi).
 *
 * MUHIM: formulalar \(...\) delimiter bilan — client-side detect kerak EMAS.
 * Hozirgi prompt (groqService SYSTEM_PROMPT) \\\\( ishlatadi → double-escape bug.
 * Bu prompt to'g'ri \( ishlatadi.
 */
const SYSTEM_PROMPT = `You are a test question parser for Uzbek educational documents.

INPUT: Raw text extracted from a DOCX/PDF file containing numbered multiple-choice questions.

OUTPUT: JSON matching this exact schema:
{
  "detectedSubject": "math" | "physics" | "chemistry" | "biology" | "literature" | "generic",
  "questions": [
    {
      "number": 1,
      "text": "question text with formulas in \\\\(LaTeX\\\\) delimiters",
      "variants": { "A": "variant text", "B": "variant text", "C": "variant text", "D": "variant text" },
      "correctAnswer": "A" or ""
    }
  ]
}

FORMULA RULES:
- Wrap ALL math/science formulas in \\\\( and \\\\) delimiters (inline LaTeX)
- Examples: \\\\(x^2 + 3x - 4 = 0\\\\), \\\\(\\\\frac{a}{b}\\\\), \\\\(\\\\sqrt{n}\\\\)
- Chemistry: \\\\(H_2SO_4\\\\), \\\\(Fe^{3+}\\\\), \\\\(CO_2\\\\), \\\\(^{14}N\\\\)
- Physics: \\\\(v_0 = 10\\\\), \\\\(E = mc^2\\\\), \\\\(F = ma\\\\)
- If formula already has \\\\( delimiters — keep as-is
- Regular text stays as plain text, do NOT use \\\\text{} wrapper

CORRECT ANSWER DETECTION:
- If a variant is **bold**, highlighted, or marked with *, it is the correct answer
- correctAnswer should be the LETTER (A, B, C, or D)
- If uncertain, set correctAnswer to empty string ""

IMPORTANT RULES:
- Preserve original question numbering (1, 2, 3...)
- Do NOT solve problems or choose answers based on your knowledge
- Do NOT invent variants that don't exist in the text
- If text is in Uzbek/Russian — keep it as-is, do not translate
- Each variant must have exactly one letter: A, B, C, or D
- If less than 4 variants exist, include only what's in the text
- If no variants exist, set variants to empty object {}
- Text markers like ___IMAGE_N___ or ___TABLE_N___ — keep them in the text as-is
- Return ONLY valid JSON, no additional text before or after`;

/**
 * Maximum text length before chunking (Groq token limit consideration).
 * ~6000 chars ≈ ~1500 tokens. llama-3.3-70b context = 128K tokens.
 * Lekin response max_tokens 8192, shuning uchun katta textni chunk qilamiz.
 */
const MAX_CHUNK_SIZE = 12000;

/**
 * AI bilan DOCX textni parse qilish.
 *
 * @param rawText — Pandoc/mammoth dan olingan text
 * @param images — rasm Map (fayl nomi → URL)
 * @param imageDimensions — rasm o'lchamlari
 * @returns ParsedQuestion[] — Zod bilan validated
 */
export async function parseWithAi(
  rawText: string,
  images: Map<string, string>,
  imageDimensions: Map<string, { widthPx: number; heightPx: number }>
): Promise<{ questions: ParsedQuestion[]; detectedSubject: string }> {
  if (!rawText.trim()) {
    return { questions: [], detectedSubject: 'generic' };
  }

  // Text juda katta bo'lsa — chunk qilish
  const chunks = chunkText(rawText, MAX_CHUNK_SIZE);
  const allQuestions: ParsedQuestion[] = [];
  let detectedSubject = 'generic';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[AiParser] Parsing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

    let result: unknown;
    try {
      result = await GroqService.parseStructured(chunk, SYSTEM_PROMPT, {
        model: 'llama-3.3-70b-versatile',
        maxTokens: 8192,
        temperature: 0.1,
      });
    } catch (error) {
      console.warn(`[AiParser] Chunk ${i + 1} API error:`, (error as Error).message);
      continue;
    }

    if (!result || typeof result !== 'object') {
      console.warn(`[AiParser] Chunk ${i + 1} returned empty result`);
      continue;
    }

    const aiResponse = result as AiQuestionResponse;

    if (i === 0 && aiResponse.detectedSubject) {
      detectedSubject = aiResponse.detectedSubject;
    }

    if (!Array.isArray(aiResponse.questions)) {
      console.warn(`[AiParser] Chunk ${i + 1} has no questions array`);
      continue;
    }

    // Har bir savolni validate + convert qilish
    for (const aiQ of aiResponse.questions) {
      const converted = convertAiQuestion(aiQ, images, imageDimensions);
      if (converted) {
        allQuestions.push(converted);
      }
    }
  }

  console.log(`[AiParser] Total: ${allQuestions.length} validated questions, subject=${detectedSubject}`);
  return { questions: allQuestions, detectedSubject };
}

/**
 * AI javobidagi bitta savolni ParsedQuestion ga convert + validate qilish.
 */
function convertAiQuestion(
  aiQ: AiQuestionResponse['questions'][0],
  images: Map<string, string>,
  imageDimensions: Map<string, { widthPx: number; heightPx: number }>
): ParsedQuestion | null {
  try {
    // Text ni tozalash
    let text = (aiQ.text || '').trim();
    if (!text) return null;

    // \text{} wrapper ni olib tashlash (AI ba'zan qo'shib yuboradi)
    text = text.replace(/\\text\{([^}]+)\}/g, '$1');

    // Variantlarni convert qilish
    const variants: Array<{ letter: 'A' | 'B' | 'C' | 'D'; text: string }> = [];
    if (aiQ.variants && typeof aiQ.variants === 'object') {
      for (const [letter, varText] of Object.entries(aiQ.variants)) {
        const upperLetter = letter.toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(upperLetter) && varText) {
          let cleanText = (typeof varText === 'string' ? varText : String(varText)).trim();
          cleanText = cleanText.replace(/\\text\{([^}]+)\}/g, '$1');
          if (cleanText) {
            variants.push({
              letter: upperLetter as 'A' | 'B' | 'C' | 'D',
              text: cleanText,
            });
          }
        }
      }
    }

    // Correct answer
    let correctAnswer = '';
    if (aiQ.correctAnswer && ['A', 'B', 'C', 'D'].includes(aiQ.correctAnswer.toUpperCase())) {
      correctAnswer = aiQ.correctAnswer.toUpperCase();
    }

    // Rasm attach qilish (___IMAGE_N___ markerlar bo'yicha)
    let imageUrl: string | undefined;
    let imageWidth: number | undefined;
    let imageHeight: number | undefined;
    const imageMatch = text.match(/___IMAGE_(\d+)___/);
    if (imageMatch) {
      const imgNum = imageMatch[1];
      // Find the image by number in the images map
      for (const [fileName, url] of images) {
        const fileNum = fileName.match(/image(\d+)/)?.[1];
        if (fileNum === imgNum) {
          imageUrl = url;
          const dims = imageDimensions.get(imgNum);
          if (dims) {
            imageWidth = dims.widthPx;
            imageHeight = dims.heightPx;
          }
          break;
        }
      }
      // Marker ni textdan olib tashlash (rasm alohida ko'rsatiladi)
      text = text.replace(/\s*___IMAGE_\d+___\s*/g, ' ').trim();
    }

    // Zod bilan validate qilish
    const question = {
      text,
      variants,
      correctAnswer: correctAnswer as 'A' | 'B' | 'C' | 'D' | '',
      points: 1,
      needsReview: variants.length < 4 ? true : undefined,
      imageUrl,
      imageWidth,
      imageHeight,
    };

    const validated = ParsedQuestionSchema.safeParse(question);
    if (!validated.success) {
      console.warn(`[AiParser] Question #${aiQ.number} validation failed:`, validated.error.issues[0]?.message);
      // Validation xato bo'lsa ham qaytarish (needsReview bilan)
      return { ...question, needsReview: true } as ParsedQuestion;
    }

    return validated.data;
  } catch (error) {
    console.warn(`[AiParser] Error converting question #${aiQ.number}:`, (error as Error).message);
    return null;
  }
}

/**
 * Katta textni savol chegaralari bo'yicha chunk qilish.
 * Savol o'rtasida bo'lmaslik uchun savol raqamlari bo'yicha ajratadi.
 */
function chunkText(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    // Agar yangi savol boshlanishi va chunk hajmi yetarli bo'lsa
    const isQuestionStart = /^\s*\d+\s*[.)]\s/.test(line);

    if (isQuestionStart && currentChunk.length > maxSize * 0.7) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }

    currentChunk += line + '\n';
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}
