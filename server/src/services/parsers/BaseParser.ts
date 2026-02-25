import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import { TableExtractor } from './TableExtractor';
import { TableRenderer } from './TableRenderer';

const execFileAsync = promisify(execFile);

export interface MediaItem {
  type: 'image' | 'table';
  url: string;
  position: 'before' | 'after' | 'inline';
}

export interface ParsedQuestion {
  text: string;
  variants: { letter: string; text: string; imageUrl?: string; imageWidth?: number; imageHeight?: number }[];
  correctAnswer: string;
  points: number;
  originalNumber?: number; // Fayldagi asl savol raqami (gap detection uchun)
  imageUrl?: string; // Legacy support
  imageWidth?: number; // Word dagi original kenglik (px)
  imageHeight?: number; // Word dagi original balandlik (px)
  media?: MediaItem[]; // Yangi format
}

/**
 * Base parser for all subjects
 * Provides common DOCX parsing functionality
 */
export abstract class BaseParser {
  protected extractedImages: Map<string, string> = new Map();
  protected extractedTables: Map<string, string> = new Map();
  protected imageDimensions: Map<string, { widthPx: number; heightPx: number }> = new Map();
  protected tableExtractor: TableExtractor;
  protected tableRenderer: TableRenderer;
  
  constructor() {
    this.tableExtractor = new TableExtractor();
    this.tableRenderer = new TableRenderer();
  }
  
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
      
      const uploadDir = path.join(__dirname, '../../../uploads', 'test-images');
      if (!fsSync.existsSync(uploadDir)) {
        fsSync.mkdirSync(uploadDir, { recursive: true });
      }
      
      const imageFiles: Array<{ entry: any; size: number; name: string }> = [];
      
      for (const entry of zipEntries) {
        if (entry.entryName.startsWith('word/media/') && !entry.isDirectory) {
          const ext = path.extname(entry.entryName).toLowerCase();
          const fileName = path.basename(entry.entryName);
          
          if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf'].includes(ext)) {
            const size = entry.header.size || 0;
            
            // Barcha rasmlarni saqlash (size filter yo'q)
            imageFiles.push({ entry, size, name: fileName });
          }
        }
      }
      
      // Tartib bo'yicha saqlash (image1, image2, ...)
      imageFiles.sort((a, b) => {
        const aNum = parseInt(a.name.match(/\d+/)?.[0] || '999');
        const bNum = parseInt(b.name.match(/\d+/)?.[0] || '999');
        return aNum - bNum;
      });
      
      for (const { entry, name } of imageFiles) {
        const imageBuffer = entry.getData();
        const ext = path.extname(name).toLowerCase();
        
        // EMF/WMF formatlarini PNG ga konvertatsiya qilish
        if (ext === '.emf' || ext === '.wmf') {
          try {
            const convertedUrl = await this.convertEmfToPng(imageBuffer, name, uploadDir);
            if (convertedUrl) {
              this.extractedImages.set(name, convertedUrl);
              console.log(`✅ [PARSER] Converted ${ext.toUpperCase()} to PNG: ${name} -> ${convertedUrl}`);
              continue;
            }
          } catch (error) {
            console.error(`❌ [PARSER] Failed to convert ${name}:`, error);
            // Fallback: save original file
          }
        }
        
        // Oddiy rasmlarni saqlash
        const uniqueName = `${uuidv4()}${path.extname(name)}`;
        const savePath = path.join(uploadDir, uniqueName);
        
        await fs.writeFile(savePath, imageBuffer);
        
        const imageUrl = `/uploads/test-images/${uniqueName}`;
        this.extractedImages.set(name, imageUrl);
        
        console.log(`✅ [PARSER] Saved image: ${name} -> ${imageUrl}`);
      }
      
      console.log(`✅ [PARSER] Extracted ${this.extractedImages.size} images`);

      // DOCX XML dan rasm o'lchamlarini o'qish (Pandoc {width=...} bo'lmagan rasmlar uchun)
      this.extractImageDimensionsFromDocxXml(zip);
    } catch (error) {
      console.error('❌ [PARSER] Error extracting images:', error);
    }
  }

  /**
   * DOCX XML dan rasm o'lchamlarini o'qish
   * word/document.xml dagi wp:extent cx/cy (EMU) va word/_rels/document.xml.rels dagi rId → filename mapping
   */
  private extractImageDimensionsFromDocxXml(zip: AdmZip): void {
    try {
      const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
      const docEntry = zip.getEntry('word/document.xml');
      if (!relsEntry || !docEntry) return;

      const relsXml = relsEntry.getData().toString('utf-8');
      const docXml = docEntry.getData().toString('utf-8');

      // rId → image filename mapping
      const rIdMap = new Map<string, string>();
      const relPattern = /Relationship[^>]*Id="(rId\d+)"[^>]*Target="media\/(image\d+\.[a-z]+)"/gi;
      let relMatch;
      while ((relMatch = relPattern.exec(relsXml)) !== null) {
        rIdMap.set(relMatch[1], relMatch[2]);
      }

      // 1) DrawingML: wp:inline/wp:anchor ichida wp:extent + a:blip
      const drawingPattern = /<(?:wp:inline|wp:anchor)[^>]*>[\s\S]*?<\/(?:wp:inline|wp:anchor)>/gi;
      let drawMatch;
      while ((drawMatch = drawingPattern.exec(docXml)) !== null) {
        const block = drawMatch[0];
        const extentMatch = block.match(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/);
        const blipMatch = block.match(/<a:blip[^>]*r:embed="(rId\d+)"/);
        if (extentMatch && blipMatch) {
          const widthPx = Math.round(parseInt(extentMatch[1]) / 914400 * 96);
          const heightPx = Math.round(parseInt(extentMatch[2]) / 914400 * 96);
          const filename = rIdMap.get(blipMatch[1]);
          if (filename) {
            const numMatch = filename.match(/image(\d+)/);
            if (numMatch && widthPx > 0 && heightPx > 0 && !this.imageDimensions.has(numMatch[1])) {
              this.imageDimensions.set(numMatch[1], { widthPx, heightPx });
              console.log(`📐 [PARSER] Image ${numMatch[1]} from DrawingML: ${widthPx}x${heightPx}px`);
            }
          }
        }
      }

      // 2) VML: v:shape style="width:137.4pt;height:33.2pt" + v:imagedata r:id="rIdN"
      const shapePattern = /v:shape[^>]*style="([^"]*)"[\s\S]*?v:imagedata[^>]*r:id="(rId\d+)"/gi;
      let shapeMatch;
      while ((shapeMatch = shapePattern.exec(docXml)) !== null) {
        const style = shapeMatch[1];
        const rId = shapeMatch[2];
        const wMatch = style.match(/width:([\d.]+)(pt|in|cm|mm)/);
        const hMatch = style.match(/height:([\d.]+)(pt|in|cm|mm)/);
        const filename = rIdMap.get(rId);
        if (wMatch && hMatch && filename) {
          const widthPx = this.parseDimensionToPixels(wMatch[1] + wMatch[2]);
          const heightPx = this.parseDimensionToPixels(hMatch[1] + hMatch[2]);
          const numMatch = filename.match(/image(\d+)/);
          if (numMatch && widthPx > 0 && heightPx > 0 && !this.imageDimensions.has(numMatch[1])) {
            this.imageDimensions.set(numMatch[1], { widthPx, heightPx });
            console.log(`📐 [PARSER] Image ${numMatch[1]} from VML: ${widthPx}x${heightPx}px`);
          }
        }
      }
    } catch (error) {
      console.error('⚠️ [PARSER] Error reading DOCX XML dimensions:', error);
    }
  }

  /**
   * Convert EMF/WMF to PNG using Python + Pillow (best quality)
   * Falls back to LibreOffice or ImageMagick if Python fails
   */
  private async convertEmfToPng(
    buffer: Buffer,
    originalName: string,
    uploadDir: string
  ): Promise<string | null> {
    try {
      const tempEmfPath = path.join(uploadDir, `temp_${uuidv4()}.emf`);
      const uniqueName = `${uuidv4()}.png`;
      const pngPath = path.join(uploadDir, uniqueName);
      
      // 1. Vaqtinchalik EMF faylni saqlash
      await fs.writeFile(tempEmfPath, buffer);
      
      let converted = false;
      
      // 2. PRIORITY 1: Python + Pillow (eng sifatli)
      const pythonPaths = [
        'python',
        'py',
        'python3',
        'C:\\Python314\\python.exe',
        'C:\\Python313\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
        '/usr/bin/python3',
        '/usr/local/bin/python3',
      ];
      
      const scriptPath = path.join(__dirname, '..', '..', '..', 'python', 'convert_emf_to_png.py');
      console.log(`🐍 [PARSER] Python script path: ${scriptPath}`);
      
      for (const pythonPath of pythonPaths) {
        try {
          const { stdout, stderr } = await execFileAsync(pythonPath, [
            scriptPath,
            tempEmfPath,
            pngPath
          ]);
          
          if (fsSync.existsSync(pngPath)) {
            converted = true;
            console.log(`✅ [PARSER] Converted EMF to PNG using Python + Pillow`);
            if (stdout) console.log(`   ${stdout.trim()}`);
            break;
          }
        } catch (err: any) {
          // Log error for debugging
          console.log(`⚠️ [PARSER] Python attempt failed (${pythonPath}): ${err.message}`);
          
          // Python failed, try next path or fallback
          if (err.stderr && err.stderr.includes('Pillow not installed')) {
            console.log(`⚠️ [PARSER] Pillow not installed, trying fallback methods...`);
            break; // Skip other Python paths
          }
        }
      }
      
      // 3. FALLBACK 1: LibreOffice (yaxshi sifat)
      if (!converted) {
        const libreofficePaths = [
          'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
          'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
          '/usr/bin/libreoffice',
          '/usr/local/bin/libreoffice',
          'soffice',
        ];
        
        for (const libreOfficePath of libreofficePaths) {
          try {
            await execFileAsync(libreOfficePath, [
              '--headless',
              '--convert-to', 'png',
              '--outdir', uploadDir,
              tempEmfPath
            ]);
            
            const tempPngPath = tempEmfPath.replace('.emf', '.png');
            if (fsSync.existsSync(tempPngPath)) {
              await fs.rename(tempPngPath, pngPath);
              converted = true;
              console.log(`✅ [PARSER] Converted EMF to PNG using LibreOffice`);
              break;
            }
          } catch (err) {
            // Try next path
          }
        }
      }
      
      // 4. FALLBACK 2: ImageMagick (oxirgi imkoniyat)
      if (!converted) {
        const magickPaths = [
          'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
          'C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe',
          'magick',
          'convert',
          '/usr/local/bin/magick',
          '/usr/bin/convert',
        ];
        
        for (const magickPath of magickPaths) {
          try {
            await execFileAsync(magickPath, [
              tempEmfPath,
              '-density', '96',
              '-quality', '100',
              '-background', 'white',
              '-alpha', 'remove',
              '-flatten',
              pngPath
            ]);
            converted = true;
            console.log(`✅ [PARSER] Converted EMF to PNG using ImageMagick`);
            break;
          } catch (err) {
            // Try next path
          }
        }
      }
      
      // 5. Vaqtinchalik faylni o'chirish
      try {
        await fs.unlink(tempEmfPath);
      } catch {}
      
      if (converted) {
        // PNG dan display o'lchamini hisoblash (150 DPI -> 96 DPI screen)
        try {
          const pngBuffer = await fs.readFile(pngPath);
          const pngDims = this.readPngDimensions(pngBuffer);
          if (pngDims) {
            const numMatch = originalName.match(/image(\d+)/);
            if (numMatch && !this.imageDimensions.has(numMatch[1])) {
              // PNG DPI dan display o'lcham = pngPx * (96 / pngDPI)
              const dpi = pngDims.dpi || 150;
              const widthPx = Math.round(pngDims.width * 96 / dpi);
              const heightPx = Math.round(pngDims.height * 96 / dpi);
              if (widthPx > 0 && heightPx > 0) {
                this.imageDimensions.set(numMatch[1], { widthPx, heightPx });
                console.log(`📐 [PARSER] Image ${numMatch[1]} from PNG DPI: ${pngDims.width}x${pngDims.height}@${dpi}dpi → ${widthPx}x${heightPx}px`);
              }
            }
          }
        } catch {}
        return `/uploads/test-images/${uniqueName}`;
      }
      
      console.error(`❌ [PARSER] Failed to convert EMF: No converter available`);
      console.error(`   Install one of: Python+Pillow, LibreOffice, or ImageMagick`);
      return null;
      
    } catch (error) {
      console.error('❌ [PARSER] EMF conversion error:', error);
      return null;
    }
  }

  /**
   * Read PNG width, height and DPI from file header (IHDR + pHYs chunks)
   */
  private readPngDimensions(buffer: Buffer): { width: number; height: number; dpi: number } | null {
    try {
      // PNG signature: 8 bytes, then IHDR chunk
      if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);

      // Search for pHYs chunk (pixels per unit)
      let dpi = 150; // default for our Python conversion
      let offset = 8;
      while (offset < buffer.length - 12) {
        const chunkLen = buffer.readUInt32BE(offset);
        const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
        if (chunkType === 'pHYs' && chunkLen === 9) {
          const ppuX = buffer.readUInt32BE(offset + 8);
          const unit = buffer.readUInt8(offset + 16);
          if (unit === 1 && ppuX > 0) {
            dpi = Math.round(ppuX / 39.3701); // meters -> inches
          }
          break;
        }
        if (chunkType === 'IDAT' || chunkType === 'IEND') break;
        offset += chunkLen + 12;
      }
      return { width, height, dpi };
    } catch {
      return null;
    }
  }

  /**
   * Extract tables from DOCX file and render as images
   */
  protected async extractTablesFromDocx(filePath: string): Promise<void> {
    try {
      console.log('📊 [PARSER] Extracting tables from DOCX...');
      
      this.extractedTables.clear();
      
      // 1. Jadvallarni ajratish
      const tables = await this.tableExtractor.extractTables(filePath);
      
      if (tables.length === 0) {
        console.log('ℹ️ [PARSER] No tables found in DOCX');
        return;
      }
      
      // 2. Jadvallarni rasm qilish
      const tableImages = await this.tableRenderer.renderMultipleTables(tables);
      
      // 3. Map ga saqlash
      for (const [tableId, imageUrl] of tableImages) {
        this.extractedTables.set(tableId, imageUrl);
      }
      
      console.log(`✅ [PARSER] Extracted ${this.extractedTables.size} tables as images`);
    } catch (error) {
      console.error('❌ [PARSER] Error extracting tables:', error);
    }
  }

  /**
   * Extract text from DOCX using Pandoc
   * Jadval markerlarini qo'yadi
   */
  protected async extractTextWithPandoc(filePath: string): Promise<string> {
    try {
      const pandocPaths = [
        'pandoc',
        'C:\\Program Files\\Pandoc\\pandoc.exe',
        '/usr/local/bin/pandoc',
        '/usr/bin/pandoc',
      ];

      // Temporary directory for extracted media
      const tempMediaDir = path.join(path.dirname(filePath), `media_${Date.now()}`);

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
            '--extract-media=' + tempMediaDir,
          ]);
          
          // Clean up temp media directory (we already extract images via adm-zip)
          try {
            if (fsSync.existsSync(tempMediaDir)) {
              fsSync.rmSync(tempMediaDir, { recursive: true, force: true });
            }
          } catch {}

          // Clean Pandoc escape characters and fix formatting
          let cleaned = this.cleanPandocMarkdown(stdout);

          // Jadval markerlarini qo'yish
          cleaned = this.replaceTablesWithMarkers(cleaned);

          return cleaned;
        } catch (err) {
          lastError = err;
          // Clean up on error too
          try {
            if (fsSync.existsSync(tempMediaDir)) {
              fsSync.rmSync(tempMediaDir, { recursive: true, force: true });
            }
          } catch {}
        }
      }
      throw lastError;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Pandoc markdown'dagi jadvallarni ___TABLE_X___ marker bilan almashtirish
   */
  protected replaceTablesWithMarkers(markdown: string): string {
    let result = markdown;
    let tableIndex = 1;
    
    // DEBUG: Save markdown to file
    const fs = require('fs');
    fs.writeFileSync('pandoc_markdown_debug.txt', markdown);
    console.log('💾 [DEBUG] Saved Pandoc markdown to pandoc_markdown_debug.txt');
    
    // Pandoc создает таблицы в формате:
    //   --- ---- ----
    //   1   Text Ha
    //   2   More Yo'q
    //   --- ---- ----
    
    // Ищем строки с дефисами (границы таблиц) и все между ними
    const tablePattern = /^\s*[-\s]{10,}\s*$[\s\S]*?^\s*[-\s]{10,}\s*$/gm;
    
    const matches = markdown.match(tablePattern);
    console.log(`🔍 [PARSER] Found ${matches ? matches.length : 0} table patterns in markdown`);
    
    if (matches) {
      matches.forEach((match, index) => {
        console.log(`📋 [PARSER] Table ${index + 1} preview: ${match.substring(0, 100)}...`);
      });
    }
    
    result = result.replace(tablePattern, (match) => {
      const marker = `___TABLE_${tableIndex}___`;
      tableIndex++;
      console.log(`🔄 [PARSER] Replaced table with ${marker}`);
      return `\n${marker}\n\n`;
    });
    
    return result;
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

    // Pandoc rasm o'lchamlarini OLDIN ajratib olish (Word original o'lchami)
    // ![](media/image1.emf){width="4.5in" height="2.3in"} or ![](tempDir/media/image1.emf){...}
    const dimPattern = /!\[.*?\]\((?:[^)]*\/)?media\/image(\d+)\.[a-z]+\)\{[^}]*?width="([^"]+)"[^}]*?height="([^"]+)"[^}]*?\}/gi;
    let dimMatch;
    while ((dimMatch = dimPattern.exec(cleaned)) !== null) {
      const [, num, width, height] = dimMatch;
      const widthPx = this.parseDimensionToPixels(width);
      const heightPx = this.parseDimensionToPixels(height);
      if (widthPx > 0 && heightPx > 0) {
        this.imageDimensions.set(num, { widthPx, heightPx });
        console.log(`📐 [PARSER] Image ${num} dimensions: ${width} x ${height} → ${widthPx}x${heightPx}px`);
      }
    }

    // Pandoc rasm markerlarini ___IMAGE_N___ ga aylantirish (BARCHA parserlar uchun)
    // ![](media/image1.png){...} or ![](tempDir/media/image1.png){...} → ___IMAGE_1___
    // Bo'shliq bilan ajratish — inline rasmlar variant ichida qoladi, lekin text bilan birlashmaydi
    cleaned = cleaned.replace(/!\[\]\((?:[^)]*\/)?media\/image(\d+)\.[a-z]+\)(\{[^}]*\})?/gi, ' ___IMAGE_$1___ ');
    cleaned = cleaned.replace(/!\[.*?\]\((?:[^)]*\/)?media\/image(\d+)(?:\.[a-z]+)?(?:[^)]*)\)(\{[^}]*\})?/gi, ' ___IMAGE_$1___ ');
    // Bold ichidagi rasmlarni tozalash: **___IMAGE_1___** → ___IMAGE_1___
    cleaned = cleaned.replace(/\*\*\s*(___IMAGE_\d+___)\s*\*\*/g, ' $1 ');
    // Rasm markerdan keyin savol raqami kelsa — newline bilan ajratish
    // Masalan: "___IMAGE_1___ 12. Savol matni" → "___IMAGE_1___\n12. Savol matni"
    cleaned = cleaned.replace(/(___IMAGE_\d+___)\s*(\d{1,3}[\.\)])/g, '$1\n$2');

    return cleaned;
  }

  /**
   * Pandoc dimension stringni pikselga aylantirish
   * "4.5in" → 432px (96 DPI - Word screen display DPI)
   * "11.43cm" → 432px
   */
  private parseDimensionToPixels(value: string): number {
    const match = value.match(/([\d.]+)\s*(in|cm|mm|px|pt)?/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2] || 'in';
    switch (unit) {
      case 'in': return Math.round(num * 96);
      case 'cm': return Math.round(num * 96 / 2.54);
      case 'mm': return Math.round(num * 96 / 25.4);
      case 'pt': return Math.round(num * 96 / 72);
      case 'px': return Math.round(num);
      default: return Math.round(num * 96);
    }
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
    
    let validMatches = matches.filter((m) => {
      const num = parseInt(m[1]);
      return num >= 1 && num <= 100;
    });

    console.log(`✅ [PARSER] Valid question markers: ${validMatches.length}`);

    // Sequential filter: skip sub-items (e.g., "1) sazavor; 2) pinhona" inside questions)
    validMatches = this.filterSequentialMarkers(validMatches);

    for (let i = 0; i < validMatches.length; i++) {
      const match = validMatches[i];
      const startIdx = match.index!;
      const endIdx = i < validMatches.length - 1 ? validMatches[i + 1].index! : text.length;
      
      let block = text.substring(startIdx, endIdx);
      
      // CRITICAL FIX: Check if block has variants
      // If no variants found, check next line - it might be the variants line
      const hasVariants = block.match(/[A-D]\s*\)/g);
      const variantCount = hasVariants ? hasVariants.length : 0;
      
      if (variantCount < 2 && i < validMatches.length - 1) {
        // No variants in current block, check if next line has variants
        const nextStartIdx = validMatches[i + 1].index!;
        const nextEndIdx = i < validMatches.length - 2 ? validMatches[i + 2].index! : text.length;
        const nextBlock = text.substring(nextStartIdx, nextEndIdx);
        
        // Check if next block is actually a variants line (starts with A), B), etc.)
        const nextBlockFirstLine = nextBlock.split('\n')[0].trim();
        const startsWithVariant = nextBlockFirstLine.match(/^(?:\*\*\s*)?[A-D]\s*\)/);
        
        if (startsWithVariant) {
          // Next block is variants line, merge it with current block
          block = text.substring(startIdx, nextEndIdx);
          i++; // Skip next block since we merged it
          console.log(`🔗 [PARSER] Merged question ${i} with variants line`);
        }
      }
      
      const question = this.extractQuestion(block, mathBlocks);
      
      if (question) {
        question.originalNumber = parseInt(match[1]);
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
   * Filter question markers to keep only ascending sequence.
   * Skips sub-items (1, 2, 3 inside question body) that break numbering.
   */
  private filterSequentialMarkers(matches: RegExpExecArray[]): RegExpExecArray[] {
    if (matches.length <= 1) return matches;

    const nums = matches.map(m => parseInt(m[1]));

    // Find the start index giving the longest ascending subsequence
    let bestStart = 0;
    let bestLen = 0;

    for (let s = 0; s < nums.length; s++) {
      let len = 1;
      let last = nums[s];
      for (let j = s + 1; j < nums.length; j++) {
        if (nums[j] > last) { len++; last = nums[j]; }
      }
      if (len > bestLen) { bestLen = len; bestStart = s; }
    }

    // Build filtered list from best start
    const filtered: RegExpExecArray[] = [];
    let lastNum = 0;

    for (let i = bestStart; i < matches.length; i++) {
      const n = parseInt(matches[i][1]);
      if (n > lastNum) {
        filtered.push(matches[i]);
        lastNum = n;
      }
    }

    if (filtered.length < matches.length) {
      console.log(`📊 [PARSER] Sequential filter: ${matches.length} → ${filtered.length} (skipped ${matches.length - filtered.length} sub-items)`);
    }

    return filtered;
  }

  /**
   * Extract question with inline variants (all on same line)
   * Example: "5) question text A) 1 B) 2 **C) 3** D) 4"
   */
  private extractInlineVariants(line: string, mathBlocks: string[]): ParsedQuestion | null {
    // CRITICAL FIX: Remove question number from the beginning (more aggressive)
    // Matches: "1)" or "**1**)" or "1." at the start
    let cleanLine = line.replace(/^(?:\*\*\s*)?\d+(?:\*\*\s*)?[.)]\s*/, '').trim();
    
    // Find where variants start (first A), B), C), or D))
    const firstVariantMatch = cleanLine.match(/[A-D]\s*\)/);
    if (!firstVariantMatch) return null;

    const variantStartIdx = firstVariantMatch.index!;
    const questionText = cleanLine.substring(0, variantStartIdx).trim();
    const variantsText = cleanLine.substring(variantStartIdx);

    // Detect correct answer (bold variant)
    const boldVariantPattern = /(?:\*\*\s*([A-D])\s*\)|([A-D])\s*\)\s*\*\*)/g;
    const boldMatches = Array.from(variantsText.matchAll(boldVariantPattern));
    let correctAnswer = 'A';
    if (boldMatches.length > 0) {
      correctAnswer = (boldMatches[0][1] || boldMatches[0][2]);
      console.log(`  🎯 Correct answer detected: ${correctAnswer}`);
    }

    // Remove bold markers
    let cleanVariants = variantsText.replace(/\*\*/g, ' ').replace(/____/g, ' ').replace(/\s+/g, ' ');

    // Split by variant letters (uppercase only)
    const parts = cleanVariants.split(/(?=[A-D]\s*\))/);
    const variants: { letter: string; text: string }[] = [];

    for (const part of parts) {
      const match = part.match(/^([A-D])\s*\)\s*(.*)$/);
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
    // Rasm markerlarini OLDIN ajratib olish (variant matniga kirib ketmasligi uchun)
    let extractedImageUrl: string | undefined;
    const allLines = block.split('\n').map(l => l.trim()).filter(l => l);
    const nonImageLines: string[] = [];
    for (const line of allLines) {
      if (/^___IMAGE_\d+___$/.test(line)) {
        // Standalone rasm marker — ajratib olish
        const imgMatch = line.match(/___IMAGE_(\d+)___/);
        if (imgMatch && !extractedImageUrl) {
          extractedImageUrl = this.findImageByNumber(imgMatch[1]);
        }
      } else {
        nonImageLines.push(line);
      }
    }

    // CRITICAL FIX: Join all lines first to handle multi-line inline variants
    // Example: "5) question text A) 1 B) 2\n**C) 3** D) 4"
    const fullBlock = nonImageLines.join(' ');

    // Check if this block has inline variants (all variants on same line)
    const variantPatternUpper = /(?:\*\*\s*)?[A-D]\s*\)(?:\s*\*\*)?/g;
    const variantMatchesUpper = fullBlock.match(variantPatternUpper);
    const variantCountUpper = variantMatchesUpper ? variantMatchesUpper.length : 0;

    // If 4 variants found in full block, process as single line
    if (variantCountUpper === 4) {
      console.log(`🔍 [PARSER] Detected 4 inline variants in block, processing as single line`);
      const result = this.extractInlineVariants(fullBlock, mathBlocks);
      if (result && extractedImageUrl && !result.imageUrl) {
        result.imageUrl = extractedImageUrl;
      }
      return result;
    }

    // Otherwise, process line by line (standard format)
    const lines = nonImageLines;
    
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
      // Stop if we already have all 4 standard variants (A, B, C, D)
      if (['A', 'B', 'C', 'D'].every(l => variants.some(v => v.letter === l))) break;

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
        imageUrl = this.findImageByNumber(imageNum);
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
      const variantPatternLine = /(?:\*\*\s*)?[A-D]\s*\)(?:\s*\*\*)?/g;
      const variantMatchesLine = line.match(variantPatternLine);
      const variantCountLine = variantMatchesLine ? variantMatchesLine.length : 0;

      if (variantCountLine >= 2) {
        inQuestion = false;
        console.log(`🔍 [PARSER] Detected ${variantCountLine} inline variants in line: ${line}`);

        // Detect which variant is bold (correct answer)
        const boldVariantPattern = /(?:\*\*\s*([A-D])\s*\)|([A-D])\s*\)\s*\*\*)/g;
        const boldMatches = Array.from(line.matchAll(boldVariantPattern));
        if (boldMatches.length > 0) {
          correctAnswer = boldMatches[0][1] || boldMatches[0][2];
          console.log(`  🎯 Correct answer detected: ${correctAnswer}`);
        }

        // Remove bold markers first for easier parsing
        let cleanLine = line.replace(/\*\*/g, ' ').replace(/____/g, ' ').replace(/\s+/g, ' ');

        // Split by variant letters (uppercase only)
        const parts = cleanLine.split(/(?=[A-D]\s*\))/);

        for (const part of parts) {
          const match = part.match(/^([A-D])\s*\)\s*(.*)$/);
          if (match) {
            const letter = match[1];
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
      imageUrl: imageUrl || extractedImageUrl,
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

  /**
   * Rasm raqami bo'yicha extractedImages dan topish
   * Barcha formatlarni qo'llab-quvvatlaydi (png, jpg, emf, wmf, gif, bmp)
   */
  protected findImageByNumber(imageNum: string): string | undefined {
    const baseName = `image${imageNum}`;
    // Tez-tez ishlatiladigan formatlarni birinchi tekshirish
    const url = this.extractedImages.get(`${baseName}.png`) ||
                this.extractedImages.get(`${baseName}.jpg`) ||
                this.extractedImages.get(`${baseName}.jpeg`) ||
                this.extractedImages.get(`${baseName}.emf`) ||
                this.extractedImages.get(`${baseName}.wmf`) ||
                this.extractedImages.get(`${baseName}.gif`) ||
                this.extractedImages.get(`${baseName}.bmp`);
    if (url) return url;

    // Boshqa har qanday format uchun map'ni tekshirish
    for (const [key, value] of this.extractedImages.entries()) {
      if (key.startsWith(baseName + '.')) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Savol uchun media topish (rasm va jadvallar)
   */
  protected findMediaForQuestion(questionText: string): MediaItem[] {
    const media: MediaItem[] = [];
    
    // 1. Rasmlarni topish (___IMAGE_X___ yoki ![](media/imageX.ext))
    // Marker format
    const imageMarkerMatches = questionText.matchAll(/___IMAGE_(\d+)___/g);
    for (const match of imageMarkerMatches) {
      const imageNum = match[1];
      const imageUrl = this.findImageByNumber(imageNum);

      if (imageUrl) {
        media.push({
          type: 'image',
          url: imageUrl,
          position: 'inline',
        });
      }
    }
    
    // Pandoc format: ![](media/image2.emf) or ![](path/media/image2.png)
    // With --extract-media, Pandoc outputs: ![](tempDir/media/image1.png)
    const pandocImageMatches = questionText.matchAll(/!\[([^\]]*)\]\((?:[^)]*\/)?media\/([^)]+)\)/g);
    if (pandocImageMatches) {
      const matches = Array.from(pandocImageMatches);
      for (const match of matches) {
        const fullName = match[2]; // "image2.emf"
        
        // extractedImages Map'da to'liq nom bilan qidirish
        let imageUrl = this.extractedImages.get(fullName);
        
        // Agar topilmasa, extension'siz qidirish (image2)
        if (!imageUrl) {
          const baseName = fullName.split('.')[0]; // "image2"
          for (const [key, value] of this.extractedImages.entries()) {
            if (key.startsWith(baseName + '.')) {
              imageUrl = value;
              break;
            }
          }
        }
        
        if (imageUrl) {
          media.push({
            type: 'image',
            url: imageUrl,
            position: 'inline',
          });
        }
      }
    }
    
    // 2. Jadvallarni topish (___TABLE_X___)
    const tableMatches = questionText.matchAll(/___TABLE_(\d+)___/g);
    for (const match of tableMatches) {
      const tableNum = match[1];
      const tableId = `table${tableNum}`;
      const tableUrl = this.extractedTables.get(tableId);
      
      if (tableUrl) {
        media.push({
          type: 'table',
          url: tableUrl,
          position: 'after',
        });
      }
    }
    
    return media;
  }

  /**
   * Savolga media qo'shish
   * Jadvallarni imageUrl ga qo'yish (birinchi jadval)
   */
  protected attachMediaToQuestion(question: ParsedQuestion): ParsedQuestion {
    console.log(`🔍 [MEDIA] Question text: ${question.text.substring(0, 50)}...`);
    console.log(`🔍 [MEDIA] Full text length: ${question.text.length}`);
    console.log(`🔍 [MEDIA] Contains ![](media/: ${question.text.includes('![](media/')}`);

    // Variant matnlaridan rasm markerlarini tekshirish
    // ___IMAGE_X___ variant text ichiga kirib qoladi — har bir variant o'z rasmini oladi
    if (question.variants) {
      for (const v of question.variants) {
        const imgInVariant = v.text.match(/___IMAGE_(\d+)___/);
        if (imgInVariant) {
          const imgNum = imgInVariant[1];
          const imgUrl = this.findImageByNumber(imgNum);
          if (imgUrl) {
            v.imageUrl = imgUrl;
            const dims = this.imageDimensions.get(imgNum);
            if (dims) {
              v.imageWidth = dims.widthPx;
              v.imageHeight = dims.heightPx;
            }
            console.log(`  🔍 [MEDIA] Found image in variant ${v.letter}: ${imgUrl}`);
          }
          // Markerini variant matnidan olib tashlash
          v.text = v.text.replace(/___IMAGE_\d+___/g, '').trim();
          // Rasmli variant text bo'sh bo'lsa — placeholder (Mongoose required validation uchun)
          if (!v.text && v.imageUrl) {
            v.text = '[rasm]';
          }
        }
      }
    }

    const media = this.findMediaForQuestion(question.text);

    console.log(`🔍 [MEDIA] Found ${media.length} media items`);

    // Rasm raqamini markerdan olish (o'lcham uchun kerak)
    const imageNumMatch = question.text.match(/___IMAGE_(\d+)___/);

    if (media.length > 0) {
      // Birinchi jadvalni imageUrl ga qo'yish (legacy support)
      const firstTable = media.find(m => m.type === 'table');
      if (firstTable && !question.imageUrl) {
        question.imageUrl = firstTable.url;
        console.log(`  ✅ [MEDIA] Set imageUrl from table: ${firstTable.url}`);
      }

      // Agar imageUrl yo'q bo'lsa, eng mos rasmni tanlash
      // OMR answer sheet (juda baland portrait rasm) ni skip qilish
      if (!question.imageUrl) {
        const allImageMarkers = Array.from(question.text.matchAll(/___IMAGE_(\d+)___/g));
        let bestImageNum: string | null = null;
        let bestImageUrl: string | null = null;

        for (const marker of allImageMarkers) {
          const imgNum = marker[1];
          const dims = this.imageDimensions.get(imgNum);
          const url = this.findImageByNumber(imgNum);
          if (!url) continue;

          // Skip: juda baland portrait rasmlar (OMR answer sheet, dekorativ)
          // height > 1.4 * width VA height > 400px — bu odatda savol diagrammasi emas
          if (dims && dims.heightPx > 1.4 * dims.widthPx && dims.heightPx > 400) {
            console.log(`  ⏭️ [MEDIA] Skipping image ${imgNum} (${dims.widthPx}x${dims.heightPx}px — likely answer sheet)`);
            continue;
          }

          bestImageNum = imgNum;
          bestImageUrl = url;
          break; // Birinchi mos rasmni olish
        }

        // Agar mos rasm topilmasa, media array dan birinchisini olish (fallback)
        if (!bestImageUrl) {
          const firstImage = media.find(m => m.type === 'image');
          if (firstImage) {
            bestImageUrl = firstImage.url;
            // imageNumMatch dan raqamni olish
            bestImageNum = imageNumMatch ? imageNumMatch[1] : null;
          }
        }

        if (bestImageUrl) {
          question.imageUrl = bestImageUrl;
          console.log(`  ✅ [MEDIA] Set imageUrl from image: ${bestImageUrl}`);
        }

        // O'lchamlarni mos rasm uchun qo'yish
        if (bestImageNum) {
          const dims = this.imageDimensions.get(bestImageNum);
          if (dims) {
            question.imageWidth = dims.widthPx;
            question.imageHeight = dims.heightPx;
            console.log(`  📐 [MEDIA] Set image dimensions: ${dims.widthPx}x${dims.heightPx}px`);
          }
        }
      } else {
        // imageUrl allaqachon bor (variant dan topilgan), o'lcham qo'shish
        if (imageNumMatch) {
          const dims = this.imageDimensions.get(imageNumMatch[1]);
          if (dims) {
            question.imageWidth = dims.widthPx;
            question.imageHeight = dims.heightPx;
            console.log(`  📐 [MEDIA] Set image dimensions: ${dims.widthPx}x${dims.heightPx}px`);
          }
        }
      }

      // Media array'ga ham qo'shish (kelajak uchun)
      question.media = media;
    }
    
    // Media markerlarini matndan olib tashlash
    question.text = question.text
      .replace(/___IMAGE_\d+___/g, '')
      .replace(/___TABLE_\d+___/g, '')
      .replace(/!\[\]\(media\/[^)]+\)(\{[^}]*\})?/g, '') // Pandoc image + {width="..."} o'chirish
      .replace(/!\[.*?\]\(.*?media\/[^)]+\)(\{[^}]*\})?/g, '') // Boshqa Pandoc image formatlari
      .replace(/\{[^}]*(?:width|height)[^}]*\}/g, '') // Standalone Pandoc atributlari
      .replace(/\*\*\s*\*\*/g, '') // Bo'sh bold markerlar
      .replace(/\s+/g, ' ')
      .trim();
    
    return question;
  }
}
