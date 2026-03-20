import { ImportResponseSchema } from '@resultma/shared';
import type { ImportResponse, ParsedQuestion } from '@resultma/shared';
import { extractFromDocx, ExtractedContent } from './TextExtractor';
import { parseWithAi } from './AiParser';
import { parseWithRegex } from './RegexFallbackParser';
import { GroqService } from '../groqService';

/**
 * V2 Pipeline: Import Orchestrator.
 *
 * DOCX → TextExtractor → AiParser (primary) → RegexFallback (agar AI fail)
 *      → Zod validation → ImportResponse
 *
 * Hozirgi TestImportService.parseWord() ni almashtiradi.
 */

export class ImportOrchestrator {
  /**
   * DOCX faylni parse qilish.
   *
   * 1. TextExtractor bilan content extract
   * 2. AiParser bilan AI parsing (primary)
   * 3. Agar AI fail → RegexFallbackParser
   * 4. Rasmlarni savollarga attach
   * 5. Zod bilan final validation
   */
  async parseDocx(filePath: string): Promise<ImportResponse> {
    console.log(`[ImportOrchestrator] Starting v2 parse: ${filePath}`);

    // 1. DOCX dan content extract qilish
    let content: ExtractedContent;
    try {
      content = await extractFromDocx(filePath);
    } catch (error) {
      console.error('[ImportOrchestrator] Extraction failed:', (error as Error).message);
      return this.emptyResponse('DOCX faylni o\'qishda xato: ' + (error as Error).message);
    }

    if (!content.rawText.trim()) {
      return this.emptyResponse('DOCX faylda matn topilmadi');
    }

    console.log(`[ImportOrchestrator] Extracted: ${content.rawText.length} chars, ${content.images.size} images, ${content.tables.size} tables`);

    // 2. AI bilan parsing (primary)
    let questions: ParsedQuestion[] = [];
    let detectedType = 'generic';
    let parserUsed: 'ai' | 'regex' | 'ai+regex' = 'ai';

    try {
      const aiResult = await parseWithAi(
        content.rawText,
        content.images,
        content.imageDimensions
      );

      if (aiResult.questions.length > 0) {
        questions = aiResult.questions;
        detectedType = aiResult.detectedSubject;
        parserUsed = 'ai';
        console.log(`[ImportOrchestrator] AI parsed ${questions.length} questions (${detectedType})`);
      } else {
        console.warn('[ImportOrchestrator] AI returned 0 questions, trying regex fallback');
      }
    } catch (error) {
      console.warn('[ImportOrchestrator] AI parsing failed:', (error as Error).message);
    }

    // 3. Regex fallback (agar AI fail yoki 0 natija)
    if (questions.length === 0) {
      try {
        questions = parseWithRegex(content.rawText);
        parserUsed = 'regex';
        console.log(`[ImportOrchestrator] Regex fallback parsed ${questions.length} questions`);
      } catch (error) {
        console.warn('[ImportOrchestrator] Regex fallback also failed:', (error as Error).message);
      }
    }

    // 4. OLE formula rasmlarni almashtirish
    questions = this.replaceFormulaImages(questions, content);

    // 4b. Variant WMF rasmlarini (___VIMG:URL:WxH___) imageUrl + o'lcham ga o'tkazish
    questions = questions.map(q => ({
      ...q,
      variants: q.variants.map(v => {
        // Format: ___VIMG:/uploads/test-images/uuid.png:85x49___ yoki ___VIMG:/uploads/test-images/uuid.png___
        const imgMatch = v.text.match(/___VIMG:([^:_]+(?:\.[a-z]+))(?::(\d+)x(\d+))?___/);
        if (imgMatch) {
          const result: Record<string, unknown> = { ...v, text: '', imageUrl: imgMatch[1] };
          if (imgMatch[2] && imgMatch[3]) {
            result.imageWidth = parseInt(imgMatch[2]);
            result.imageHeight = parseInt(imgMatch[3]);
          }
          return result;
        }
        return v;
      }),
    }));

    // 5. Qolgan rasmlarni attach qilish (AI topmagan rasmlar)
    questions = this.attachRemainingImages(questions, content);

    // 6. Table rasmlarni attach qilish
    questions = this.attachTables(questions, content);

    // 7. Final response
    const logs = GroqService.getAndClearLogs();

    const response: ImportResponse = {
      message: questions.length > 0
        ? `${questions.length} ta savol topildi (${parserUsed} parser)`
        : 'Savollar topilmadi',
      questions,
      detectedType,
      count: questions.length,
      parserUsed,
      logs,
    };

    // Zod validate (xavfsizlik uchun)
    try {
      return ImportResponseSchema.parse(response);
    } catch (zodError) {
      console.warn('[ImportOrchestrator] Zod validation warning, returning raw response');
      return response;
    }
  }

  /**
   * OLE equation formulas — rasm o'rniga LaTeX qo'yish.
   * BaseParser extractOleEquationFormulas() Python script orqali topadi.
   */
  private replaceFormulaImages(
    questions: ParsedQuestion[],
    content: ExtractedContent
  ): ParsedQuestion[] {
    if (content.formulas.size === 0) return questions;

    return questions.map(q => {
      let text = q.text;
      // ___IMAGE_N___ markerni tekshirish — agar bu formula rasm bo'lsa LaTeX ga almashtirish
      const imageMarkers = text.match(/___IMAGE_(\d+)___/g);
      if (imageMarkers) {
        for (const marker of imageMarkers) {
          const num = marker.match(/\d+/)?.[0];
          if (num && content.formulas.has(num)) {
            const latex = content.formulas.get(num)!;
            text = text.replace(marker, `\\(${latex}\\)`);
          }
        }
      }
      return { ...q, text };
    });
  }

  /**
   * AI topmagan rasmlarni savollarga attach qilish.
   * Text ichida ___IMAGE_N___ marker qolgan bo'lsa — imageUrl ga o'tkazish.
   */
  private attachRemainingImages(
    questions: ParsedQuestion[],
    content: ExtractedContent
  ): ParsedQuestion[] {
    return questions.map(q => {
      const match = q.text.match(/___IMAGE_(\d+)___/);
      if (!match || q.imageUrl) return q;

      const imgNum = match[1];
      let imageUrl: string | undefined;
      let imageWidth: number | undefined;
      let imageHeight: number | undefined;

      // Images map dan topish
      for (const [fileName, url] of content.images) {
        const fileNum = fileName.match(/image(\d+)/)?.[1];
        if (fileNum === imgNum) {
          imageUrl = url;
          const dims = content.imageDimensions.get(imgNum);
          if (dims) {
            imageWidth = dims.widthPx;
            imageHeight = dims.heightPx;
          }
          break;
        }
      }

      if (imageUrl) {
        const text = q.text.replace(/\s*___IMAGE_\d+___\s*/g, ' ').trim();
        return { ...q, text, imageUrl, imageWidth, imageHeight };
      }

      return q;
    });
  }

  /**
   * Jadval rasmlarni savollarga attach qilish.
   * Text ichida ___TABLE_N___ marker qolgan bo'lsa — media ga qo'shish.
   */
  private attachTables(
    questions: ParsedQuestion[],
    content: ExtractedContent
  ): ParsedQuestion[] {
    if (content.tables.size === 0) return questions;

    return questions.map(q => {
      const tableMatch = q.text.match(/___TABLE_(\d+)___/);
      if (!tableMatch) return q;

      const tableId = `table${tableMatch[1]}`;
      const tableUrl = content.tables.get(tableId);

      if (tableUrl) {
        const text = q.text.replace(/\s*___TABLE_\d+___\s*/g, ' ').trim();
        const media = [...(q.media || []), {
          type: 'table' as const,
          url: tableUrl,
          position: 'after' as const,
        }];
        return { ...q, text, media };
      }

      return q;
    });
  }

  /**
   * Bo'sh response qaytarish (xato holatlar uchun).
   */
  private emptyResponse(message: string): ImportResponse {
    return {
      message,
      questions: [],
      detectedType: 'generic',
      count: 0,
      parserUsed: 'regex',
      logs: GroqService.getAndClearLogs(),
    };
  }
}
