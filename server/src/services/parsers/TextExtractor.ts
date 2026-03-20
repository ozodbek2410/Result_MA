import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { BaseParser, ParsedQuestion } from './BaseParser';

export interface ExtractedContent {
  /** Pandoc AST yoki OMML/mammoth dan olingan raw text (formulalar \(...\) ichida) */
  rawText: string;
  images: Map<string, string>;
  imageDimensions: Map<string, { widthPx: number; heightPx: number }>;
  tables: Map<string, string>;
  formulas: Map<string, string>;
}

class ExtractionHelper extends BaseParser {
  async parse(): Promise<ParsedQuestion[]> {
    return [];
  }

  async extractAll(filePath: string): Promise<ExtractedContent> {
    await this.extractImagesFromDocx(filePath);
    await this.extractTablesFromDocx(filePath);

    let rawText = '';
    try {
      rawText = await this.extractTextWithPandoc(filePath);
    } catch {
      // Pandoc yo'q — OMML parsing (Office Math) → Groq LaTeX
      console.warn('[TextExtractor] Pandoc failed, trying OMML extraction...');
      try {
        rawText = await this.extractWithOmml(filePath);
      } catch (ommlErr) {
        console.warn('[TextExtractor] OMML failed, mammoth fallback:', (ommlErr as Error).message);
        rawText = await this.extractWithMammoth(filePath);
      }
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
   * OMML (Office Math) formulalarni to'g'ridan-to'g'ri DOCX XML dan o'qib,
   * Groq AI orqali LaTeX ga o'giradi. Pandoc o'rnatilmaganda ishlatiladi.
   */
  private async extractWithOmml(filePath: string): Promise<string> {
    const { GroqService } = await import('../groqService');
    const AdmZip = (await import('adm-zip')).default;

    const zip = new AdmZip(filePath);
    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) throw new Error('word/document.xml not found');
    const xmlContent = zip.readAsText(docEntry);

    // Rels fayldan rId → media filename mapping
    const rIdToFile = new Map<string, string>();
    const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
    if (relsEntry) {
      const relsXml = zip.readAsText(relsEntry);
      const relRegex = /<Relationship[^>]+>/g;
      let rm;
      while ((rm = relRegex.exec(relsXml)) !== null) {
        const idM = rm[0].match(/Id="([^"]+)"/);
        const targetM = rm[0].match(/Target="media\/([^"]+)"/);
        if (idM && targetM) rIdToFile.set(idM[1], targetM[2]);
      }
    }

    // v:imagedata rId → VIMG marker (atributlarni strip qilishdan OLDIN)
    const vimgUrls = new Map<number, string>();
    let vimgCounter = 0;
    const xmlWithVimgMarkers = xmlContent.replace(
      /<v:imagedata[^>]*r:id="([^"]+)"[^>]*\/?>/g,
      (_, rId) => {
        const filename = rIdToFile.get(rId);
        if (!filename) return '';
        const url = this.extractedImages.get(filename);
        if (!url) {
          // WMF conversion failed — use placeholder so variant text isn't blank
          const idx = ++vimgCounter;
          vimgUrls.set(idx, '');
          return `<VIMG${idx}/>`;
        }
        const idx = ++vimgCounter;
        vimgUrls.set(idx, url);
        return `<VIMG${idx}/>`;
      }
    );

    // Formatting elementlarini olib tashlash (structural tegs qolsin)
    const stripped = xmlWithVimgMarkers
      .replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '')
      .replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g, '')
      .replace(/<m:ctrlPr>[\s\S]*?<\/m:ctrlPr>/g, '')
      .replace(/<m:fPr>[\s\S]*?<\/m:fPr>/g, '')
      .replace(/<m:sSupPr>[\s\S]*?<\/m:sSupPr>/g, '')
      .replace(/<m:sSubPr>[\s\S]*?<\/m:sSubPr>/g, '')
      .replace(/<m:radPr>[\s\S]*?<\/m:radPr>/g, '')
      .replace(/<m:dPr>[\s\S]*?<\/m:dPr>/g, '')
      .replace(/<m:limLowPr>[\s\S]*?<\/m:limLowPr>/g, '')
      .replace(/<m:naryPr>[\s\S]*?<\/m:naryPr>/g, '')
      .replace(/\s+[\w:]+="[^"]*"/g, ''); // barcha XML attributlarni o'chirish

    // Paragraflarni parse qilish
    const ommlMap = new Map<string, string>();
    let formulaCount = 0;
    const lines: string[] = [];

    const paraRegex = /<w:p>([\s\S]*?)<\/w:p>/g;
    let paraMatch;
    while ((paraMatch = paraRegex.exec(stripped)) !== null) {
      const paraContent = paraMatch[1];
      let line = '';

      // Har bir paragrafda text runlar, OMML formulalar va VIMG rasmlarni tartibda o'qish
      const tokenRegex = /<w:t>([\s\S]*?)<\/w:t>|<m:oMath>([\s\S]*?)<\/m:oMath>|<VIMG(\d+)\/>/g;
      let token;
      while ((token = tokenRegex.exec(paraContent)) !== null) {
        if (token[1] !== undefined) {
          line += token[1];
        } else if (token[2] !== undefined) {
          const marker = `[FORMULA_${++formulaCount}]`;
          ommlMap.set(marker, `<m:oMath>${token[2]}</m:oMath>`);
          line += marker;
        } else if (token[3] !== undefined) {
          // v:imagedata → PNG URL marker (or placeholder if conversion failed)
          const url = vimgUrls.get(Number(token[3]));
          line += url ? `___VIMG:${url}___` : '[rasm]';
        }
      }

      const trimmed = line.trim();
      if (trimmed) lines.push(trimmed);
    }

    if (lines.length === 0) throw new Error('No text extracted');

    // Formulasiz hujjat
    if (ommlMap.size === 0) return lines.join('\n');

    console.log(`[TextExtractor] OMML: ${ommlMap.size} formulas found, batch converting...`);

    // Groq batch: har 20 ta formula bir callda
    const BATCH_SIZE = 20;
    const SYSTEM = `Convert OMML XML math formulas to LaTeX. Return ONLY JSON: {"1":"latex1","2":"latex2",...}. Rules: raw LaTeX only, no delimiters \\( \\), use \\frac{}{}, ^{}, _{}, \\sqrt{}, \\cdot etc.`;
    const latexMap = new Map<string, string>();
    const entries = Array.from(ommlMap.entries());

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const idxMap = new Map<string, string>();
      let prompt = '';

      batch.forEach(([marker, omml], idx) => {
        idxMap.set(String(idx + 1), marker);
        prompt += `[${idx + 1}] ${omml}\n`;
      });

      try {
        const result = await GroqService.parseStructured(prompt, SYSTEM, {
          model: 'llama-3.3-70b-versatile',
          maxTokens: 2048,
          temperature: 0.0,
        });

        if (result && typeof result === 'object') {
          for (const [localIdx, latex] of Object.entries(result as Record<string, string>)) {
            const marker = idxMap.get(localIdx);
            if (marker && typeof latex === 'string' && latex.trim()) {
              latexMap.set(marker, latex.trim());
            }
          }
        }
      } catch { /* silent — marker qoladi, key o'chiriladi */ }
    }

    console.log(`[TextExtractor] OMML LaTeX: ${latexMap.size}/${ommlMap.size} converted`);

    let text = lines.join('\n');
    for (const [marker, latex] of latexMap) {
      text = text.replace(marker, `\\(${latex}\\)`);
    }
    // Konvertlanmagan markerlarni o'chirish
    text = text.replace(/\[FORMULA_\d+\]/g, '');

    // VIMG rasmlarni Groq Vision orqali LaTeX ga o'girish
    const vimgMatches = Array.from(text.matchAll(/___VIMG:([^_]+)___/g));
    if (vimgMatches.length > 0) {
      console.log(`[TextExtractor] VIMG→LaTeX: ${vimgMatches.length} variant images...`);
      const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads');

      for (let i = 0; i < vimgMatches.length; i += 5) {
        const batch = vimgMatches.slice(i, i + 5);
        const results = await Promise.allSettled(batch.map(async (match) => {
          const url = match[1]; // e.g. /uploads/test-images/uuid.png
          const filePath2 = path.join(uploadDir, url.replace('/uploads/', ''));
          try {
            const buf = await fs.readFile(filePath2);
            const base64 = buf.toString('base64');
            const latex = await GroqService.formulaToLatex(base64);
            if (latex) return { full: match[0], latex };
          } catch { /* file not found */ }
          return null;
        }));

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            text = text.replace(r.value.full, `\\(${r.value.latex}\\)`);
          }
        }
      }

      // Qolgan VIMG markerlarni [rasm] ga o'zgartirish
      text = text.replace(/___VIMG:[^_]+___/g, '[rasm]');
      console.log(`[TextExtractor] VIMG→LaTeX done`);
    }

    return text;
  }

  /**
   * Mammoth + Groq Vision fallback — WMF/EMF formula rasmlar uchun.
   */
  private async extractWithMammoth(filePath: string): Promise<string> {
    const execFileAsync = promisify(execFile);

    try {
      const mammoth = await import('mammoth');
      const { GroqService } = await import('../groqService');

      const wmfImages: Array<{ id: string; base64: string }> = [];
      let imgCounter = 0;

      const result = await (mammoth as any).convertToHtml({ path: filePath }, {
        convertImage: (mammoth as any).images.imgElement((img: any) => {
          return img.read('base64').then((data: string) => {
            const id = `__IMG_${++imgCounter}__`;
            if (img.contentType?.includes('wmf') || img.contentType?.includes('emf')) {
              wmfImages.push({ id, base64: data });
            }
            return { src: id };
          });
        }),
      });

      let html: string = result.value;

      if (wmfImages.length > 0) {
        console.log(`[TextExtractor] Vision: ${wmfImages.length} WMF images...`);
        let pyPath = '';
        for (const p of ['python', 'py', 'python3']) {
          try { await execFileAsync(p, ['--version'], { timeout: 3000 }); pyPath = p; break; } catch { /* */ }
        }

        const scriptPath = path.join(__dirname, '..', '..', '..', 'python', 'convert_emf_to_png.py');
        const tmpDir = os.tmpdir();
        const latexMap = new Map<string, string>();
        const tempFiles: string[] = [];

        const tasks = wmfImages.map(({ id, base64 }) => async () => {
          try {
            const tempWmf = path.join(tmpDir, `f_${uuidv4()}.wmf`);
            const tempPng = path.join(tmpDir, `f_${uuidv4()}.png`);
            tempFiles.push(tempWmf, tempPng);
            await fs.writeFile(tempWmf, Buffer.from(base64, 'base64'));
            if (pyPath) await execFileAsync(pyPath, [scriptPath, tempWmf, tempPng], { timeout: 10000 });
            if (fsSync.existsSync(tempPng)) {
              const pngBase64 = (await fs.readFile(tempPng)).toString('base64');
              const latex = await GroqService.formulaToLatex(pngBase64);
              if (latex) latexMap.set(id, latex);
            }
          } catch { /* */ }
        });

        for (let i = 0; i < tasks.length; i += 5) {
          await Promise.all(tasks.slice(i, i + 5).map(t => t()));
        }
        await Promise.allSettled(tempFiles.map(f => fs.unlink(f).catch(() => {})));
        console.log(`[TextExtractor] Vision: ${latexMap.size}/${wmfImages.length} OK`);

        for (const [id, latex] of latexMap) {
          html = html.replace(new RegExp(`<img[^>]*src="${id}"[^>]*\\/?>`, 'g'), `\\(${latex}\\)`);
        }
      }

      html = html.replace(/<img[^>]*\/?>/g, '');
      return html
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n').trim();
    } catch (error) {
      console.error('[TextExtractor] Mammoth+Vision failed:', (error as Error).message);
      try {
        const mammoth = await import('mammoth');
        const r = await mammoth.extractRawText({ path: filePath });
        return r.value || '';
      } catch { return ''; }
    }
  }
}

export async function extractFromDocx(filePath: string): Promise<ExtractedContent> {
  const helper = new ExtractionHelper();
  return helper.extractAll(filePath);
}
