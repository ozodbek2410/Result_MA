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
          return stdout;
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
   * Parse questions from cleaned text
   */
  protected parseQuestions(text: string, mathBlocks: string[]): ParsedQuestion[] {
    const questions: ParsedQuestion[] = [];
    
    // Match question numbers more flexibly: 1) or 1\) at start of line or after newline
    const questionPattern = /(?:^|\n)(?:\*\*|__)?(\d+)(?:\*\*|__)?\)\s+/g;
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
      
      // OPTIMIZATION: If block is too short (< 50 chars) and has no variants,
      // it might be just question text. Try merging with next block.
      if (block.length < 100 && !block.match(/[A-D]\s*\)/i) && i < validMatches.length - 1) {
        const nextStartIdx = validMatches[i + 1].index!;
        const nextEndIdx = i < validMatches.length - 2 ? validMatches[i + 2].index! : text.length;
        const nextBlock = text.substring(nextStartIdx, nextEndIdx);
        
        // If next block starts with numbered list (not a question number),
        // merge them
        if (nextBlock.match(/^\d+\)\s+\d+[.\)]/) || nextBlock.match(/^[A-D]\s*\)/i)) {
          block = text.substring(startIdx, nextEndIdx);
          i++; // Skip next block since we merged it
          console.log(`🔗 [PARSER] Merged short block ${i} with next block`);
        }
      }
      
      const question = this.extractQuestion(block, mathBlocks);
      
      if (question) {
        console.log(`✅ [PARSER] Question ${i + 1}: ${question.text.substring(0, 50)}...`);
        questions.push(question);
      } else {
        console.log(`⚠️ [PARSER] Failed to parse question ${i + 1}`);
      }
    }
    
    return questions;
  }

  /**
   * Extract single question from text block
   */
  protected extractQuestion(block: string, mathBlocks: string[]): ParsedQuestion | null {
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
      if (line.match(/^\*\*\d+\*\*\)|^\d+\)/)) {
        questionText = line.replace(/^\*\*\d+\*\*\)\s*|\^\d+\)\s*/, '').trim();
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
      
      // Check if line has variants (standard format: A) text)
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
      
      // NEW: Check if line has INLINE variants (A)text B)text C)text D)text)
      // This is common in biology tests
      // Example: "A)1,2,6,7 B)2, 4, 8 C)2, 1, 6 D)2,6,7"
      const variantCount = (line.match(/[A-D]\s*\)/gi) || []).length;
      if (variantCount >= 2) {
        inQuestion = false;
        console.log(`🔍 [PARSER] Detected ${variantCount} inline variants in line: ${line}`);
        
        // Split by variant letters (A, B, C, D)
        // Use lookahead to split before each variant letter
        const parts = line.split(/(?=[A-D]\s*\))/i);
        
        for (const part of parts) {
          const match = part.match(/^([A-D])\s*\)\s*(.+?)$/i);
          if (match) {
            const letter = match[1].toUpperCase();
            let text = match[2].trim();
            
            if (!text) continue;
            
            // Check if bold (correct answer)
            const isBold = text.includes('**') || text.includes('____');
            if (isBold) {
              correctAnswer = letter;
              text = text.replace(/\*\*/g, '').replace(/____/g, '');
            }
            
            text = this.restoreMath(text, mathBlocks);
            text = this.finalCleanText(text, mathBlocks);
            
            console.log(`  ✅ Variant ${letter}: ${text}`);
            variants.push({ letter, text });
          }
        }
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
