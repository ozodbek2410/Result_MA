import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import { GroqService } from './groqService';
import { wordParser } from './wordParser';
import { ParserFactory } from './parsers/ParserFactory';

interface ParsedQuestion {
  text: string;
  contextText?: string;
  contextImage?: string;
  variants: { letter: string; text: string; invalid?: boolean }[];
  correctAnswer: string;
  points: number;
  needsReview?: boolean;
  imageUrl?: string;
}

interface QuestionGroup {
  startIndex: number;
  endIndex: number;
  questions: ParsedQuestion[];
}

interface ImportResult {
  questions: ParsedQuestion[];
  detectedType: string;
  groups?: QuestionGroup[];
}

export class TestImportService {
  /**
   * Parse Excel/CSV file
   */
  static async parseExcel(filePath: string): Promise<ParsedQuestion[]> {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data: any[] = XLSX.utils.sheet_to_json(worksheet);

      const questions: ParsedQuestion[] = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        const questionText = row['Savol'] || row['Question'] || row['savol'] || row['question'] || '';
        const variantA = row['A'] || row['a'] || '';
        const variantB = row['B'] || row['b'] || '';
        const variantC = row['C'] || row['c'] || '';
        const variantD = row['D'] || row['d'] || '';
        const correctAnswer = (row["To'g'ri javob"] || row['Correct Answer'] || row['correct'] || row['Javob'] || 'A').toString().toUpperCase();
        const points = parseInt(row['Ball'] || row['Points'] || row['points'] || '1');

        if (!questionText) continue;

        const variants = [];
        if (variantA) variants.push({ letter: 'A', text: variantA.toString() });
        if (variantB) variants.push({ letter: 'B', text: variantB.toString() });
        if (variantC) variants.push({ letter: 'C', text: variantC.toString() });
        if (variantD) variants.push({ letter: 'D', text: variantD.toString() });

        if (variants.length >= 2) {
          questions.push({
            text: questionText.toString(),
            variants,
            correctAnswer: correctAnswer.charAt(0),
            points,
          });
        }
      }

      return questions;
    } catch (error: any) {
      throw new Error(`Excel faylni o'qishda xatolik: ${error.message}`);
    }
  }

  /**
   * Parse Word document using subject-specific parser
   * @param filePath - Path to DOCX file
   * @param subjectId - Subject ID (optional, defaults to 'math' for backward compatibility)
   */
  static async parseWord(filePath: string, _subjectId?: string): Promise<{ questions: ParsedQuestion[]; detectedType: string }> {
    try {
      console.log('📄 [IMPORT] Parsing DOCX file (auto-detect)');

      const parser = ParserFactory.getParser();
      const questions = await parser.parse(filePath);
      const detectedType = parser.getDetectedType();
      
      if (questions.length > 0) {
        console.log(`✅ [IMPORT] Parser extracted ${questions.length} questions (type: ${detectedType})`);
        return { questions, detectedType };
      }

      // Fallback: try mammoth + regex if parser fails
      console.log('⚠️ [IMPORT] Parser returned 0 questions, trying fallback...');
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;

      return { questions: this.parseTextContent(text), detectedType: 'generic' };
    } catch (error: any) {
      console.error('❌ [IMPORT] Error parsing Word file:', error);
      throw new Error(`Word faylni o'qishda xatolik: ${error.message}`);
    }
  }



  /**
   * Parse image using OCR
   */
  static async parseImage(filePath: string): Promise<ParsedQuestion[]> {
    try {
      const { data: { text } } = await Tesseract.recognize(filePath, 'uzb+eng');

      // Try AI parsing first
      const aiQuestions = await GroqService.parseTestWithAI(text);
      if (aiQuestions.length > 0) {
        return GroqService.convertToOurFormat(aiQuestions);
      }

      // Fallback to regex parsing
      return this.parseTextContent(text);
    } catch (error: any) {
      throw new Error(`Rasmni o'qishda xatolik: ${error.message}`);
    }
  }

  /**
   * Parse PDF file
   */
  static async parsePdf(filePath: string, _subjectId?: string): Promise<{ questions: ParsedQuestion[]; groups?: QuestionGroup[] }> {
    try {
      console.log(`[IMPORT] Parsing PDF file...`);
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      const text = data.text;
      console.log(`[IMPORT] PDF pages: ${data.numpages}, text length: ${text.length}`);

      // Clean Korean math encoding artifacts before any parsing
      const cleanedText = this.cleanPdfMathChars(text);

      // AI parsing first
      try {
        const aiQuestions = await GroqService.parseTestWithAI(cleanedText);
        if (aiQuestions.length > 0) {
          console.log(`[IMPORT] AI parsed ${aiQuestions.length} questions from PDF`);
          const questions = GroqService.convertToOurFormat(aiQuestions);
          const groups = this.detectGroups(questions);
          return { questions, groups: groups.length > 1 ? groups : undefined };
        }
      } catch (aiError) {
        console.log(`[IMPORT] AI parsing failed, using regex fallback`);
      }

      // Fallback: PDF-specific regex parsing
      const result = this.parsePdfText(cleanedText);
      return {
        questions: result.questions,
        groups: result.groups.length > 0 ? result.groups : undefined,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`PDF faylni o'qishda xatolik: ${msg}`);
    }
  }

  /**
   * Detect question groups by checking for number resets in already-parsed questions
   * Used for AI-parsed results where we don't have access to original numbering
   */
  private static detectGroups(questions: ParsedQuestion[]): QuestionGroup[] {
    if (questions.length < 10) return [];

    // Check if total count suggests multiple sets (e.g. 60 = 2x30, 90 = 3x30)
    const possibleSetSizes = [30, 25, 20, 15];
    for (const setSize of possibleSetSizes) {
      if (questions.length % setSize === 0 && questions.length / setSize >= 2) {
        const groupCount = questions.length / setSize;
        const groups: QuestionGroup[] = [];
        for (let i = 0; i < groupCount; i++) {
          const start = i * setSize;
          groups.push({
            startIndex: start,
            endIndex: start + setSize - 1,
            questions: questions.slice(start, start + setSize),
          });
        }
        console.log(`[IMPORT] detectGroups: ${questions.length} questions split into ${groupCount} groups of ${setSize}`);
        return groups;
      }
    }
    return [];
  }

  /**
   * Korean Hangul syllables that appear in place of math italic letters
   * due to incorrect font encoding in pdf-parse (PDF math fonts map to Korean code points)
   */
  private static readonly KOREAN_MATH_MAP: Record<string, string> = {
    // Uppercase - critical for A) B) C) D) variant marker detection
    '퐴': 'A', '퐵': 'B', '퐶': 'C', '퐷': 'D', '퐸': 'E', '퐹': 'F',
    '퐺': 'G', '퐻': 'H', '퐼': 'I', '퐽': 'J', '퐾': 'K', '퐿': 'L',
    '푀': 'M', '푁': 'N', '푂': 'O', '푃': 'P', '푄': 'Q', '푅': 'R',
    '푆': 'S', '푇': 'T', '푈': 'U', '푉': 'V', '푊': 'W', '푋': 'X',
    '푌': 'Y', '푍': 'Z',
    // Lowercase - common math variables
    '푎': 'a', '푏': 'b', '푐': 'c', '푑': 'd', '푒': 'e', '푓': 'f',
    '푔': 'g', '푕': 'h', '푖': 'i', '푗': 'j', '푘': 'k', '푙': 'l',
    '푚': 'm', '푛': 'n', '표': 'o', '푝': 'p', '푞': 'q', '푟': 'r',
    '푠': 's', '푡': 't', '푢': 'u', '푣': 'v', '푤': 'w', '푥': 'x',
    '푦': 'y', '푧': 'z',
  };

  /**
   * Replace Korean math font encoding artifacts with correct Latin characters
   */
  private static cleanPdfMathChars(text: string): string {
    let result = text;
    for (const [from, to] of Object.entries(TestImportService.KOREAN_MATH_MAP)) {
      result = result.split(from).join(to);
    }
    return result;
  }

  /**
   * Convert PDF formula symbols to LaTeX format so client renders them correctly
   * √n → \(\sqrt{n}\), x² → x^{2}, etc.
   */
  private static convertPdfFormulas(text: string): string {
    let result = text;
    // √(expr) → \(\sqrt{expr}\)
    result = result.replace(/√\(([^)]+)\)/g, (_m, expr) => `\\(\\sqrt{${expr.trim()}}\\)`);
    // √word/number → \(\sqrt{word}\)
    result = result.replace(/√\s*(\w+)/g, (_m, x) => `\\(\\sqrt{${x}}\\)`);
    // Unicode superscript chars
    const sup: Record<string, string> = { '²': '^{2}', '³': '^{3}', '⁴': '^{4}', '⁵': '^{5}' };
    for (const [from, to] of Object.entries(sup)) result = result.split(from).join(to);
    return result;
  }

  /**
   * PDF text specific parser - handles inline variants (A)... B)... C)... D)...)
   * Uses two-pass approach: first collects candidates, then validates sequential numbering
   * to filter out false matches from math formulas in PDF text
   */
  private static parsePdfText(rawText: string): { questions: ParsedQuestion[]; groups: QuestionGroup[] } {
    // Clean Korean math font encoding artifacts before any parsing
    const text = TestImportService.cleanPdfMathChars(rawText);

    // Pass 1: collect all candidate question blocks
    interface Candidate {
      num: number;
      question: ParsedQuestion;
    }
    const candidates: Candidate[] = [];

    const blocks = text.split(/(?=(?:^|\n)\s*\d+\s*[\.\)])/);

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      const numMatch = trimmed.match(/^(\d+)\s*[\.\)]\s*/);
      if (!numMatch) continue;

      const num = parseInt(numMatch[1]);
      if (num < 1 || num > 100) continue;

      let content = trimmed.replace(/^\d+\s*[\.\)]\s*/, '').trim();
      content = content.replace(/\n/g, ' ').replace(/\s+/g, ' ');

      const variantRegex = /\b([A-D])\)\s*/g;
      const variantPositions: Array<{ letter: string; index: number }> = [];
      let match;
      while ((match = variantRegex.exec(content)) !== null) {
        variantPositions.push({ letter: match[1], index: match.index });
      }

      if (variantPositions.length < 2) continue;

      const questionText = content.substring(0, variantPositions[0].index).trim();
      if (!questionText || questionText.length < 3) continue;

      const variants: Array<{ letter: string; text: string }> = [];
      for (let i = 0; i < variantPositions.length; i++) {
        const start = variantPositions[i].index + variantPositions[i].letter.length + 2;
        const end = i + 1 < variantPositions.length ? variantPositions[i + 1].index : content.length;
        variants.push({ letter: variantPositions[i].letter, text: content.substring(start, end).trim() });
      }

      const fmtText = TestImportService.convertPdfFormulas(questionText);
      const fmtVariants = variants.map(v => ({ ...v, text: TestImportService.convertPdfFormulas(v.text) }));
      candidates.push({
        num,
        question: { text: fmtText, variants: fmtVariants, correctAnswer: '', points: 1 },
      });
    }

    // Pass 2: extract valid sequential runs (greedy matching)
    // Walk through candidates, accept only those that match expected sequence
    const allGroups: ParsedQuestion[][] = [];
    let currentGroup: ParsedQuestion[] = [];
    let expectedNum = 1;
    const used = new Set<number>();

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];

      if (c.num === expectedNum) {
        // Perfect match
        currentGroup.push(c.question);
        used.add(i);
        expectedNum = c.num + 1;
      } else if (c.num > expectedNum && c.num <= expectedNum + 5) {
        // Small gap (some questions missed due to PDF garbling)
        currentGroup.push(c.question);
        used.add(i);
        expectedNum = c.num + 1;
      } else if (c.num === 1 && currentGroup.length >= 10) {
        // New group starts (number reset back to 1)
        allGroups.push([...currentGroup]);
        currentGroup = [c.question];
        used.add(i);
        expectedNum = 2;
      }
      // else: skip — likely a formula fragment, not a real question
    }
    if (currentGroup.length > 0) {
      allGroups.push(currentGroup);
    }

    // Flatten all groups into single questions array
    const questions: ParsedQuestion[] = [];
    const groups: QuestionGroup[] = [];
    for (const grp of allGroups) {
      const startIdx = questions.length;
      questions.push(...grp);
      groups.push({
        startIndex: startIdx,
        endIndex: startIdx + grp.length - 1,
        questions: [...grp],
      });
    }

    console.log(`[IMPORT] parsePdfText: ${candidates.length} candidates -> ${questions.length} valid questions, ${groups.length} groups`);
    if (groups.length > 1) {
      groups.forEach((g, i) => console.log(`  Group ${i + 1}: ${g.questions.length} questions`));
    }

    return { questions, groups: groups.length > 1 ? groups : [] };
  }

  /**
   * Parse text content and extract questions
   */
  private static parseTextContent(text: string): ParsedQuestion[] {
    const questions: ParsedQuestion[] = [];
    
    // Split by question numbers (1., 2., 3. or 1), 2), 3))
    const questionBlocks = text.split(/\n(?=\d+[\.\)])/);

    for (const block of questionBlocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n').map(line => line.trim()).filter(line => line);
      if (lines.length === 0) continue;

      let questionText = '';
      const variants: { letter: string; text: string }[] = [];
      let correctAnswer = '';
      let points = 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // First line should be the question
        if (i === 0) {
          // Remove question number
          questionText = line.replace(/^\d+[\.\)]\s*/, '').trim();
          continue;
        }

        // Check if it's a variant (A), B), C), D) or A., B., C., D.)
        const variantMatch = line.match(/^([A-D])[\.\)]\s*(.+)/i);
        if (variantMatch) {
          variants.push({
            letter: variantMatch[1].toUpperCase(),
            text: variantMatch[2].trim(),
          });
          continue;
        }

        // Check for correct answer (more flexible patterns)
        const correctMatch = line.match(/(?:to'?g'?ri\s*javob|correct\s*answer|javob|answer)[\s:]*([A-D])/i);
        if (correctMatch) {
          correctAnswer = correctMatch[1].toUpperCase();
          continue;
        }

        // Check for points
        const pointsMatch = line.match(/(?:ball|points?)[\s:]*(\d+)/i);
        if (pointsMatch) {
          points = parseInt(pointsMatch[1]);
          continue;
        }

        // If no match and we don't have variants yet, append to question
        if (variants.length === 0 && questionText) {
          questionText += ' ' + line;
        }
      }

      // Add question if valid
      if (questionText && variants.length >= 2) {
        questions.push({
          text: questionText,
          variants,
          correctAnswer,
          points,
        });
      }
    }

    return questions;
  }

  /**
   * Main import function
   * @param filePath - Path to file
   * @param format - File format ('word' or 'image')
   * @param subjectId - Subject ID (optional, for subject-specific parsing)
   */
  static async importTest(
    filePath: string,
    format: 'word' | 'image',
    subjectId?: string
  ): Promise<ImportResult> {
    const ext = filePath.split('.').pop()?.toLowerCase();

    // PDF auto-detect regardless of format param
    if (ext === 'pdf') {
      const result = await this.parsePdf(filePath, subjectId);
      return { questions: result.questions, detectedType: 'generic', groups: result.groups };
    }

    switch (format) {
      case 'word':
        if (ext === 'docx' || ext === 'doc') {
          return this.parseWord(filePath, subjectId);
        }
        throw new Error('Noto\'g\'ri Word format. Faqat .docx, .doc va .pdf fayllari qo\'llab-quvvatlanadi');

      case 'image':
        if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
          return { questions: await this.parseImage(filePath), detectedType: 'generic' };
        }
        throw new Error('Noto\'g\'ri rasm format. Faqat .jpg, .jpeg va .png fayllari qo\'llab-quvvatlanadi');

      default:
        throw new Error('Noma\'lum format');
    }
  }

  /**
   * Get Groq API statistics
   */
  static getGroqStats(): any {
    return GroqService.getDetailedStats();
  }

  /**
   * Get parsing logs from Groq
   */
  static getParsingLogs(): any[] {
    return GroqService.getAndClearLogs();
  }
}
