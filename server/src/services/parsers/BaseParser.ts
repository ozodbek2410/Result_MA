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

// Pandoc JSON AST types for DOCX parsing
type PandocAttr = [string, string[], [string, string][]];

type PandocInline =
  | { t: 'Str'; c: string }
  | { t: 'Space' }
  | { t: 'SoftBreak' }
  | { t: 'LineBreak' }
  | { t: 'Strong'; c: PandocInline[] }
  | { t: 'Emph'; c: PandocInline[] }
  | { t: 'Underline'; c: PandocInline[] }
  | { t: 'Strikeout'; c: PandocInline[] }
  | { t: 'Subscript'; c: PandocInline[] }
  | { t: 'Superscript'; c: PandocInline[] }
  | { t: 'Math'; c: [{ t: string }, string] }
  | { t: 'Image'; c: [PandocAttr, PandocInline[], [string, string]] }
  | { t: 'Span'; c: [PandocAttr, PandocInline[]] }
  | { t: 'Quoted'; c: [{ t: string }, PandocInline[]] }
  | { t: 'Link'; c: [PandocAttr, PandocInline[], [string, string]] }
  | { t: 'Code'; c: [PandocAttr, string] }
  | { t: 'RawInline'; c: [string, string] }
  | { t: 'Note'; c: PandocBlock[] };

type PandocBlock =
  | { t: 'Para'; c: PandocInline[] }
  | { t: 'Plain'; c: PandocInline[] }
  | { t: 'Table'; c: unknown[] }
  | { t: 'BlockQuote'; c: PandocBlock[] }
  | { t: 'Header'; c: [number, PandocAttr, PandocInline[]] }
  | { t: 'BulletList'; c: PandocBlock[][] }
  | { t: 'OrderedList'; c: [unknown, PandocBlock[][]] }
  | { t: 'Div'; c: [PandocAttr, PandocBlock[]] }
  | { t: 'LineBlock'; c: PandocInline[][] }
  | { t: 'CodeBlock'; c: [PandocAttr, string] }
  | { t: 'RawBlock'; c: [string, string] }
  | { t: 'HorizontalRule' }
  | { t: 'Null' };

interface PandocDocument {
  'pandoc-api-version': number[];
  meta: Record<string, unknown>;
  blocks: PandocBlock[];
}

export interface MediaItem {
  type: 'image' | 'table';
  url: string;
  position: 'before' | 'after' | 'inline';
}

export interface ParsedQuestion {
  text: string;
  contextText?: string;
  contextImage?: string;
  contextImageWidth?: number;
  contextImageHeight?: number;
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
  protected extractedFormulas: Map<string, string> = new Map(); // imageNum -> LaTeX
  protected astTableIndex = 1;
  protected pendingAstTables: Map<string, string> = new Map(); // tableId -> HTML (from Pandoc AST)
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

  // ─── Pandoc JSON AST Serializer ───────────────────────────────────────

  /**
   * Serialize Pandoc AST blocks to clean text.
   * Images become separate lines, math becomes \(...\), bold becomes **...**
   */
  protected serializeAstBlocks(blocks: PandocBlock[]): string {
    return blocks
      .map(block => this.serializeBlock(block))
      .filter(s => s !== '')
      .join('\n');
  }

  protected serializeBlock(block: PandocBlock): string {
    switch (block.t) {
      case 'Para':
      case 'Plain':
        return this.serializeInlines(block.c);
      case 'Table': {
        const tableIdx = this.astTableIndex++;
        const tableId = `table${tableIdx}`;
        // If table contains question numbering — extract as plain text (not image)
        try {
          const tableText = this.extractTextFromTableAst(block.c);
          if (/(?:^|\n)?\*?\*?\d+\s*\*?\*?[.)\u2026]/m.test(tableText)) {
            console.log(`📋 [TABLE] Table ${tableIdx} contains question — extracting as text`);
            return '\n' + tableText + '\n';
          }
        } catch { /* ignore */ }
        try {
          const html = this.extractTableHtmlFromAst(block.c);
          if (html) this.pendingAstTables.set(tableId, html);
        } catch { /* ignore AST parse errors */ }
        return `___TABLE_${tableIdx}___`;
      }
      case 'BlockQuote':
        return block.c.map(b => this.serializeBlock(b)).join('\n');
      case 'Header':
        return this.serializeInlines(block.c[2]);
      case 'BulletList':
        return block.c.map(items => items.map(b => this.serializeBlock(b)).join('\n')).join('\n');
      case 'OrderedList':
        return block.c[1].map(items => items.map(b => this.serializeBlock(b)).join('\n')).join('\n');
      case 'Div':
        return block.c[1].map(b => this.serializeBlock(b)).join('\n');
      case 'LineBlock':
        return block.c.map(il => this.serializeInlines(il)).join('\n');
      default:
        return '';
    }
  }

  protected serializeInlines(inlines: PandocInline[]): string {
    return inlines.map(il => {
      switch (il.t) {
        case 'Str': return il.c;
        case 'Space': return ' ';
        case 'SoftBreak':
        case 'LineBreak': return '\n';
        case 'Strong': return '**' + this.serializeInlines(il.c) + '**';
        case 'Emph':
        case 'Underline':
        case 'Strikeout': return this.serializeInlines(il.c);
        case 'Math': {
          let latex = il.c[1];
          // Detect bold variant letter (correct answer marker) before stripping
          let boldMarker = '';
          const variantBold = latex.match(/\\(?:mathbf|boldsymbol|bf)\{[^}]*([A-D])\s*[.)]/);
          if (variantBold) boldMarker = `___MATHBOLD_${variantBold[1]}___`;
          // Strip \mathbf to keep LaTeX clean for rendering
          for (let i = 0; i < 3; i++) {
            latex = latex.replace(/\\(?:mathbf|boldsymbol|bf)\{([^{}]*)\}/g, '$1');
          }
          return `\\(${latex}\\)${boldMarker}`;
        }
        case 'Image': {
          const attrs = il.c[0];
          const url = il.c[2][0];
          const imgMatch = url.match(/image(\d+)/);
          if (imgMatch) {
            const imgNum = imgMatch[1];
            // Extract dimensions from AST attributes
            const kvPairs = attrs[2];
            if (kvPairs) {
              let width = '', height = '';
              for (const [key, val] of kvPairs) {
                if (key === 'width') width = val;
                if (key === 'height') height = val;
              }
              if (width && height) {
                const widthPx = this.parseDimensionToPixels(width);
                const heightPx = this.parseDimensionToPixels(height);
                if (widthPx > 0 && heightPx > 0) {
                  this.imageDimensions.set(imgNum, { widthPx, heightPx });
                }
              }
            }
            return `\n___IMAGE_${imgNum}___\n`;
          }
          return '';
        }
        case 'Superscript': {
          const content = this.serializeInlines(il.c);
          return content.length > 1 ? `^{${content}}` : `^${content}`;
        }
        case 'Subscript': {
          const content = this.serializeInlines(il.c);
          return content.length > 1 ? `_{${content}}` : `_${content}`;
        }
        case 'Span': {
          const classes: string[] = il.c[0][1];
          const spanInlines = il.c[1];
          // {.mark} = Word highlight → bold (correct answer)
          if (classes.includes('mark')) {
            return '**' + this.serializeInlines(spanInlines) + '**';
          }
          return this.serializeInlines(spanInlines);
        }
        case 'Quoted': {
          const quoteType = il.c[0].t;
          const inner = this.serializeInlines(il.c[1]);
          return quoteType === 'DoubleQuote' ? `"${inner}"` : `'${inner}'`;
        }
        case 'Link': return this.serializeInlines(il.c[1]);
        case 'Code': return il.c[1];
        case 'RawInline':
        case 'Note': return '';
        default: return '';
      }
    }).join('');
  }

  /**
   * Extract HTML table from Pandoc Table AST content.
   * Pandoc Table: [attr, Caption, [ColSpec], TableHead, [TableBody], TableFoot]
   */
  protected extractTableHtmlFromAst(tableContent: unknown[]): string {
    const serializeCells = (rows: unknown[]): string => {
      if (!Array.isArray(rows)) return '';
      return rows.map(row => {
        // Row: [attr, [Cell, ...]]
        const rowArr = row as unknown[];
        const cells = rowArr[1] as unknown[] || rowArr;
        const actualCells = Array.isArray(cells) ? cells : [];
        const tds = actualCells.map(cell => {
          // Cell: [attr, alignment, rowSpan, colSpan, [Block, ...]]
          const cellArr = cell as unknown[];
          if (!Array.isArray(cellArr) || cellArr.length < 5) return '<td></td>';
          const rowSpan = cellArr[2] as number || 1;
          const colSpan = cellArr[3] as number || 1;
          const blocks = cellArr[4] as PandocBlock[];
          if (!Array.isArray(blocks)) return '<td></td>';
          const text = blocks.map(b => this.serializeBlock(b)).filter(s => s).join(' ');
          let attrs = '';
          if (rowSpan > 1) attrs += ` rowspan="${rowSpan}"`;
          if (colSpan > 1) attrs += ` colspan="${colSpan}"`;
          return `<td${attrs}>${text}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
      }).join('\n');
    };

    try {
      // tableContent = [attr, Caption, [ColSpec], TableHead, [TableBody], TableFoot]
      const tableHead = tableContent[3] as unknown[];
      const tableBodies = tableContent[4] as unknown[];

      let html = '<table>\n';

      // TableHead: [attr, [Row, ...]]
      if (tableHead && Array.isArray(tableHead)) {
        const headRows = (tableHead[1] || tableHead) as unknown[];
        if (Array.isArray(headRows) && headRows.length > 0) {
          const headHtml = serializeCells(headRows);
          if (headHtml) html += `<thead>${headHtml}</thead>\n`;
        }
      }

      // TableBody: [[attr, rowHeadCount, [Row...headRows], [Row...bodyRows]], ...]
      if (tableBodies && Array.isArray(tableBodies)) {
        html += '<tbody>\n';
        for (const body of tableBodies) {
          const bodyArr = body as unknown[];
          // bodyRows are at index 3
          const bodyRows = (Array.isArray(bodyArr) && bodyArr.length >= 4 ? bodyArr[3] : bodyArr) as unknown[];
          if (Array.isArray(bodyRows)) {
            html += serializeCells(bodyRows);
          }
        }
        html += '</tbody>\n';
      }

      html += '</table>';
      return html;
    } catch {
      return '';
    }
  }

  /** Extract plain text from all cells of a Pandoc Table AST node */
  private extractTextFromTableAst(tableContent: unknown[]): string {
    const lines: string[] = [];
    const processCell = (cell: unknown) => {
      const cellArr = cell as unknown[];
      if (!Array.isArray(cellArr) || cellArr.length < 5) return;
      const blocks = cellArr[4] as PandocBlock[];
      if (!Array.isArray(blocks)) return;
      const text = blocks.map(b => this.serializeBlock(b)).filter(s => s.trim()).join(' ');
      if (text.trim()) lines.push(text.trim());
    };
    const processRows = (rows: unknown[]) => {
      for (const row of rows) {
        const rowArr = row as unknown[];
        const cells = (rowArr[1] || rowArr) as unknown[];
        if (Array.isArray(cells)) cells.forEach(processCell);
      }
    };
    const tableHead = tableContent[3] as unknown[];
    if (tableHead && Array.isArray(tableHead)) {
      const headRows = (tableHead[1] || tableHead) as unknown[];
      if (Array.isArray(headRows)) processRows(headRows);
    }
    const tableBodies = tableContent[4] as unknown[];
    if (tableBodies && Array.isArray(tableBodies)) {
      for (const body of tableBodies) {
        const bodyArr = body as unknown[];
        const bodyRows = (Array.isArray(bodyArr) && bodyArr.length >= 4 ? bodyArr[3] : bodyArr) as unknown[];
        if (Array.isArray(bodyRows)) processRows(bodyRows);
      }
    }
    return lines.join('\n');
  }

  // ─── End AST Serializer ───────────────────────────────────────────────

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
      this.extractedFormulas.clear();

      // Extract OLE equation formulas FIRST (before image processing)
      await this.extractOleEquationFormulas(filePath);
      
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

      // DOCX XML dan rasm o'lchamlarini OLDIN o'qish (VML/DrawingML aniqroq)
      this.extractImageDimensionsFromDocxXml(zip);

      for (const { entry, name } of imageFiles) {
        const imageBuffer = entry.getData();
        const ext = path.extname(name).toLowerCase();

        // Skip formula images — they are OLE equations converted to LaTeX
        const imgNumMatch = name.match(/image(\d+)/);
        if (imgNumMatch && this.extractedFormulas.has(imgNumMatch[1])) {
          console.log(`⏭️ [PARSER] Skipping formula image: ${name} (OLE equation → LaTeX)`);
          continue;
        }

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
    } catch (error) {
      console.error('❌ [PARSER] Error extracting images:', error);
    }
  }

  /**
   * Extract OLE Equation Editor formulas from DOCX using MTEF parser.
   * Returns Map<imageNum, latexString> for formula images.
   */
  private async extractOleEquationFormulas(filePath: string): Promise<void> {
    try {
      const scriptPath = path.join(__dirname, '..', '..', '..', 'python', 'mtef_to_latex.py');
      const pythonPaths = ['python', 'py', 'python3'];

      for (const pyPath of pythonPaths) {
        try {
          const { stdout } = await execFileAsync(pyPath, [scriptPath, '--json-map', filePath], { timeout: 30000 });
          const parsed = stdout.trim();
          if (!parsed || parsed === '{}') return;

          const map: Record<string, string> = JSON.parse(parsed);
          for (const [imgFile, latex] of Object.entries(map)) {
            const numMatch = imgFile.match(/image(\d+)/);
            if (numMatch) {
              this.extractedFormulas.set(numMatch[1], latex);
            }
          }

          if (this.extractedFormulas.size > 0) {
            console.log(`📐 [PARSER] Extracted ${this.extractedFormulas.size} OLE equation formulas`);
          }
          return;
        } catch {
          // Try next python path
        }
      }
    } catch (error) {
      console.error('⚠️ [PARSER] OLE equation extraction failed:', error);
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
    const pandocPaths = [
      'pandoc',
      'C:\\Program Files\\Pandoc\\pandoc.exe',
      '/usr/local/bin/pandoc',
      '/usr/bin/pandoc',
    ];

    const tempMediaDir = path.join(path.dirname(filePath), `media_${Date.now()}`);
    let lastError: unknown;

    for (const pandocPath of pandocPaths) {
      // 1) Try JSON AST first — structured, no regex artifacts
      try {
        const { stdout } = await execFileAsync(pandocPath, [
          filePath, '-f', 'docx', '-t', 'json',
        ], { maxBuffer: 50 * 1024 * 1024 });

        try {
          const doc: PandocDocument = JSON.parse(stdout);
          this.astTableIndex = 1;
          this.pendingAstTables.clear();
          const serialized = this.serializeAstBlocks(doc.blocks);

          // Render AST tables that XML extractor missed
          if (this.pendingAstTables.size > 0) {
            const missingTables: Array<{ id: string; html: string }> = [];
            for (const [tableId, html] of this.pendingAstTables) {
              if (!this.extractedTables.has(tableId)) {
                missingTables.push({ id: tableId, html });
              }
            }
            if (missingTables.length > 0) {
              for (const mt of missingTables) {
                console.log(`📋 [AST-TABLE] ${mt.id} HTML:\n${mt.html}`);
              }
              console.log(`🔄 [PARSER] Rendering ${missingTables.length} AST-detected tables missed by XML extractor...`);
              const rendered = await this.tableRenderer.renderMultipleTables(missingTables);
              for (const [tableId, imageUrl] of rendered) {
                this.extractedTables.set(tableId, imageUrl);
              }
              console.log(`✅ [PARSER] AST tables rendered: ${rendered.size}/${missingTables.length}`);
            }
          }

          console.log('✅ [PARSER] Pandoc JSON AST serialized successfully');
          return serialized;
        } catch (parseErr) {
          console.warn('⚠️ [PARSER] JSON parse/serialize failed, falling back to markdown');
        }

        // 2) Markdown fallback (pandoc works but JSON parse failed)
        const { stdout: mdOut } = await execFileAsync(pandocPath, [
          filePath, '-f', 'docx', '-t', 'markdown', '--wrap=none',
          '--extract-media=' + tempMediaDir,
        ], { maxBuffer: 50 * 1024 * 1024 });

        try {
          if (fsSync.existsSync(tempMediaDir)) {
            fsSync.rmSync(tempMediaDir, { recursive: true, force: true });
          }
        } catch {}

        let cleaned = this.cleanPandocMarkdown(mdOut);
        cleaned = this.replaceTablesWithMarkers(cleaned);
        console.log('⚠️ [PARSER] Used markdown fallback pipeline');
        return cleaned;
      } catch (err) {
        lastError = err;
        try {
          if (fsSync.existsSync(tempMediaDir)) {
            fsSync.rmSync(tempMediaDir, { recursive: true, force: true });
          }
        } catch {}
      }
    }
    throw lastError;
  }

  /**
   * Pandoc markdown'dagi jadvallarni ___TABLE_X___ marker bilan almashtirish
   */
  protected replaceTablesWithMarkers(markdown: string): string {
    const lines = markdown.split('\n');
    const result: string[] = [];
    let tableIndex = 1;
    let inSimpleTable = false;
    let inGridTable = false;

    let gridTableLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Simple table border: 10+ consecutive dashes (not "--- ---- ---" column separators)
      const isSimpleBorder = /^\s*-{10,}\s*$/.test(line);
      // Grid table border: +---+---+ format
      const isGridBorder = /^\+[-=+:]+\+$/.test(trimmed);
      // Grid table content row: starts with |
      const isGridContent = /^\|/.test(trimmed);

      if (isSimpleBorder) {
        if (inSimpleTable) {
          // Closing border → end simple table
          const marker = `___TABLE_${tableIndex}___`;
          tableIndex++;
          result.push('', marker, '');
          inSimpleTable = false;
        } else {
          // Opening border → start simple table
          inSimpleTable = true;
        }
      } else if (inSimpleTable) {
        // Inside simple table — skip content
      } else if (isGridBorder || (inGridTable && isGridContent)) {
        if (!inGridTable) inGridTable = true;
        // Collect grid table lines for later analysis
        gridTableLines.push(line);
      } else {
        if (inGridTable) {
          // Grid table ended — check if it contains question/variant content
          const tableContent = gridTableLines
            .filter(l => /^\|/.test(l.trim()))
            .map(l => l.trim().replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim())
            .filter(l => l);
          const hasQuestionContent = tableContent.some(l =>
            /[A-D]\s*\)/.test(l) || /^\*?\*?\d+[.)]/.test(l)
          );

          if (hasQuestionContent) {
            // Table contains question text — extract content as plain text
            console.log(`📋 [PARSER] Grid table contains question content, extracting text`);
            for (const tl of tableContent) {
              result.push(tl);
            }
          } else {
            // Real data table — replace with marker
            const marker = `___TABLE_${tableIndex}___`;
            tableIndex++;
            result.push('', marker, '');
          }
          inGridTable = false;
          gridTableLines = [];
        }
        result.push(line);
      }
    }

    // Handle unclosed tables at end of file
    if (inSimpleTable || inGridTable) {
      const marker = `___TABLE_${tableIndex}___`;
      tableIndex++;
      result.push('', marker, '');
    }

    console.log(`🔄 [PARSER] Replaced ${tableIndex - 1} tables with markers`);
    return result.join('\n');
  }

  /**
   * Clean Pandoc markdown output
   * Fixes common issues like escaped characters and missing spaces
   */
  protected cleanPandocMarkdown(markdown: string): string {
    let cleaned = markdown;

    // Strip HTML tags (<p>, <br>, <div>) from pandoc output
    cleaned = cleaned.replace(/<\/?(?:p|br|div)(?:\s[^>]*)?>/gi, '');

    // Pandoc {.mark} span — Word highlight → bold (correct answer detection uchun)
    cleaned = cleaned.replace(/\[([^\]]+)\]\{\.mark\}/g, '**$1**');

    // Strip pandoc underline: [text]{.underline} → text
    cleaned = cleaned.replace(/\[([^\]]+)\]\{\.underline\}/g, '$1');

    // Pandoc raw inline — `<!-- -->`{=html} va boshqa raw blocklar
    cleaned = cleaned.replace(/`[^`]*`\{=[a-z]+\}/g, '');

    // Pandoc escaped dollar — \$ → $ (math formulalar to'g'ri yopilishi uchun)
    // $\frac{3}{2}\$ → $\frac{3}{2}$ , $2^{x+1}\$ni → $2^{x+1}$ni
    // LEKIN $\$ ni buzmaslik uchun — faqat $ dan keyin bo'lmagan \$ ni almashtirish
    cleaned = cleaned.replace(/([^$])\\\$/g, '$1$');

    // Remove pandoc hard line break: "word\↵" → "word↵" (handles CRLF too)
    cleaned = cleaned.replace(/\\\r?\n/g, '\n');

    // Remove escape characters
    cleaned = cleaned.replace(/\\\'/g, "'");  // \' → '
    cleaned = cleaned.replace(/\\\./g, '.');  // \. → .
    cleaned = cleaned.replace(/\\\)/g, ')');  // \) → )
    cleaned = cleaned.replace(/\\\"/g, '"');  // \" → "

    // Fix: Remove trailing "\ " inside math formulas before closing $
    // $formula\ $ → $formula$ , $formula\ \ \ $ → $formula$
    cleaned = cleaned.replace(/(?:\\[ ])+\$/g, '$');

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

    // Pre-process: if first line has a document title + question number on the same line,
    // insert a newline to separate them so the question pattern can match "1)" at line start
    const firstNewline = text.indexOf('\n');
    const firstLine = firstNewline > -1 ? text.substring(0, firstNewline) : text;
    const inlineQMatch = firstLine.match(/^(.+?)\s+(\d+\s*[.)]\s)/);
    if (inlineQMatch && inlineQMatch[2]) {
      const possibleTitle = inlineQMatch[1].replace(/\*\*/g, '').replace(/(?<!_)__([^_]+)__(?!_)/g, '$1').trim();
      if (this.isLikelyTitle(possibleTitle)) {
        const splitPos = firstLine.indexOf(inlineQMatch[2], inlineQMatch[1].length);
        if (splitPos > 0) {
          text = text.substring(0, splitPos) + '\n' + text.substring(splitPos);
          console.log(`📝 [PARSER] Separated title from first question at position ${splitPos}`);
        }
      }
    }

    // Match question numbers more flexibly: 1) or 1. at start of line or after newline
    // Allow optional space between number and bold-period (e.g. "17 **.**") and zero-space after period (e.g. "27.$\")
    const questionPattern = /(?:^|\n)(?:\*\*|__)?(\d+)\s*(?:\*\*|__)?[.)\u2026]+\s*/g;
    const matches = Array.from(text.matchAll(questionPattern));
    
    console.log(`🔍 [PARSER] Found ${matches.length} question markers`);
    
    let validMatches = matches.filter((m) => {
      const num = parseInt(m[1]);
      return num >= 1 && num <= 100;
    });

    console.log(`✅ [PARSER] Valid question markers: ${validMatches.length}`);

    // Sequential filter: skip sub-items (e.g., "1) sazavor; 2) pinhona" inside questions)
    validMatches = this.filterSequentialMarkers(validMatches, text);

    // Capture text before first question marker as contextText for Q1
    const firstMarkerIdx = validMatches.length > 0 ? validMatches[0].index! : 0;
    let pendingContextText = '';
    let pendingContextImage = '';
    let pendingContextImageWidth = 0;
    let pendingContextImageHeight = 0;
    let pendingQuestionPrefix = '';
    if (firstMarkerIdx > 0) {
      let preText = text.substring(0, firstMarkerIdx).replace(/\*\*/g, '').replace(/(?<!_)__([^_]+)__(?!_)/g, '$1').trim();
      // Extract image from context text
      const ctxImgMatch = preText.match(/___IMAGE_(\d+)___/);
      if (ctxImgMatch) {
        const imgUrl = this.findImageByNumber(ctxImgMatch[1]);
        if (imgUrl) {
          pendingContextImage = imgUrl;
          const dims = this.imageDimensions.get(ctxImgMatch[1]);
          if (dims) {
            pendingContextImageWidth = dims.widthPx;
            pendingContextImageHeight = dims.heightPx;
          }
        }
        preText = preText.replace(/___IMAGE_\d+___/g, '').trim();
      }
      // Check for range pattern like "1-2." indicating passage context for multiple questions
      const rangeMatch = preText.match(/(\d+)\s*[-\u2013]\s*(\d+)\s*[.)]/);
      if (rangeMatch && rangeMatch.index != null) {
        // Everything from range marker onward is context (e.g., "1-2. Matn asosida... Xasis...")
        const afterRange = preText.substring(rangeMatch.index).trim();
        // Remove the range marker itself (e.g., "1-2.") to keep only the passage
        const ctxBody = afterRange.replace(/^\d+\s*[-\u2013]\s*\d+\s*[.)]\s*/, '').trim();
        if (ctxBody.length > 20) {
          pendingContextText = this.finalCleanText(this.restoreMath(ctxBody, mathBlocks), mathBlocks);
          console.log(`📖 [PARSER] Context text from range marker ${rangeMatch[0]} (${pendingContextText.length} chars)`);
        }
      } else {
        // Check for embedded question header (e.g., "Title\n1. Question text...")
        // Use lookbehind to avoid matching "2." inside range "1-2."
        const embeddedQ = preText.match(/(?<!\d[-\u2013])(\d+)\s*[.)]\s+/);
        if (embeddedQ && embeddedQ.index != null) {
          const beforeQ = preText.substring(0, embeddedQ.index).trim();
          const afterQ = preText.substring(embeddedQ.index).trim();
          if (this.isLikelyTitle(beforeQ) || beforeQ.length <= 30) {
            // afterQ = "1. Assimilatsiya..." — keep raw text to prepend to first question block
            pendingQuestionPrefix = afterQ;
            console.log(`📝 [PARSER] Extracted question header from title: "${pendingQuestionPrefix.substring(0, 80)}"`);
          } else if (preText.length > 30) {
            pendingContextText = this.finalCleanText(this.restoreMath(preText, mathBlocks), mathBlocks);
            console.log(`📖 [PARSER] Pre-question context text found (${pendingContextText.length} chars)`);
          }
        } else if (preText.length > 30 && !this.isLikelyTitle(preText)) {
          pendingContextText = this.finalCleanText(this.restoreMath(preText, mathBlocks), mathBlocks);
          console.log(`📖 [PARSER] Pre-question context text found (${pendingContextText.length} chars)`);
        } else if (preText.length > 0) {
          console.log(`⏭️ [PARSER] Skipped pre-question text as title/header: "${preText.substring(0, 80)}"`);
        }
      }
    }

    for (let i = 0; i < validMatches.length; i++) {
      const match = validMatches[i];
      const startIdx = match.index!;
      const endIdx = i < validMatches.length - 1 ? validMatches[i + 1].index! : text.length;

      // If first question has a pending header from preText, prepend it to the block
      let block = text.substring(startIdx, endIdx);
      if (i === 0 && pendingQuestionPrefix) {
        block = pendingQuestionPrefix + '\n' + block;
        pendingQuestionPrefix = '';
        console.log(`📝 [PARSER] Prepended question header to first question block`);
      }

      const question = this.extractQuestion(block, mathBlocks);

      if (question) {
        question.originalNumber = parseInt(match[1]);
        // Attach pending contextText from previous block or pre-question text
        if (pendingContextText || pendingContextImage) {
          if (pendingContextText) question.contextText = pendingContextText;
          if (pendingContextImage) {
            question.contextImage = pendingContextImage;
            if (pendingContextImageWidth) question.contextImageWidth = pendingContextImageWidth;
            if (pendingContextImageHeight) question.contextImageHeight = pendingContextImageHeight;
          }
          pendingContextText = '';
          pendingContextImage = '';
          pendingContextImageWidth = 0;
          pendingContextImageHeight = 0;
        }
        // Check for post-variant text in this block (contextText for NEXT question)
        const postText = this.extractPostVariantText(block, mathBlocks);
        if (postText && postText.length > 30) {
          pendingContextText = postText;
          console.log(`📖 [PARSER] Post-variant context text found after Q${i + 1} (${postText.length} chars)`);
        }
        console.log(`✅ [PARSER] Question ${i + 1}: ${question.text.substring(0, 50)}...`);
        questions.push(question);
      } else {
        // CRITICAL: If question failed to parse, add empty placeholder
        console.log(`⚠️ [PARSER] Failed to parse question ${i + 1}, adding empty placeholder`);
        const questionNumber = parseInt(match[1]);
        questions.push({
          text: `Savol ${questionNumber} (parse qilinmadi)`,
          contextText: pendingContextText || undefined,
          variants: [
            { letter: 'A', text: '' },
            { letter: 'B', text: '' },
            { letter: 'C', text: '' },
            { letter: 'D', text: '' },
          ],
          correctAnswer: 'A',
          points: 1,
        });
        pendingContextText = '';
      }
    }

    return questions;
  }

  /**
   * Extract text after the last ABCD variant in a block.
   * This text is a reading passage for the NEXT question.
   */
  private extractPostVariantText(block: string, mathBlocks: string[]): string {
    // Find the last D) variant position
    const lastVariantPattern = /[A-D]\s*\)[^)]*$/;
    const lines = block.split('\n');

    // Find last line containing a variant letter
    let lastVariantLineIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/[A-D]\s*\)/.test(lines[i])) {
        lastVariantLineIdx = i;
        break;
      }
    }

    if (lastVariantLineIdx === -1 || lastVariantLineIdx >= lines.length - 1) return '';

    // Text after the last variant line
    const postText = lines.slice(lastVariantLineIdx + 1).join('\n').replace(/\*\*/g, '').replace(/(?<!_)__([^_]+)__(?!_)/g, '$1').trim();
    if (!postText) return '';

    // Clean and restore math
    return this.finalCleanText(this.restoreMath(postText, mathBlocks), mathBlocks);
  }

  /**
   * Detect if text is a document title/header rather than a reading passage.
   * Titles typically: short, contain test/subject identifiers, no question content.
   */
  private isLikelyTitle(text: string): boolean {
    const clean = text.replace(/\n/g, ' ').trim();
    // Too long for a title — likely real context
    if (clean.length > 200) return false;
    const lower = clean.toLowerCase();
    const titlePatterns = [
      /\btest[i]?\b/i,
      /\bblok\b/i,
      /\bimtihon\b/i,
      /\bnazorat\b/i,
      /\bjoriy\b/i,
      /\byakuniy\b/i,
      /\bfan\b.*\b(nomi|bo['\u2018\u2019\u02BB]yicha)\b/i,
      /\bsinf\b/i,
      /^\d+\s*-\s*\d+\b/, // e.g. "5-02", "7 -8"
      /\bustozlar\b/i,
      /\bo['\u2018\u2019\u02BB]qituvchi/i,
    ];
    const subjectPatterns = [
      /biologiya/i, /matematika/i, /fizika/i, /kimyo/i,
      /adabiyot/i, /ona\s*tili/i, /ingliz/i, /tarix/i,
      /geografiya/i, /informatika/i, /tibbiyot/i,
      /inyaz/i,
    ];
    const hasTitle = titlePatterns.some(p => p.test(clean));
    const hasSubject = subjectPatterns.some(p => p.test(clean));
    // Count newlines — titles are usually 1-2 lines
    const lineCount = text.split('\n').filter(l => l.trim()).length;
    if (lineCount <= 3 && (hasTitle || hasSubject)) return true;
    if (hasTitle && hasSubject) return true;
    return false;
  }

  /**
   * Filter question markers to keep only ascending sequence.
   * Skips sub-items (1, 2, 3 inside question body) that break numbering.
   */
  private filterSequentialMarkers(matches: RegExpExecArray[], text: string): RegExpExecArray[] {
    if (matches.length <= 1) return matches;

    const nums = matches.map(m => parseInt(m[1]));
    const maxNum = Math.max(...nums);

    // Helper: get block end position for a marker given ALL markers
    const getBlockEnd = (marker: RegExpExecArray): number => {
      for (const m of matches) {
        if (m.index! > marker.index!) return m.index!;
      }
      return text.length;
    };

    // Helper: check if block has >= 4 ABCD variants
    const hasVariants = (marker: RegExpExecArray): boolean => {
      const blockText = text.substring(marker.index!, getBlockEnd(marker));
      return (blockText.match(/[A-D]\s*\)/g) || []).length >= 4;
    };

    // Strategy 1: For each n=1..maxNum, pick first occurrence after previous selection.
    const s1: RegExpExecArray[] = [];
    let si = 0;
    for (let n = 1; n <= maxNum; n++) {
      for (let i = si; i < matches.length; i++) {
        if (parseInt(matches[i][1]) === n) {
          s1.push(matches[i]);
          si = i + 1;
          break;
        }
      }
    }

    // Strategy 2: Longest ascending subsequence from best start.
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
    const s2: RegExpExecArray[] = [];
    let lastNum = 0;
    for (let i = bestStart; i < matches.length; i++) {
      const n = parseInt(matches[i][1]);
      if (n > lastNum) { s2.push(matches[i]); lastNum = n; }
    }

    // Strategy 3: For duplicate numbers, prefer marker whose block has ABCD variants.
    const s3: RegExpExecArray[] = [];
    let searchFrom = 0;
    for (let n = 1; n <= maxNum; n++) {
      const candidates = matches.filter(m => parseInt(m[1]) === n && m.index! >= searchFrom);
      if (candidates.length === 0) continue;

      if (candidates.length === 1) {
        s3.push(candidates[0]);
        searchFrom = candidates[0].index! + 1;
      } else {
        // Prefer candidate with ABCD variants in its block
        let picked = candidates[0];
        for (const c of candidates) {
          if (hasVariants(c)) {
            picked = c;
            break;
          }
        }
        s3.push(picked);
        searchFrom = picked.index! + 1;
      }
    }

    // Pick strategy with most markers; prefer s3 (variant-aware) when tied
    const strategies = [s1, s2, s3];
    const result = strategies.reduce((best, cur) => cur.length >= best.length ? cur : best);

    if (result.length < matches.length) {
      console.log(`📊 [PARSER] Sequential filter: ${matches.length} → ${result.length} (skipped ${matches.length - result.length} sub-items)`);
    }

    return result;
  }

  /**
   * Extract variants in "A.text B.text C.text D.text" format (dot separator)
   */
  private extractDotSepVariants(block: string, mathBlocks: string[]): ParsedQuestion | null {
    let cleanBlock = block.replace(/^(?:\*\*\s*)?\d+(?:\*\*\s*)?[.)]\s*/, '').trim();

    const firstVariantIdx = cleanBlock.search(/[A-D]\.\S/);
    if (firstVariantIdx === -1) return null;

    const questionText = cleanBlock.substring(0, firstVariantIdx).trim();
    const variantsText = cleanBlock.substring(firstVariantIdx);

    const boldMatch = variantsText.match(/\*\*\s*([A-D])\s*\./);
    const correctAnswer = boldMatch ? boldMatch[1] : 'A';

    const cleanVariants = variantsText.replace(/\*\*/g, ' ').replace(/\s+/g, ' ');
    const parts = cleanVariants.split(/(?=[A-D]\.)/);
    const variants: { letter: string; text: string }[] = [];

    for (const part of parts) {
      const match = part.match(/^([A-D])\.\s*(.*)$/);
      if (match) {
        let text = match[2].trim();
        text = this.restoreMath(text, mathBlocks);
        text = this.finalCleanText(text, mathBlocks);
        if (text) variants.push({ letter: match[1], text });
      }
    }

    if (!questionText || variants.length < 2) return null;

    return {
      text: this.finalCleanText(this.restoreMath(questionText, mathBlocks), mathBlocks),
      variants,
      correctAnswer,
      points: 1,
    };
  }

  /**
   * Extract variants in "A text B text C text D text" format (no separator)
   */
  private extractSpaceSepVariants(block: string, mathBlocks: string[]): ParsedQuestion | null {
    let cleanBlock = block.replace(/^(?:\*\*\s*)?\d+(?:\*\*\s*)?[.)]\s*/, '').trim();

    const firstVarMatch = cleanBlock.match(/(?<!\w)A\s+[a-z]/);
    if (!firstVarMatch || firstVarMatch.index === undefined) return null;

    const questionText = cleanBlock.substring(0, firstVarMatch.index).trim();
    const variantsText = cleanBlock.substring(firstVarMatch.index);

    const parts = variantsText.split(/\s+(?=[A-D]\s+[a-z])/);
    const variants: { letter: string; text: string }[] = [];

    for (const part of parts) {
      const match = part.match(/^([A-D])\s+(.+)$/s);
      if (match) {
        let text = match[2].trim();
        text = this.restoreMath(text, mathBlocks);
        text = this.finalCleanText(text, mathBlocks);
        if (text) variants.push({ letter: match[1], text });
      }
    }

    if (!questionText || variants.length < 2) return null;

    return {
      text: this.finalCleanText(this.restoreMath(questionText, mathBlocks), mathBlocks),
      variants,
      correctAnswer: 'A',
      points: 1,
    };
  }

  /**
   * Extract question with inline variants (all on same line)
   * Example: "5) question text A) 1 B) 2 **C) 3** D) 4"
   */
  private extractInlineVariants(line: string, mathBlocks: string[]): ParsedQuestion | null {
    // CRITICAL FIX: Remove question number from the beginning (more aggressive)
    // Matches: "1)" or "**1**)" or "1." at the start
    let cleanLine = line.replace(/^(?:\*\*\s*)?\d+(?:\*\*\s*)?[.)]\s*/, '').trim();

    // Protect (A), ( A ) etc. inside question text — these are reference markers, not variants
    cleanLine = cleanLine.replace(/\(\s*([A-D])\s*\)/g, '[$1]');

    // Find where variants start (first A), B), C), or D))
    const firstVariantMatch = cleanLine.match(/[A-D]\s*\)/);
    if (!firstVariantMatch) return null;

    // Include "** " or "**" prefix before first variant letter
    // preCleanText adds space: "**A)" → "** A)", so need 3-char lookback
    let variantStartIdx = firstVariantMatch.index!;
    if (variantStartIdx >= 3 && cleanLine.substring(variantStartIdx - 3, variantStartIdx) === '** ') {
      variantStartIdx -= 3;
    } else if (variantStartIdx >= 2 && cleanLine.substring(variantStartIdx - 2, variantStartIdx) === '**') {
      variantStartIdx -= 2;
    }
    const questionText = cleanLine.substring(0, variantStartIdx).trim();
    const variantsText = cleanLine.substring(variantStartIdx);

    // Detect correct answer: match OPENING bold "** A)" — not closing bold like "text** D)"
    const boldVariantPattern = /(?<![a-zA-Z\u0400-\u04FF])\*\*\s*([A-D])\s*\)/g;
    const boldMatches = Array.from(variantsText.matchAll(boldVariantPattern));
    let correctAnswer = '';
    if (boldMatches.length > 0) {
      correctAnswer = boldMatches[0][1];
      console.log(`  🎯 Correct answer detected: ${correctAnswer}`);
    }

    // Remove bold markers
    let cleanVariants = variantsText.replace(/\*\*/g, ' ').replace(/(?<!_)__([^_]+)__(?!_)/g, '$1').replace(/\s+/g, ' ');

    // Split by variant letters (uppercase only)
    const parts = cleanVariants.split(/(?=[A-D]\s*\))/);
    const variants: { letter: string; text: string }[] = [];

    const seenLetters = new Set<string>();
    for (const part of parts) {
      // Use [\s\S]* instead of .* to match across newlines (OLE formula images on next line)
      const match = part.match(/^([A-D])\s*\)\s*([\s\S]*)$/);
      if (match) {
        const letter = match[1].toUpperCase();
        // Stop at duplicate only after collecting a full set (4 variants)
        // This allows typos like "D) x D) y" but stops merged blocks' next question
        if (seenLetters.has(letter) && variants.length >= 4) break;
        seenLetters.add(letter);
        let text = match[2].replace(/\s+/g, ' ').trim();

        text = this.restoreMath(text, mathBlocks);
        text = this.finalCleanText(text, mathBlocks);

        console.log(`  ✅ Variant ${letter}: ${text || '(empty)'}`);
        variants.push({ letter, text: text || '' });
      }
    }
    
    // Minimum 2 variants (true/false), not 4
    if (!questionText || variants.length < 2) return null;
    
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
    let extractedImageWidth: number | undefined;
    let extractedImageHeight: number | undefined;
    const allLines = block.split('\n').map(l => l.trim()).filter(l => l);
    const nonImageLines: string[] = [];
    for (const line of allLines) {
      if (/^___IMAGE_\d+___$/.test(line)) {
        const imgMatch = line.match(/___IMAGE_(\d+)___/);
        if (imgMatch) {
          // OLE formula images → keep in text (will be replaced with LaTeX later)
          if (this.extractedFormulas.has(imgMatch[1])) {
            nonImageLines.push(line);
          } else if (!extractedImageUrl) {
            // Standalone image marker — extract as context image
            extractedImageUrl = this.findImageByNumber(imgMatch[1]);
            const dims = this.imageDimensions.get(imgMatch[1]);
            if (dims) {
              extractedImageWidth = dims.widthPx;
              extractedImageHeight = dims.heightPx;
            }
          } else {
            // Keep additional image markers in text for variant attachment
            nonImageLines.push(line);
          }
        }
      } else {
        nonImageLines.push(line);
      }
    }

    // CRITICAL FIX: Join all lines first to handle multi-line inline variants
    // Example: "5) question text A) 1 B) 2\n**C) 3** D) 4"
    const fullBlock = nonImageLines.join(' ');

    // Check if this block has inline variants — clean bold markers first so C**) becomes C )
    const blockClean = fullBlock.replace(/\*\*/g, ' ').replace(/\s+/g, ' ');
    // Protect (A), ( A ), (B) etc. in question text before counting variant markers
    const blockForCount = blockClean.replace(/\(\s*[A-D]\s*\)/g, '___PAREN_LETTER___');
    const variantCountUpper = (blockForCount.match(/[A-D]\s*\)/g) || []).length;

    // If 3+ variants found, process as inline
    if (variantCountUpper >= 3) {
      console.log(`🔍 [PARSER] Detected ${variantCountUpper} inline variants in block, processing as single line`);
      const result = this.extractInlineVariants(fullBlock, mathBlocks);
      if (result && extractedImageUrl && !result.imageUrl) {
        result.imageUrl = extractedImageUrl;
        if (extractedImageWidth && !result.imageWidth) result.imageWidth = extractedImageWidth;
        if (extractedImageHeight && !result.imageHeight) result.imageHeight = extractedImageHeight;
      }
      return result;
    }

    // Check for A. format: "A.text B.text C.text D.text"
    const dotSepCount = (fullBlock.match(/[A-D]\.\S/g) || []).length;
    if (dotSepCount >= 2) {
      const dotResult = this.extractDotSepVariants(fullBlock, mathBlocks);
      if (dotResult) {
        if (extractedImageUrl && !dotResult.imageUrl) {
          dotResult.imageUrl = extractedImageUrl;
          if (extractedImageWidth && !dotResult.imageWidth) dotResult.imageWidth = extractedImageWidth;
          if (extractedImageHeight && !dotResult.imageHeight) dotResult.imageHeight = extractedImageHeight;
        }
        return dotResult;
      }
    }

    // Check for "A text B text" no-separator format (Uzbek style without ) or .)
    const spaceSepCount = (fullBlock.match(/(?<!\w)[A-D]\s+[a-z]/g) || []).length;
    if (spaceSepCount >= 2) {
      const spaceResult = this.extractSpaceSepVariants(fullBlock, mathBlocks);
      if (spaceResult) {
        if (extractedImageUrl && !spaceResult.imageUrl) {
          spaceResult.imageUrl = extractedImageUrl;
          if (extractedImageWidth && !spaceResult.imageWidth) spaceResult.imageWidth = extractedImageWidth;
          if (extractedImageHeight && !spaceResult.imageHeight) spaceResult.imageHeight = extractedImageHeight;
        }
        return spaceResult;
      }
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
    let imageWidth: number | undefined;
    let imageHeight: number | undefined;

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
      const hasVariantPrefix = /(?:\*\*\s*)?[A-D]\s*\)/.test(line);
      if (imageMatch && !hasVariantPrefix) {
        const imageNum = imageMatch[1];
        imageUrl = this.findImageByNumber(imageNum);
        const dims = this.imageDimensions.get(imageNum);
        if (dims) { imageWidth = dims.widthPx; imageHeight = dims.heightPx; }
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
        let cleanLine = line.replace(/\*\*/g, ' ').replace(/(?<!_)__([^_]+)__(?!_)/g, '$1').replace(/\s+/g, ' ');

        // Split by variant letters (uppercase only)
        const parts = cleanLine.split(/(?=(?<!\()[A-D]\s*\))/);

        for (const part of parts) {
          const match = part.match(/^([A-D])\s*\)\s*([\s\S]*)$/);
          if (match) {
            const letter = match[1];
            let text = match[2].replace(/\s+/g, ' ').trim();

            const varImgMatch = text.match(/^___IMAGE_(\d+)___/);
            if (varImgMatch) {
              const imgUrl = this.findImageByNumber(varImgMatch[1]);
              const dims = this.imageDimensions.get(varImgMatch[1]);
              variants.push({ letter, text: '', ...(imgUrl ? { imageUrl: imgUrl } : {}), ...(dims ? { imageWidth: dims.widthPx, imageHeight: dims.heightPx } : {}) });
              continue;
            }

            text = this.restoreMath(text, mathBlocks);
            text = this.finalCleanText(text, mathBlocks);

            console.log(`  ✅ Variant ${letter}: ${text || '(empty)'}`);
            variants.push({ letter, text: text || '' });
          }
        }
        continue;
      }
      
      // PRIORITY 2: Check if line has variants (standard format: A) text on separate line)
      const variantMatch = line.match(/^(\*\*|__)?\s*([A-D])(\*\*|__)?\)\s*(.+)/i);
      if (variantMatch) {
        inQuestion = false;
        const letter = variantMatch[2].toUpperCase();
        let text = variantMatch[4].trim();

        const varImgMatch = text.match(/^___IMAGE_(\d+)___/);
        if (varImgMatch) {
          const imgUrl = this.findImageByNumber(varImgMatch[1]);
          const dims = this.imageDimensions.get(varImgMatch[1]);
          variants.push({ letter, text: '', ...(imgUrl ? { imageUrl: imgUrl } : {}), ...(dims ? { imageWidth: dims.widthPx, imageHeight: dims.heightPx } : {}) });
          continue;
        }

        const textIsBold = text.startsWith('**') || text.startsWith('__');
        const isBold = !!(variantMatch[1] || variantMatch[3] || textIsBold);
        if (isBold) {
          correctAnswer = letter;
          text = text.replace(/^\*\*|\*\*$/g, '').replace(/^__|__$/g, '');
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
    
    const finalImageUrl = imageUrl || extractedImageUrl;
    const finalImageWidth = imageWidth ?? extractedImageWidth;
    const finalImageHeight = imageHeight ?? extractedImageHeight;
    return {
      text: questionText,
      variants,
      correctAnswer,
      points,
      imageUrl: finalImageUrl,
      ...(finalImageWidth ? { imageWidth: finalImageWidth } : {}),
      ...(finalImageHeight ? { imageHeight: finalImageHeight } : {}),
    };
  }

  /**
   * Clean common LaTeX conversion errors from Pandoc/MTEF
   */
  protected cleanLatex(latex: string): string {
    let cleaned = latex;
    // \bullet → \cdot (common Pandoc MTEF error)
    cleaned = cleaned.replace(/\\bullet/g, '\\cdot');
    // Double braces: ^{{2}} → ^{2}, _{{{n}}} → _{n}
    cleaned = cleaned.replace(/\{\{(\d+)\}\}/g, '{$1}');
    cleaned = cleaned.replace(/\{\{([^{}]+)\}\}/g, '{$1}');
    // Fix \frac with missing denominator: \frac{A}{B}{C} → detect and warn
    // Common pattern: \frac{(x-3)^{2}}{x}{2} should be \frac{(x-3)^{2}}{x^{2}}
    // \frac followed by more than 2 brace groups — try to merge
    cleaned = cleaned.replace(/\\frac(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})\{(\w)\}\{(\d+)\}/g, (_, num, varName, exp) => {
      return `\\frac${num}{${varName}^{${exp}}}`;
    });
    return cleaned;
  }

  /**
   * Restore math blocks in text
   */
  protected restoreMath(text: string, mathBlocks: string[]): string {
    return text.replace(/___MATH_(\d+)___/g, (_, idx) => {
      const raw = mathBlocks[parseInt(idx)] || '';
      return this.cleanLatex(raw);
    });
  }

  /**
   * Final text cleaning
   */
  protected finalCleanText(text: string, mathBlocks: string[]): string {
    let cleaned = text;

    // Merge split chemical formula LaTeX: N \(_2O\) → \(N_2O\), Cl \(_2O\) _7 → \(Cl_2O_7\)
    // Pass 1: merge leading element letters into math block: N \(_2 → \(N_2
    cleaned = cleaned.replace(/([A-Za-z]{1,3})\s*\\\((_)/g, '\\($1$2');
    // Pass 2: merge trailing subscripts/digits after \) back in: \) _7 → _7\)
    cleaned = cleaned.replace(/\\\)\s*((?:_\s*\d+)+)\)?/g, (_, trail) => {
      const clean = trail.replace(/\s+/g, '');
      return clean + '\\)';
    });

    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/(?<!\*)\*(?!\*)/g, ''); // standalone * (correct answer markers)
    // Remove markdown bold underscores (__text__) but preserve ___MATH_N___ placeholders and fill-in-the-blank _____
    // (?<!_) and (?!_) prevent matching when __ is part of ___ (3+ underscores)
    cleaned = cleaned.replace(/(?<!_)__([^_]+)__(?!_)/g, '$1');
    // Escape bare < > outside LaTeX so TipTap doesn't treat them as HTML tags
    // Protect LaTeX blocks first, escape, then restore
    const latexParts: string[] = [];
    cleaned = cleaned.replace(/\\?\([\s\S]*?\\?\)/g, (m) => { latexParts.push(m); return `\x00L${latexParts.length - 1}\x00`; });
    cleaned = cleaned.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    cleaned = cleaned.replace(/\x00L(\d+)\x00/g, (_, i) => latexParts[parseInt(i)]);
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

    // OLE equation formulas: replace ___IMAGE_N___ markers with LaTeX text
    if (this.extractedFormulas.size > 0) {
      this.extractedFormulas.forEach((latex, imgNum) => {
        const marker = `___IMAGE_${imgNum}___`;
        const replacement = `\\(${latex}\\)`;
        question.text = question.text.split(marker).join(replacement);
        if (question.variants) {
          for (const v of question.variants) {
            v.text = v.text.split(marker).join(replacement);
          }
        }
      });
    }

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
      // Barcha variantlardan TABLE markerlarini va answer sheet matnini tozalash
      for (const v of question.variants) {
        // TABLE marker va undan keyingi barcha matn (answer sheet, OMR jadval) ni o'chirish
        v.text = v.text.replace(/\s*(?:Javoblar:?\s*)?___TABLE_\d+___[\s\S]*/g, '').trim();
        // Qolgan {.mark} fragmentlarini tozalash (agar cleanPandocMarkdown o'tkazib yuborsa)
        v.text = v.text.replace(/\]\{\.mark\}/g, '').replace(/\[\s*$/g, '').trim();
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
