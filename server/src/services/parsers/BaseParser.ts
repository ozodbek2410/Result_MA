import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);

export interface ParsedQuestion {
  text: string;
  variants: { letter: string; text: string }[];
  correctAnswer: string;
  points: number;
  imageUrl?: string;
}

/**
 * Base parser for all subjects
 * Provides common DOCX parsing functionality
 */
export abstract class BaseParser {
  protected extractedImages: Map<string, string> = new Map();
  
  /**
   * Main parsing method - must be implemented by subclasses
   */
  abstract parse(filePath: string): Promise<ParsedQuestion[]>;
  
  /**
   * Subject-specific text cleaning - can be overridden
   */
  protected preCleanText(text: string): { cleanText: string; mathBlocks: string[] } {
    let cleaned = text;
    const mathBlocks: string[] = [];

    // Basic cleaning (common for all subjects)
    cleaned = cleaned.replace(/\\`/g, '`');
    cleaned = cleaned.replace(/`/g, "'");
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/\s+#{1,6}\s+/g, ' ');

    return { cleanText: cleaned, mathBlocks };
  }

  /**
   * Extract images from DOCX file
   */
  protected async extractImagesFromDocx(filePath: string): Promise<void> {
    try {
      console.log('📸 [PARSER] Extracting images from DOCX...');
      
      this.extractedImages.clear();
      
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      
      const uploadDir = path.join(process.cwd(), 'uploads', 'test-images');
      if (!fsSync.existsSync(uploadDir)) {
        fsSync.mkdirSync(uploadDir, { recursive: true });
      }
      
      const imageFiles: Array<{ entry: any; size: number; name: string }> = [];
      
      for (const entry of zipEntries) {
        if (entry.entryName.startsWith('word/media/') && !entry.isDirectory) {
          const ext = path.extname(entry.entryName).toLowerCase();
          const fileName = path.basename(entry.entryName);
          
          if (['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext)) {
            const size = entry.header.size || 0;
            
            if (size > 5000) {
              imageFiles.push({ entry, size, name: fileName });
            }
          }
        }
      }
      
      imageFiles.sort((a, b) => b.size - a.size);
      
      for (const { entry, name } of imageFiles) {
        const imageBuffer = entry.getData();
        const uniqueName = `${uuidv4()}${path.extname(name)}`;
        const savePath = path.join(uploadDir, uniqueName);
        
        await fs.writeFile(savePath, imageBuffer);
        
        const imageUrl = `/uploads/test-images/${uniqueName}`;
        this.extractedImages.set(name, imageUrl);
        
        console.log(`✅ [PARSER] Saved image: ${name} -> ${imageUrl}`);
      }
      
      console.log(`✅ [PARSER] Extracted ${this.extractedImages.size} images`);
    } catch (error) {
      console.error('❌ [PARSER] Error extracting images:', error);
    }
  }

  /**
   * Extract text from DOCX using Pandoc
   */
  protected async extractTextWithPandoc(filePath: string): Promise<string> {
    try {
      const pandocPaths = [
        'pandoc',
        'C:\\Program Files\\Pandoc\\pandoc.exe',
        '/usr/local/bin/pandoc',
        '/usr/bin/pandoc',
      ];

      let lastError: any;
      for (const pandocPath of pandocPaths) {
        try {
          const { stdout } = await execFileAsync(pandocPath, [
            filePath,
            '-f',
            'docx',
            '-t',
            'markdown',
            '--wrap=none',
          ]);
          
          // Clean Pandoc escape characters and fix formatting
          return this.cleanPandocMarkdown(stdout);
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean Pandoc markdown output
   * Fixes common issues like escaped characters and missing spaces
   */
  protected cleanPandocMarkdown(markdown: string): string {
    let cleaned = markdown;
    
    // Remove escape characters
    cleaned = cleaned.replace(/\\\'/g, "'");  // \' → '
    cleaned = cleaned.replace(/\\\./g, '.');  // \. → .
    cleaned = cleaned.replace(/\\\)/g, ')');  // \) → )
    cleaned = cleaned.replace(/\\\"/g, '"');  // \" → "
    
    // Fix: Remove "\ \" (backslash + space + backslash) at END of LaTeX formulas
    // Example: $\sqrt{\mathbf{6}}\ \$ → $\sqrt{\mathbf{6}}$
    // IMPORTANT: Only remove at the END (before closing $), not in the middle!
    cleaned = cleaned.replace(/\\\s+\\\$/g, '$');
    
    // Fix: "5.To'g'ri" → "5. To'g'ri" (add space after number+dot before capital letter)
    cleaned = cleaned.replace(/(\n\d+)\.([A-Z])/g, '$1. $2');
    
    return cleaned;
  }

  /**
   * Parse questions from cleaned text
   */
  protected parseQuestions(text: string, mathBlocks: string[]): ParsedQuestion[] {
    const questions: ParsedQuestion[] = [];
    
    // Match question numbers more flexibly: 1) or 1. at start of line or after newline
    const questionPattern = /(?:^|\n)(?:\*\*|__)?(\d+)(?:\*\*|__)?[.)]\s+/g;
    const matches = Array.from(text.matchAll(questionPattern));
    
    console.log(`🔍 [PARSER] Found ${matches.length} question markers`);
    
    const validMatches = matches.filter((m) => {
      const num = parseInt(m[1]);
      return num >= 1 && num <= 100;
    });
    
    console.log(`✅ [PARSER] Valid question markers: ${validMatches.length}`);
    
    for (let i = 0; i < validMatches.length; i++) {
      const match = validMatches[i];
      const startIdx = match.index!;
      const endIdx = i < validMatches.length - 1 ? validMatches[i + 1].index! : text.length;
      
      let block = text.substring(startIdx, endIdx);
      
      // CRITICAL FIX: Check if block has variants
      // If no variants found, check next line - it might be the variants line
      const hasVariants = block.match(/[A-D]\s*\)/gi);
      const variantCount = hasVariants ? hasVariants.length : 0;
      
      if (variantCount < 2 && i < validMatches.length - 1) {
        // No variants in current block, check if next line has variants
        const nextStartIdx = validMatches[i + 1].index!;
        const nextEndIdx = i < validMatches.length - 2 ? validMatches[i + 2].index! : text.length;
        const nextBlock = text.substring(nextStartIdx, nextEndIdx);
        
        // Check if next block is actually a variants line (starts with A), B), etc.)
        const nextBlockFirstLine = nextBlock.split('\n')[0].trim();
        const startsWithVariant = nextBlockFirstLine.match(/^(?:\*\*\s*)?[A-D]\s*\)/i);
        
        if (startsWithVariant) {
          // Next block is variants line, merge it with current block
          block = text.substring(startIdx, nextEndIdx);
          i++; // Skip next block since we merged it
          console.log(`🔗 [PARSER] Merged question ${i} with variants line`);
        }
      }
      
      const question = this.extractQuestion(block, mathBlocks);
      
      if (question) {
        console.log(`✅ [PARSER] Question ${i + 1}: ${question.text.substring(0, 50)}...`);
        questions.push(question);
      } else {
        // CRITICAL: If question failed to parse, add empty placeholder
        console.log(`⚠️ [PARSER] Failed to parse question ${i + 1}, adding empty placeholder`);
        const questionNumber = parseInt(match[1]);
        questions.push({
          text: `Savol ${questionNumber} (parse qilinmadi)`,
          variants: [
            { letter: 'A', text: '' },
            { letter: 'B', text: '' },
            { letter: 'C', text: '' },
            { letter: 'D', text: '' },
          ],
          correctAnswer: 'A',
          points: 1,
        });
      }
    }
    
    return questions;
  }

  /**
   * Extract single question from text block
   */
  /**
   * Extract question with inline variants (all on same line)
   * Example: "5) question text A) 1 B) 2 **C) 3** D) 4"
   */
  private extractInlineVariants(line: string, mathBlocks: string[]): ParsedQuestion | null {
    // CRITICAL FIX: Remove question number from the beginning (more aggressive)
    // Matches: "1)" or "**1**)" or "1." at the start
    let cleanLine = line.replace(/^(?:\*\*\s*)?\d+(?:\*\*\s*)?[.)]\s*/, '').trim();
    
    // Find where variants start (first A), B), C), or D))
    const firstVariantMatch = cleanLine.match(/[A-D]\s*\)/i);
    if (!firstVariantMatch) return null;
    
    const variantStartIdx = firstVariantMatch.index!;
    const questionText = cleanLine.substring(0, variantStartIdx).trim();
    const variantsText = cleanLine.substring(variantStartIdx);
    
    // Detect correct answer (bold variant)
    const boldVariantPattern = /(?:\*\*\s*([A-D])\s*\)|([A-D])\s*\)\s*\*\*)/gi;
    const boldMatches = Array.from(variantsText.matchAll(boldVariantPattern));
    let correctAnswer = 'A';
    if (boldMatches.length > 0) {
      correctAnswer = (boldMatches[0][1] || boldMatches[0][2]).toUpperCase();
      console.log(`  🎯 Correct answer detected: ${correctAnswer}`);
    }
    
    // Remove bold markers
    let cleanVariants = variantsText.replace(/\*\*/g, ' ').replace(/____/g, ' ').replace(/\s+/g, ' ');
    
    // Split by variant letters
    const parts = cleanVariants.split(/(?=[A-D]\s*\))/i);
    const variants: { letter: string; text: string }[] = [];
    
    for (const part of parts) {
      const match = part.match(/^([A-D])\s*\)\s*(.*)$/i);
      if (match) {
        const letter = match[1].toUpperCase();
        let text = match[2].trim();
        
        text = this.restoreMath(text, mathBlocks);
        text = this.finalCleanText(text, mathBlocks);
        
        console.log(`  ✅ Variant ${letter}: ${text || '(empty)'}`);
        variants.push({ letter, text: text || '' });
      }
    }
    
    if (!questionText || variants.length < 4) return null;
    
    const finalQuestionText = this.finalCleanText(
      this.restoreMath(questionText, mathBlocks),
      mathBlocks
    );
    
    return {
      text: finalQuestionText,
      variants,
      correctAnswer,
      points: 1,
    };
  }

  protected extractQuestion(block: string, mathBlocks: string[]): ParsedQuestion | null {
    // CRITICAL FIX: Join all lines first to handle multi-line inline variants
    // Example: "5) question text A) 1 B) 2\n**C) 3** D) 4"
    const fullBlock = block.split('\n').map(l => l.trim()).filter(l => l).join(' ');
    
    // Check if this block has inline variants (all variants on same line)
    const variantPattern = /(?:\*\*\s*)?[A-D]\s*\)(?:\s*\*\*)?/gi;
    const variantMatches = fullBlock.match(variantPattern);
    const variantCount = variantMatches ? variantMatches.length : 0;
    
    // If 4 variants found in full block, process as single line
    if (variantCount === 4) {
      console.log(`🔍 [PARSER] Detected 4 inline variants in block, processing as single line`);
      return this.extractInlineVariants(fullBlock, mathBlocks);
    }
    
    // Otherwise, process line by line (standard format)
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length === 0) return null;
    
    // DEBUG: Log first 3 lines of block
    console.log(`🔍 [DEBUG] Processing block with ${lines.length} lines:`);
    lines.slice(0, 3).forEach((line, i) => {
      console.log(`  Line ${i}: ${line.substring(0, 100)}`);
    });
    
    let questionText = '';
    const variants: { letter: string; text: string }[] = [];
    let correctAnswer = 'A';
    let points = 1;
    let imageUrl: string | undefined;
    
    let inQuestion = true;
    
    for (const line of lines) {
      // CRITICAL FIX: Remove question number from question text (more aggressive)
      // Matches: "1)" or "**1**)" or "1." at the start
      if (line.match(/^(?:\*\*\s*)?\d+(?:\*\*\s*)?[.)]/)) {
        // Remove "1)" or "**1**)" or "1." from the beginning
        questionText = line.replace(/^(?:\*\*\s*)?\d+(?:\*\*\s*)?[.)]\s*/, '').trim();
        continue;
      }
      
      const imageMatch = line.match(/___IMAGE_(\d+)___/);
      if (imageMatch) {
        const imageNum = imageMatch[1];
        const imageName = `image${imageNum}.png`;
        imageUrl = this.extractedImages.get(imageName) || 
                   this.extractedImages.get(`image${imageNum}.jpg`) ||
                   this.extractedImages.get(`image${imageNum}.jpeg`);
        continue;
      }
      
      // PRIORITY 1: Check if line has INLINE variants (A)text B)text C)text D)text)
      // This must be checked BEFORE standard variant detection!
      // This is common in biology and math tests
      // Example: "A)1,2,6,7 B)2, 4, 8 C)2, 1, 6 D)2,6,7"
      // Also handles: "** A) −124** B) −105 C) −62 D) −50"
      // Also handles: "A) 2 ** B) ** ___MATH_3___ C) ___MATH_4___ D) ___MATH_5___"
      // Also handles: "A) 2 **B)** ___MATH_3___ C) ___MATH_4___ D) ___MATH_5___"
      // Count variants by looking for A), B), C), D) with optional ** before/after
      const variantPattern = /(?:\*\*\s*)?[A-D]\s*\)(?:\s*\*\*)?/gi;
      const variantMatches = line.match(variantPattern);
      const variantCount = variantMatches ? variantMatches.length : 0;
      
      if (variantCount >= 2) {
        inQuestion = false;
        console.log(`🔍 [PARSER] Detected ${variantCount} inline variants in line: ${line}`);
        
        // First, detect which variant is bold (correct answer)
        // Pattern 1: ** A) text** or **A)** text
        // Pattern 2: A) text **B)** text (bold after previous variant)
        const boldVariantPattern = /(?:\*\*\s*([A-D])\s*\)|([A-D])\s*\)\s*\*\*)/gi;
        const boldMatches = Array.from(line.matchAll(boldVariantPattern));
        if (boldMatches.length > 0) {
          const boldLetter = (boldMatches[0][1] || boldMatches[0][2]).toUpperCase();
          correctAnswer = boldLetter;
          console.log(`  🎯 Correct answer detected: ${boldLetter}`);
        }
        
        // Remove bold markers first for easier parsing
        let cleanLine = line.replace(/\*\*/g, ' ').replace(/____/g, ' ').replace(/\s+/g, ' ');
        
        // Split by variant letters (A, B, C, D)
        // Use lookahead to split before each variant letter
        const parts = cleanLine.split(/(?=[A-D]\s*\))/i);
        
        for (const part of parts) {
          const match = part.match(/^([A-D])\s*\)\s*(.*)$/i);
          if (match) {
            const letter = match[1].toUpperCase();
            let text = match[2].trim();
            
            text = this.restoreMath(text, mathBlocks);
            text = this.finalCleanText(text, mathBlocks);
            
            console.log(`  ✅ Variant ${letter}: ${text || '(empty)'}`);
            variants.push({ letter, text: text || '' });
          }
        }
        continue;
      }
      
      // PRIORITY 2: Check if line has variants (standard format: A) text on separate line)
      const variantMatch = line.match(/^(\*\*|__)?([A-D])(\*\*|__)?\)\s*(.+)/i);
      if (variantMatch) {
        inQuestion = false;
        const letter = variantMatch[2].toUpperCase();
        let text = variantMatch[4].trim();
        
        const isBold = !!(variantMatch[1] || variantMatch[3]);
        if (isBold) {
          correctAnswer = letter;
          text = text.replace(/^\*\*|\*\*$/g, '').replace(/^____|____$/g, '');
        }
        
        text = this.restoreMath(text, mathBlocks);
        text = this.finalCleanText(text, mathBlocks);
        
        variants.push({ letter, text });
        continue;
      }
      
      if (inQuestion && questionText) {
        questionText += ' ' + line;
      }
    }
    
    if (!questionText || variants.length < 2) {
      return null;
    }
    
    questionText = this.restoreMath(questionText, mathBlocks);
    questionText = this.finalCleanText(questionText, mathBlocks);
    
    return {
      text: questionText,
      variants,
      correctAnswer,
      points,
      imageUrl,
    };
  }

  /**
   * Restore math blocks in text
   */
  protected restoreMath(text: string, mathBlocks: string[]): string {
    return text.replace(/___MATH_(\d+)___/g, (_, idx) => {
      return mathBlocks[parseInt(idx)] || '';
    });
  }

  /**
   * Final text cleaning
   */
  protected finalCleanText(text: string, mathBlocks: string[]): string {
    let cleaned = text;
    
    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/____/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.trim();
    
    return cleaned;
  }
}
