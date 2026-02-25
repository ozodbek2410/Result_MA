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
  variants: { letter: string; text: string; invalid?: boolean }[];
  correctAnswer: string;
  points: number;
  needsReview?: boolean;
  imageUrl?: string; // URL изображения вопроса
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
  static async parsePdf(filePath: string, subjectId?: string): Promise<ParsedQuestion[]> {
    try {
      console.log(`[IMPORT] Parsing PDF file...`);
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      const text = data.text;
      console.log(`[IMPORT] PDF pages: ${data.numpages}, text length: ${text.length}`);

      // AI parsing first
      try {
        const aiQuestions = await GroqService.parseTestWithAI(text);
        if (aiQuestions.length > 0) {
          console.log(`[IMPORT] AI parsed ${aiQuestions.length} questions from PDF`);
          return GroqService.convertToOurFormat(aiQuestions);
        }
      } catch (aiError) {
        console.log(`[IMPORT] AI parsing failed, using regex fallback`);
      }

      // Fallback: PDF-specific regex parsing
      return this.parsePdfText(text);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`PDF faylni o'qishda xatolik: ${msg}`);
    }
  }

  /**
   * PDF text specific parser - handles inline variants (A)... B)... C)... D)...)
   */
  private static parsePdfText(text: string): ParsedQuestion[] {
    const questions: ParsedQuestion[] = [];

    // Split by question numbers: "1." or "1)" at line start
    const blocks = text.split(/(?=(?:^|\n)\s*\d+\s*[\.\)])/);

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      // Check if block starts with a question number
      const numMatch = trimmed.match(/^(\d+)\s*[\.\)]\s*/);
      if (!numMatch) continue;

      // Remove question number
      let content = trimmed.replace(/^\d+\s*[\.\)]\s*/, '').trim();
      // Join multiline into single string for variant extraction
      content = content.replace(/\n/g, ' ').replace(/\s+/g, ' ');

      // Extract variants: A) ... B) ... C) ... D) ...
      const variantRegex = /\b([A-D])\)\s*/g;
      const variantPositions: Array<{ letter: string; index: number }> = [];
      let match;

      while ((match = variantRegex.exec(content)) !== null) {
        variantPositions.push({ letter: match[1], index: match.index });
      }

      if (variantPositions.length < 2) continue;

      // Question text is everything before first variant
      const questionText = content.substring(0, variantPositions[0].index).trim();
      if (!questionText) continue;

      // Extract variant texts
      const variants: Array<{ letter: string; text: string }> = [];
      for (let i = 0; i < variantPositions.length; i++) {
        const start = variantPositions[i].index + variantPositions[i].letter.length + 2; // skip "A) "
        const end = i + 1 < variantPositions.length ? variantPositions[i + 1].index : content.length;
        const varText = content.substring(start, end).trim();
        variants.push({ letter: variantPositions[i].letter, text: varText });
      }

      questions.push({
        text: questionText,
        variants,
        correctAnswer: 'A',
        points: 1,
      });
    }

    return questions;
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
      let correctAnswer = 'A';
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
  ): Promise<{ questions: ParsedQuestion[]; detectedType: string }> {
    const ext = filePath.split('.').pop()?.toLowerCase();

    // PDF auto-detect regardless of format param
    if (ext === 'pdf') {
      return { questions: await this.parsePdf(filePath, subjectId), detectedType: 'generic' };
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
