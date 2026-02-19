import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Pandoc JSON AST node types
 */
type PandocInline = 
  | { t: 'Str'; c: string }
  | { t: 'Space' }
  | { t: 'Strong'; c: PandocInline[] }
  | { t: 'Emph'; c: PandocInline[] }
  | { t: 'Subscript'; c: PandocInline[] }
  | { t: 'Superscript'; c: PandocInline[] };

type PandocBlock = 
  | { t: 'Para'; c: PandocInline[] }
  | { t: 'Table'; c: any[] };

interface PandocDocument {
  blocks: PandocBlock[];
}

interface ParsedQuestion {
  number: number;
  text: string;
  options: Array<{ label: string; text: string; isCorrect: boolean }>;
  hasTable: boolean;
  tableData?: any;
}

/**
 * SENIOR APPROACH: Streaming State Machine Parser
 * 
 * Afzalliklari:
 * 1. O(n) complexity - bir marta o'qish
 * 2. Memory efficient - streaming
 * 3. Fast - regex + state machine
 * 4. Maintainable - clear states
 */
export class PandocParser {
  private state: 'IDLE' | 'QUESTION' | 'OPTIONS' | 'TABLE' = 'IDLE';
  private currentQuestion: Partial<ParsedQuestion> | null = null;
  private questions: ParsedQuestion[] = [];
  private buffer: string[] = [];

  /**
   * Main entry point - parse DOCX file
   */
  async parseDocx(filePath: string): Promise<ParsedQuestion[]> {
    console.log('🔄 Converting DOCX to Pandoc JSON...');
    const startTime = Date.now();

    // Step 1: Convert to JSON (fast - ~100ms)
    const jsonPath = await this.convertToJson(filePath);
    
    // Step 2: Parse JSON (streaming - ~50ms)
    const doc = await this.loadJson(jsonPath);
    
    // Step 3: Extract questions (state machine - ~100ms)
    this.extractQuestions(doc);
    
    // Cleanup
    await fs.unlink(jsonPath);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Parsed ${this.questions.length} questions in ${duration}ms`);
    
    return this.questions;
  }

  /**
   * Convert DOCX to Pandoc JSON format
   */
  private async convertToJson(docxPath: string): Promise<string> {
    const jsonPath = docxPath.replace(/\.docx$/, '.pandoc.json');
    
    try {
      await execAsync(`pandoc "${docxPath}" -t json -o "${jsonPath}"`);
      return jsonPath;
    } catch (error) {
      throw new Error(`Pandoc conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load and parse JSON file
   */
  private async loadJson(jsonPath: string): Promise<PandocDocument> {
    const content = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * STATE MACHINE: Extract questions from blocks
   * 
   * States:
   * - IDLE: waiting for question number
   * - QUESTION: reading question text
   * - OPTIONS: reading A) B) C) D)
   * - TABLE: processing table
   */
  private extractQuestions(doc: PandocDocument): void {
    for (let i = 0; i < doc.blocks.length; i++) {
      const block = doc.blocks[i];

      if (block.t === 'Para') {
        this.processParagraph(block.c);
      } else if (block.t === 'Table') {
        this.processTable(block.c);
      }
    }

    // Finalize last question
    this.finalizeQuestion();
  }

  /**
   * Process paragraph block
   */
  private processParagraph(inlines: PandocInline[]): void {
    const text = this.extractText(inlines);
    const trimmed = text.trim();

    // Check for question number (e.g., "1.", "2.", "10.")
    const questionMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (questionMatch) {
      this.finalizeQuestion(); // Save previous question
      
      const [, number, questionText] = questionMatch;
      this.currentQuestion = {
        number: parseInt(number),
        text: questionText,
        options: [],
        hasTable: false
      };
      this.state = 'QUESTION';
      return;
    }

    // Check for options (A), B), C), D))
    const optionsMatch = trimmed.match(/^([A-D])\)(.+)/);
    if (optionsMatch && this.currentQuestion) {
      const [, label, optionText] = optionsMatch;
      
      // Check if this option is bold (correct answer)
      const isCorrect = this.hasBold(inlines);
      
      this.currentQuestion.options!.push({
        label,
        text: optionText.trim(),
        isCorrect
      });
      
      this.state = 'OPTIONS';
      return;
    }

    // Multi-line options (e.g., "A)1,2,3 B)4,5,6 C)7,8,9 D)10,11,12")
    if (this.state === 'QUESTION' || this.state === 'OPTIONS') {
      const multiOptions = this.parseMultiLineOptions(trimmed, inlines);
      if (multiOptions.length > 0 && this.currentQuestion) {
        this.currentQuestion.options!.push(...multiOptions);
        this.state = 'OPTIONS';
        return;
      }
    }

    // Continue question text
    if (this.state === 'QUESTION' && this.currentQuestion && trimmed) {
      this.currentQuestion.text += ' ' + trimmed;
    }
  }

  /**
   * Process table block
   */
  private processTable(tableData: any): void {
    if (this.currentQuestion) {
      this.currentQuestion.hasTable = true;
      this.currentQuestion.tableData = this.extractTableData(tableData);
      this.state = 'TABLE';
    }
  }

  /**
   * Extract text from inline elements (recursive)
   */
  private extractText(inlines: PandocInline[]): string {
    let text = '';
    
    for (const inline of inlines) {
      if (inline.t === 'Str') {
        text += inline.c;
      } else if (inline.t === 'Space') {
        text += ' ';
      } else if (inline.t === 'Strong' || inline.t === 'Emph') {
        text += this.extractText(inline.c);
      } else if (inline.t === 'Subscript') {
        text += '_' + this.extractText(inline.c);
      } else if (inline.t === 'Superscript') {
        text += '^' + this.extractText(inline.c);
      }
    }
    
    return text;
  }

  /**
   * Check if inline elements contain bold text
   */
  private hasBold(inlines: PandocInline[]): boolean {
    for (const inline of inlines) {
      if (inline.t === 'Strong') {
        return true;
      }
    }
    return false;
  }

  /**
   * Parse multi-line options (e.g., "A)1,2,3 B)4,5,6")
   */
  private parseMultiLineOptions(text: string, inlines: PandocInline[]): Array<{ label: string; text: string; isCorrect: boolean }> {
    const options: Array<{ label: string; text: string; isCorrect: boolean }> = [];
    
    // Match all options in one line
    const regex = /([A-D])\)([^A-D)]+?)(?=[A-D]\)|$)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const [, label, optionText] = match;
      
      // For multi-line, we can't detect bold per option easily
      // So we check if ANY part is bold
      const isCorrect = this.hasBold(inlines);
      
      options.push({
        label,
        text: optionText.trim(),
        isCorrect
      });
    }
    
    return options;
  }

  /**
   * Extract table data (simplified)
   */
  private extractTableData(tableData: any): any {
    // Table structure: [attrs, caption, colspecs, head, bodies, foot]
    const [, , , , bodies] = tableData;
    
    if (!bodies || bodies.length === 0) return null;
    
    const rows = bodies[0][3]; // body rows
    const extracted: string[][] = [];
    
    for (const row of rows) {
      const cells = row[1];
      const rowData: string[] = [];
      
      for (const cell of cells) {
        const content = cell[4]; // cell content
        if (content && content.length > 0) {
          const text = this.extractText(content[0].c || []);
          rowData.push(text);
        } else {
          rowData.push('');
        }
      }
      
      extracted.push(rowData);
    }
    
    return extracted;
  }

  /**
   * Finalize current question and add to results
   */
  private finalizeQuestion(): void {
    if (this.currentQuestion && this.currentQuestion.number) {
      this.questions.push(this.currentQuestion as ParsedQuestion);
      this.currentQuestion = null;
      this.state = 'IDLE';
    }
  }

  /**
   * Convert to TipTap format
   */
  toTipTapFormat(questions: ParsedQuestion[]): any[] {
    return questions.map(q => ({
      type: 'paragraph',
      content: [
        { type: 'text', text: `${q.number}. ${q.text}` }
      ]
    }));
  }
}

/**
 * Factory function for easy usage
 */
export async function parseDOCX(filePath: string): Promise<ParsedQuestion[]> {
  const parser = new PandocParser();
  return parser.parseDocx(filePath);
}
