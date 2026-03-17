import { BaseParser, ParsedQuestion } from './BaseParser';

/**
 * V2 Pipeline: DOCX dan matn, rasm va jadval extraction.
 *
 * BaseParser dagi extraction logikasini qayta ishlatadi (extends),
 * lekin question parsing qilmaydi — faqat raw content qaytaradi.
 */

export interface ExtractedContent {
  /** Pandoc AST yoki mammoth dan olingan raw text (formulalar \(...\) ichida) */
  rawText: string;
  /** DOCX ichidagi rasmlar: fayl nomi → URL */
  images: Map<string, string>;
  /** Rasm o'lchamlari: image raqami → { widthPx, heightPx } */
  imageDimensions: Map<string, { widthPx: number; heightPx: number }>;
  /** Jadvallar: tableId → rasm URL */
  tables: Map<string, string>;
  /** OLE equation formulalar: image raqami → LaTeX */
  formulas: Map<string, string>;
}

class ExtractionHelper extends BaseParser {
  /**
   * BaseParser abstract methodini implement qilish (biz ishlatmaymiz).
   */
  async parse(): Promise<ParsedQuestion[]> {
    return [];
  }

  /**
   * DOCX dan barcha content ni extract qilish.
   * Pandoc JSON AST orqali text oladi (formulalar \(...\) bilan saqlanadi).
   * Rasmlar, jadvallar va OLE formulalar ham extract qilinadi.
   */
  async extractAll(filePath: string): Promise<ExtractedContent> {
    // 1. Rasmlarni extract qilish (images + OLE equations + EMF/WMF conversion)
    await this.extractImagesFromDocx(filePath);

    // 2. Jadvallarni extract qilish (TableExtractor → TableRenderer → PNG)
    await this.extractTablesFromDocx(filePath);

    // 3. Textni extract qilish (Pandoc JSON AST → clean text with \(...\) formulas)
    let rawText = '';
    try {
      rawText = await this.extractTextWithPandoc(filePath);
    } catch (pandocError) {
      console.warn('[TextExtractor] Pandoc failed, trying mammoth fallback:', (pandocError as Error).message);
      rawText = await this.extractWithMammoth(filePath);
    }

    return {
      rawText,
      images: new Map(this.extractedImages),
      imageDimensions: new Map(this.imageDimensions),
      tables: new Map(this.extractedTables),
      formulas: new Map(this.extractedFormulas),
    };
  }

  /**
   * Mammoth fallback — Pandoc ishlamaganda.
   * Formulalarni yo'qotadi, lekin matn to'g'ri chiqadi.
   */
  private async extractWithMammoth(filePath: string): Promise<string> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (error) {
      console.error('[TextExtractor] Mammoth also failed:', (error as Error).message);
      return '';
    }
  }
}

/**
 * DOCX fayldan content extract qilish.
 *
 * @param filePath - DOCX fayl yo'li
 * @returns ExtractedContent — rawText, images, tables, formulas
 */
export async function extractFromDocx(filePath: string): Promise<ExtractedContent> {
  const helper = new ExtractionHelper();
  return helper.extractAll(filePath);
}
