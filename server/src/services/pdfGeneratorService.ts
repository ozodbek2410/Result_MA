import { chromium, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

// Resolve local KaTeX paths for offline PDF rendering (no CDN dependency)
const katexDistDir = path.join(path.dirname(require.resolve('katex/package.json')), 'dist');
const KATEX_CSS_PATH = path.join(katexDistDir, 'katex.min.css').replace(/\\/g, '/');
const KATEX_JS_CONTENT = fs.readFileSync(path.join(katexDistDir, 'katex.min.js'), 'utf-8');

interface Question {
  number: number;
  subjectName?: string;
  text: string;
  contextText?: string;
  contextImage?: string;
  contextImageWidth?: number;
  contextImageHeight?: number;
  options: string[];
  correctAnswer?: string;
  imageUrl?: string;
  media?: { type: string; url: string; position: string }[];
  imageWidth?: number;
  imageHeight?: number;
}

interface StudentTest {
  studentName: string;
  variantCode: string;
  studentCode?: number;
  questions: Question[];
}

interface PDFSettings {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  columnsCount?: number;
  backgroundOpacity?: number;
  backgroundImage?: string;
}

interface TestData {
  title: string;
  className?: string;
  subjectName?: string;
  studentName?: string;
  variantCode?: string;
  questions: Question[];
  students?: StudentTest[];
  settings?: PDFSettings;
}

export class PDFGeneratorService {
  private static browserInstance: Browser | null = null;

  // Cache for compressed images to avoid re-processing
  private static imageCache = new Map<string, string>();
  private static readonly MAX_IMAGE_WIDTH = 800;
  private static readonly IMAGE_QUALITY = 75;

  /**
   * Convert question image URL to base64 data URI for embedding in PDF.
   * Compresses images via Sharp to reduce PDF size.
   */
  private static resolveImageForPdf(url: string): string {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    // Check cache
    const cached = this.imageCache.get(url);
    if (cached) return cached;

    const candidates: string[] = [];
    if (url.startsWith('/uploads/')) {
      candidates.push(
        path.join(process.cwd(), url),
        path.join(process.cwd(), 'server', url),
        path.join(__dirname, '../..', url),
      );
    } else if (url.startsWith('/')) {
      candidates.push(
        path.join(process.cwd(), '..', 'client', 'public', url),
        path.join(process.cwd(), 'client', 'public', url),
      );
    }

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        // SVGs don't need compression
        if (ext === 'svg') {
          const b64 = fs.readFileSync(filePath).toString('base64');
          const result = `data:image/svg+xml;base64,${b64}`;
          this.imageCache.set(url, result);
          return result;
        }
        // For raster images, compress synchronously via sharp's buffer
        try {
          const buf = fs.readFileSync(filePath);
          const compressed = this.compressImageSync(buf, ext);
          const result = `data:image/jpeg;base64,${compressed.toString('base64')}`;
          this.imageCache.set(url, result);
          return result;
        } catch {
          // Fallback: use original
          const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          const b64 = fs.readFileSync(filePath).toString('base64');
          const result = `data:${mime};base64,${b64}`;
          this.imageCache.set(url, result);
          return result;
        }
      }
    }
    return url;
  }

  /**
   * Synchronous image compression using sharp pipeline pre-built buffers.
   * Note: sharp operations are async, but we pre-buffer for sync usage.
   */
  private static compressImageSync(buffer: Buffer, _ext: string): Buffer {
    // Use sharp synchronously by calling it ahead of time in batch
    // For now, return original — async compression is done in preloadImages
    return buffer;
  }

  /**
   * Pre-compress all question images before PDF generation (async, called once)
   */
  static async preloadImages(questions: Question[]): Promise<void> {
    const urls = new Set<string>();
    for (const q of questions) {
      if (q.imageUrl) urls.add(q.imageUrl);
      if (q.contextImage) urls.add(q.contextImage);
      if (q.media) {
        for (const m of q.media) {
          if (m.url) urls.add(m.url);
        }
      }
    }

    for (const url of urls) {
      if (this.imageCache.has(url) || url.startsWith('data:') || url.startsWith('http')) continue;

      const candidates: string[] = [];
      if (url.startsWith('/uploads/')) {
        candidates.push(
          path.join(process.cwd(), url),
          path.join(process.cwd(), 'server', url),
          path.join(__dirname, '../..', url),
        );
      } else if (url.startsWith('/')) {
        candidates.push(
          path.join(process.cwd(), '..', 'client', 'public', url),
          path.join(process.cwd(), 'client', 'public', url),
        );
      }

      for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase().replace('.', '');
          if (ext === 'svg') {
            const b64 = fs.readFileSync(filePath).toString('base64');
            this.imageCache.set(url, `data:image/svg+xml;base64,${b64}`);
            break;
          }
          try {
            const compressed = await sharp(filePath)
              .resize(this.MAX_IMAGE_WIDTH, undefined, { withoutEnlargement: true })
              .jpeg({ quality: this.IMAGE_QUALITY, mozjpeg: true })
              .toBuffer();
            this.imageCache.set(url, `data:image/jpeg;base64,${compressed.toString('base64')}`);
          } catch {
            const b64 = fs.readFileSync(filePath).toString('base64');
            const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
            this.imageCache.set(url, `data:${mime};base64,${b64}`);
          }
          break;
        }
      }
    }
  }

  /**
   * Clear image cache (call after PDF generation to free memory)
   */
  static clearImageCache(): void {
    this.imageCache.clear();
  }

  /**
   * Calculate max-width for PDF images based on original dimensions.
   * 2-column layout ~340px per column, scale proportionally.
   */
  private static calcImageStyle(q: Question, isTable: boolean): string {
    if (isTable) return 'max-width: 320px; max-height: 300px; object-fit: contain;';
    if (q.imageWidth && q.imageWidth > 0) {
      // Scale: original px proportional to column width (340px)
      const maxW = Math.min(q.imageWidth, 320);
      const maxH = q.imageHeight ? Math.min(q.imageHeight, 280) : 280;
      return `max-width: ${maxW}px; max-height: ${maxH}px; object-fit: contain;`;
    }
    return 'max-width: 250px; max-height: 200px; object-fit: contain;';
  }

  /**
   * Generate HTML for question images — deduplicated with URL normalization
   */
  private static renderQuestionImages(q: Question): string {
    let html = '';
    const seen = new Set<string>();
    const normalize = (url: string) => url.replace(/^https?:\/\/[^/]+/, '').replace(/\\/g, '/');

    if (q.imageUrl) {
      seen.add(normalize(q.imageUrl));
      const src = this.resolveImageForPdf(q.imageUrl);
      const style = this.calcImageStyle(q, false);
      html += `<div style="margin: 4px 0 4px 24px;"><img src="${src}" style="${style}" /></div>`;
    }
    if (q.media && q.media.length > 0) {
      for (const m of q.media) {
        if (m.url && !seen.has(normalize(m.url))) {
          seen.add(normalize(m.url));
          const src = this.resolveImageForPdf(m.url);
          const style = this.calcImageStyle(q, m.type === 'table');
          html += `<div style="margin: 4px 0 4px 24px;"><img src="${src}" style="${style}" /></div>`;
        }
      }
    }
    return html;
  }

  /**
   * Генерирует PDF из HTML с формулами
   * ВАЖНО: Каждый раз создаем новый browser instance для избежания memory leak
   */
  // Timeout constants
  private static readonly PAGE_TIMEOUT_MS = 120_000; // 2 min per page operation
  private static readonly KATEX_TIMEOUT_MS = 30_000;  // 30s for KaTeX rendering
  private static readonly BROWSER_LAUNCH_TIMEOUT_MS = 30_000;

  /**
   * Render a single batch of students to PDF buffer
   */
  private static async renderBatchPDF(browser: Browser, testData: TestData): Promise<Buffer> {
    const page = await browser.newPage();
    page.setDefaultTimeout(this.PAGE_TIMEOUT_MS);

    try {
      const html = this.generateHTML(testData);
      await page.setContent(html, { waitUntil: 'networkidle', timeout: this.PAGE_TIMEOUT_MS });

      await page.waitForFunction(`
        () => {
          const elements = document.querySelectorAll('.math-formula');
          if (elements.length === 0) return true;
          return Array.from(elements).every(el => el.querySelector('.katex') !== null);
        }
      `, { timeout: this.KATEX_TIMEOUT_MS }).catch(() => {
        console.warn('⚠️ KaTeX render timeout, continuing anyway');
      });

      await page.waitForTimeout(500);

      const pdfResult = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      return Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult);
    } finally {
      await page.close();
    }
  }

  /**
   * Safely launch browser with timeout protection
   */
  private static async launchBrowser(): Promise<Browser> {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: this.BROWSER_LAUNCH_TIMEOUT_MS,
    });
    return browser;
  }

  /**
   * Safely close browser with timeout to prevent hanging
   */
  private static async closeBrowserSafe(browser: Browser | null): Promise<void> {
    if (!browser) return;
    try {
      const closePromise = browser.close();
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Browser close timeout')), 10_000)
      );
      await Promise.race([closePromise, timeoutPromise]);
      console.log('Browser closed, memory freed');
    } catch (err) {
      console.warn('Browser close warning:', (err as Error).message);
      try { (browser as any).process?.()?.kill?.('SIGKILL'); } catch { /* ignore */ }
    }
  }

  static async generatePDF(testData: TestData): Promise<Buffer> {
    const BATCH_SIZE = 3;
    const students = testData.students || [];

    // Pre-compress all images once before generating HTML
    const allQuestions = students.length > 0
      ? students.flatMap(s => s.questions)
      : testData.questions;
    await this.preloadImages(allQuestions);

    try {
      return await this._generatePDFInternal(testData);
    } finally {
      this.clearImageCache();
    }
  }

  private static async _generatePDFInternal(testData: TestData): Promise<Buffer> {
    const BATCH_SIZE = 3;
    const students = testData.students || [];

    // Small data or no students — render in one shot
    if (students.length <= BATCH_SIZE) {
      let browser: Browser | null = null;
      try {
        browser = await this.launchBrowser();
        return await this.renderBatchPDF(browser, testData);
      } finally {
        await this.closeBrowserSafe(browser);
      }
    }

    // Large data — split into batches, merge PDFs
    console.log(`Batching ${students.length} students in groups of ${BATCH_SIZE}`);
    const pdfBuffers: Buffer[] = [];
    let browser: Browser | null = null;

    try {
      browser = await this.launchBrowser();

      for (let i = 0; i < students.length; i += BATCH_SIZE) {
        const batch = students.slice(i, i + BATCH_SIZE);
        console.log(`Rendering batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(students.length / BATCH_SIZE)} (${batch.length} students)`);

        const batchData: TestData = { ...testData, students: batch };
        pdfBuffers.push(await this.renderBatchPDF(browser, batchData));
      }
    } finally {
      await this.closeBrowserSafe(browser);
    }

    // Merge all PDF buffers
    console.log(`🔗 Merging ${pdfBuffers.length} PDF batches...`);
    const mergedPdf = await PDFDocument.create();
    for (const buf of pdfBuffers) {
      const src = await PDFDocument.load(buf);
      const pages = await mergedPdf.copyPages(src, src.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
    }
    const mergedBytes = await mergedPdf.save();
    console.log(`✅ Merged PDF: ${mergedBytes.length} bytes`);
    return Buffer.from(mergedBytes);
  }

  /**
   * Генерирует HTML шаблон с KaTeX
   */
  private static generateHTML(testData: TestData): string {
    const s = testData.settings || {};
    const fontFamily = s.fontFamily || 'Times New Roman';
    const fontSize = s.fontSize || 9;
    const lineHeight = s.lineHeight || 1.2;
    const columnsCount = s.columnsCount || 2;
    const bgOpacity = s.backgroundOpacity ?? 0.08;

    // Logo base64
    let logoBase64 = '';
    try {
      const logoPath = path.join(__dirname, '../../..', 'client/public/logo.png');
      console.log('🖼️ Logo path:', logoPath, 'exists:', fs.existsSync(logoPath));
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        console.log('🖼️ Logo loaded, base64 length:', logoBase64.length);
      } else {
        // Try alternative paths
        const altPaths = [
          path.join(process.cwd(), 'client/public/logo.png'),
          path.join(process.cwd(), '../client/public/logo.png'),
        ];
        for (const alt of altPaths) {
          if (fs.existsSync(alt)) {
            const logoBuffer = fs.readFileSync(alt);
            logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            console.log('🖼️ Logo loaded from alt path:', alt);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('Logo file not found:', err);
    }

    // Если есть несколько студентов - генерируем для каждого
    if (testData.students && testData.students.length > 0) {
      const studentsHTML = testData.students.map((student, index) => `
        ${index > 0 ? '<div style="page-break-before: always;"></div>' : ''}
        <div class="student-page">
          ${logoBase64 ? `<img src="${logoBase64}" class="bg-watermark" />` : ''}
          <div class="content-wrapper">
            <div class="academy-header">
              <img src="${logoBase64 || '/logo.png'}" class="academy-logo" alt="Logo" />
              <div class="academy-center">
                <div class="academy-name">MATH ACADEMY</div>
                <div class="academy-sub">Xususiy maktabi</div>
              </div>
              <div class="academy-right">
                <div class="academy-slogan">Sharqona ta'lim-tarbiya<br/>va haqiqiy ilm maskani.</div>
                <div class="academy-phone">&#9742; +91-333-66-22</div>
              </div>
            </div>
            <div class="header">
              <h1>${testData.title}</h1>
              <div class="info">
                ${[
                  testData.className ? `${testData.className}` : '',
                  testData.subjectName,
                  `Variant: ${student.variantCode}`,
                ].filter(Boolean).join(' &bull; ')}
              </div>
              <div class="info" style="margin-top:2px;font-weight:bold;">${student.studentName}</div>
            </div>
            
            <div class="questions">
              ${student.questions.map(q => {
                const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim();
                const cleanOptions = q.options.map(o => stripHtml(o));
                const totalLength = cleanOptions.reduce((sum, opt) => sum + opt.length, 0);
                const maxSingle = Math.max(...cleanOptions.map(o => o.length), 0);
                // inline: qisqa bo'lsa 1 qatorda, aks holda vertikal
                const optionsClass = totalLength < 120 && maxSingle < 50 ? 'options inline' : 'options';
                const cleanText = stripHtml(q.text);
                const isLong = cleanText.length + totalLength > 600;

                return `
                <div class="question${isLong ? ' long-question' : ''}">
                  ${(q.contextText || q.contextImage) ? `<div class="context-text" style="font-style:italic;margin-bottom:4px;color:#444;overflow:hidden;">${q.contextImage ? `<img src="${this.resolveImageForPdf(q.contextImage)}" style="float:right;${q.contextImageWidth ? `width:${Math.round(q.contextImageWidth * 0.55)}px;` : ''}max-width:40%;max-height:200px;margin:0 0 4px 8px;border-radius:4px;" />` : ''}${q.contextText ? this.renderMath(q.contextText) : ''}<div style="clear:both;"></div></div>` : ''}
                  <div class="question-text">
                    <span class="question-number">${q.number}.</span> ${this.renderMath(q.text)}
                  </div>
                  ${this.renderQuestionImages(q)}
                  <div class="${optionsClass}">
                    ${q.options.map((opt, idx) => `
                      <div class="option">
                        <span class="option-letter">${String.fromCharCode(65 + idx)})</span>
                        <span class="option-text">${this.renderMath(opt)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `}).join('')}
            </div>
          </div>
        </div>
      `).join('');

      return `
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${testData.title}</title>
  <link rel="stylesheet" href="file:///${KATEX_CSS_PATH}">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: '${fontFamily}', Times, serif;
      font-size: ${fontSize}pt;
      line-height: ${lineHeight};
      color: #000;
      background: #fff;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
    }
    
    .student-page {
      position: relative;
      margin-bottom: 20px;
    }
    .bg-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 300px;
      object-fit: contain;
      opacity: ${bgOpacity};
      z-index: 0;
      pointer-events: none;
    }

    .content-wrapper {
      position: relative;
      z-index: 1;
    }

    .academy-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #333;
      padding-bottom: 4px;
      margin-bottom: 4px;
      font-family: 'Times New Roman', serif;
    }
    .academy-logo {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }
    .academy-center {
      text-align: center;
      flex: 1;
      padding: 0 8px;
    }
    .academy-name {
      font-size: 16px;
      font-weight: bold;
      color: #1a1a6e;
      letter-spacing: 0.5px;
    }
    .academy-sub {
      font-size: 11px;
      color: #444;
      font-weight: bold;
    }
    .academy-right {
      text-align: right;
    }
    .academy-slogan {
      font-size: 10px;
      color: #333;
      line-height: 1.3;
    }
    .academy-phone {
      font-size: 11px;
      font-weight: bold;
      color: #1a1a6e;
    }

    .header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
    }

    .header h1 {
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 2px;
    }

    .header .info {
      font-size: 8pt;
      color: #333;
    }
    
    .questions {
      column-count: ${columnsCount};
      column-gap: 15px;
      column-rule: 1px solid #ddd;
    }
    
    .question {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
      display: inline-block;
      width: 100%;
      margin-bottom: 8px;
    }

    .question.long-question {
      break-inside: auto;
      page-break-inside: auto;
      -webkit-column-break-inside: auto;
    }

    .question-number {
      font-weight: bold;
      font-size: 9pt;
    }

    .subject-tag {
      font-weight: bold;
      font-size: 9pt;
    }

    .question-text {
      margin-bottom: 3px;
      line-height: 1.3;
    }

    .options {
      margin-left: 12px;
    }

    .options.inline {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
    }

    .options.inline .option {
      display: inline-flex;
      margin-right: 8px;
      margin-bottom: 0;
    }

    .options.grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px 8px;
    }

    .options.grid .option {
      margin-bottom: 0;
    }

    .option {
      margin-bottom: 1px;
      display: flex;
      align-items: flex-start;
    }

    .option-letter {
      min-width: 20px;
      font-weight: bold;
    }

    .option-text {
      flex: 1;
    }

    .math-formula {
      display: inline;
    }

    .katex {
      font-size: 0.95em;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .question {
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-column-break-inside: avoid;
      }

      .question.long-question {
        break-inside: auto;
        page-break-inside: auto;
        -webkit-column-break-inside: auto;
      }

      .student-page {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${studentsHTML}
  </div>

  <script>${KATEX_JS_CONTENT}</script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const formulas = document.querySelectorAll('.math-formula');
      formulas.forEach(function(el) {
        const latex = el.getAttribute('data-latex');
        if (latex) {
          try {
            katex.render(latex, el, {
              throwOnError: false,
              displayMode: el.classList.contains('display-math')
            });
          } catch (e) {
            console.error('KaTeX error:', e);
            el.textContent = latex;
          }
        }
      });
    });
  </script>
</body>
</html>
      `;
    }

    // Старый формат - один тест
    return `
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${testData.title}</title>
  <link rel="stylesheet" href="file:///${KATEX_CSS_PATH}">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: '${fontFamily}', Times, serif;
      font-size: ${fontSize}pt;
      line-height: ${lineHeight};
      color: #000;
      background: #fff;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
      position: relative;
    }
    .bg-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 300px;
      object-fit: contain;
      opacity: ${bgOpacity};
      z-index: 0;
      pointer-events: none;
    }
    
    .content-wrapper {
      position: relative;
      z-index: 1;
    }

    .academy-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #333;
      padding-bottom: 4px;
      margin-bottom: 4px;
      font-family: 'Times New Roman', serif;
    }
    .academy-logo {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }
    .academy-center {
      text-align: center;
      flex: 1;
      padding: 0 8px;
    }
    .academy-name {
      font-size: 16px;
      font-weight: bold;
      color: #1a1a6e;
      letter-spacing: 0.5px;
    }
    .academy-sub {
      font-size: 11px;
      color: #444;
      font-weight: bold;
    }
    .academy-right {
      text-align: right;
    }
    .academy-slogan {
      font-size: 10px;
      color: #333;
      line-height: 1.3;
    }
    .academy-phone {
      font-size: 11px;
      font-weight: bold;
      color: #1a1a6e;
    }

    .header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
    }

    .header h1 {
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 2px;
    }

    .header .info {
      font-size: 8pt;
      color: #333;
    }
    
    .questions {
      column-count: ${columnsCount};
      column-gap: 15px;
      column-rule: 1px solid #ddd;
    }
    
    .question {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
      display: inline-block;
      width: 100%;
      margin-bottom: 8px;
    }

    .question.long-question {
      break-inside: auto;
      page-break-inside: auto;
      -webkit-column-break-inside: auto;
    }

    .question-number {
      font-weight: bold;
      font-size: 9pt;
    }

    .subject-tag {
      font-weight: bold;
      font-size: 9pt;
    }

    .question-text {
      margin-bottom: 3px;
      line-height: 1.3;
    }

    .options {
      margin-left: 12px;
    }

    .options.inline {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
    }

    .options.inline .option {
      display: inline-flex;
      margin-right: 8px;
      margin-bottom: 0;
    }

    .options.grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px 8px;
    }

    .options.grid .option {
      margin-bottom: 0;
    }

    .option {
      margin-bottom: 1px;
      display: flex;
      align-items: flex-start;
    }

    .option-letter {
      min-width: 20px;
      font-weight: bold;
    }

    .option-text {
      flex: 1;
    }

    .math-formula {
      display: inline;
    }

    .katex {
      font-size: 0.95em;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .question {
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-column-break-inside: avoid;
      }

      .question.long-question {
        break-inside: auto;
        page-break-inside: auto;
        -webkit-column-break-inside: auto;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${logoBase64 ? `<img src="${logoBase64}" class="bg-watermark" />` : ''}
    <div class="content-wrapper">
      <div class="academy-header">
        <img src="${logoBase64 || '/logo.png'}" class="academy-logo" alt="Logo" />
        <div class="academy-center">
          <div class="academy-name">MATH ACADEMY</div>
          <div class="academy-sub">Xususiy maktabi</div>
        </div>
        <div class="academy-right">
          <div class="academy-slogan">Sharqona ta'lim-tarbiya<br/>va haqiqiy ilm maskani.</div>
          <div class="academy-phone">&#9742; +91-333-66-22</div>
        </div>
      </div>
      <div class="header">
        <h1>${testData.title}</h1>
        <div class="info">
          ${[
            testData.className ? `Sinf: ${testData.className}` : '',
            testData.subjectName ? `Fan: ${testData.subjectName}` : '',
            testData.studentName ? `O'quvchi: ${testData.studentName}` : '',
            testData.variantCode ? `Variant: ${testData.variantCode}` : ''
          ].filter(Boolean).join(' &bull; ')}
        </div>
      </div>
      
      <div class="questions">
        ${testData.questions.map(q => {
          const totalLength = q.options.reduce((sum, opt) => sum + opt.length, 0);
          const optionsClass = totalLength < 80 ? 'options inline' : 'options';
          const stripH = (s: string) => s.replace(/<[^>]*>/g, '').trim();
          const isLong = stripH(q.text).length + totalLength > 600;

          return `
          <div class="question${isLong ? ' long-question' : ''}">
            ${(q.contextText || q.contextImage) ? `<div class="context-text" style="font-style:italic;margin-bottom:4px;color:#444;overflow:hidden;">${q.contextImage ? `<img src="${this.resolveImageForPdf(q.contextImage)}" style="float:right;${q.contextImageWidth ? `width:${Math.round(q.contextImageWidth * 0.55)}px;` : ''}max-width:40%;max-height:200px;margin:0 0 4px 8px;border-radius:4px;" />` : ''}${q.contextText ? this.renderMath(q.contextText) : ''}<div style="clear:both;"></div></div>` : ''}
            <div class="question-text">
              <span class="question-number">${q.number}.</span> ${this.renderMath(q.text)}
            </div>
            ${this.renderQuestionImages(q)}
            <div class="${optionsClass}">
              ${q.options.map((opt, idx) => `
                <div class="option">
                  <span class="option-letter">${String.fromCharCode(65 + idx)})</span>
                  <span class="option-text">${this.renderMath(opt)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  </div>
  
  <script>${KATEX_JS_CONTENT}</script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const formulas = document.querySelectorAll('.math-formula');
      formulas.forEach(function(el) {
        const latex = el.getAttribute('data-latex');
        if (latex) {
          try {
            katex.render(latex, el, {
              throwOnError: false,
              displayMode: el.classList.contains('display-math')
            });
          } catch (e) {
            console.error('KaTeX error:', e);
            el.textContent = latex;
          }
        }
      });
    });
  </script>
</body>
</html>
    `;
  }

  /**
   * Обрабатывает текст с LaTeX формулами
   */
  private static renderMath(text: string): string {
    if (!text) return '';

    // Convert TipTap formula spans: <span data-type="formula" data-latex="..."></span>
    // Decode HTML entities (&amp; -> &) and detect display mode for aligned environments
    text = text.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, (_match, latex) => {
      const decoded = latex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      const isDisplay = /\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(decoded);
      return `<span class="math-formula${isDisplay ? ' display-math' : ''}" data-latex="${this.escapeHtml(decoded)}"></span>`;
    });

    // Strip remaining HTML tags (keep math-formula spans already created above)
    text = text.replace(/<(?!\/?span\s)[^>]+>/g, '');

    // Convert \[...\] to $$...$$ and \(...\) to $...$
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');

    // Display math $$...$$
    text = text.replace(/\$\$(.*?)\$\$/g, (_match, latex) => {
      return `<span class="math-formula display-math" data-latex="${this.escapeHtml(latex.trim())}"></span>`;
    });

    // Inline math $...$
    text = text.replace(/\$([^\$]+?)\$/g, (_match, latex) => {
      return `<span class="math-formula" data-latex="${this.escapeHtml(latex.trim())}"></span>`;
    });

    return text;
  }

  /**
   * Экранирует HTML
   */
  private static escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Закрывает браузер (вызывать при остановке сервера)
   */
  static async closeBrowser(): Promise<void> {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
    }
  }

  /**
   * Generate answer sheets PDF for multiple students
   */
  static async generateAnswerSheetsPDF(data: {
    students: Array<{
      fullName: string;
      variantCode: string;
      studentCode?: number;
    }>;
    test: {
      classNumber: number;
      groupLetter: string;
      subjectName?: string;
      periodMonth?: number;
      periodYear?: number;
    };
    totalQuestions: number;
    sheetsPerPage?: number;
  }): Promise<Buffer> {
    let browser: Browser | null = null;

    try {
      browser = await this.launchBrowser();

      const page = await browser.newPage();
      page.setDefaultTimeout(this.PAGE_TIMEOUT_MS);

      try {
        const html = await this.generateAnswerSheetsHTML(data);
        await page.setContent(html, { waitUntil: 'load', timeout: this.PAGE_TIMEOUT_MS });
        await page.waitForTimeout(300);

        const pdfResult = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult);
        console.log(`Answer sheets PDF generated: ${(pdfBuffer.length / 1024).toFixed(1)} KB, ${data.students.length} students`);
        return pdfBuffer;
      } finally {
        await page.close();
      }
    } finally {
      await this.closeBrowserSafe(browser);
    }
  }

  /**
   * Generate answer sheets HTML
   */
  private static async generateAnswerSheetsHTML(data: {
    students: Array<{ fullName: string; variantCode: string; studentCode?: number }>;
    test: { classNumber: number; groupLetter: string; subjectName?: string; periodMonth?: number; periodYear?: number };
    totalQuestions: number;
    sheetsPerPage?: number;
  }): Promise<string> {
    const { students, test, totalQuestions } = data;
    const layout = this.getAnswerSheetLayout(totalQuestions);
    const questionsPerColumn = Math.ceil(totalQuestions / layout.columns);

    const months = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
    const periodText = test.periodMonth && test.periodYear
      ? `${months[test.periodMonth - 1]} ${test.periodYear}` : '';

    // Read logo as base64
    let logoBase64 = '';
    const logoPaths = [
      path.join(process.cwd(), '..', 'client', 'public', 'logo.png'),
      path.join(process.cwd(), 'client', 'public', 'logo.png'),
      path.join(__dirname, '../../../client/public/logo.png'),
    ];
    for (const lp of logoPaths) {
      try {
        if (fs.existsSync(lp)) {
          logoBase64 = `data:image/png;base64,${fs.readFileSync(lp).toString('base64')}`;
          break;
        }
      } catch { /* skip */ }
    }

    // Generate QR codes for all students (variantCode for OMR scanning)
    const qrCodeMap = new Map<string, string>();
    const qrErrors: string[] = [];
    for (const student of students) {
      if (student.variantCode) {
        try {
          const qrPayload = JSON.stringify({ c: student.variantCode.trim().toUpperCase(), q: totalQuestions });
          const qrDataUrl = await QRCode.toDataURL(qrPayload, {
            width: 200,
            margin: 1,
            errorCorrectionLevel: 'H',
            color: { dark: '#000000', light: '#FFFFFF' }
          });
          qrCodeMap.set(student.variantCode, qrDataUrl);
        } catch (err) {
          const msg = `QR generation failed for variant ${student.variantCode}: ${(err as Error).message}`;
          console.error(msg);
          qrErrors.push(msg);
        }
      }
    }
    if (qrErrors.length > 0) {
      throw new Error(`OMR answer sheet QR kodlarini yaratishda xatolik: ${qrErrors.length} ta variant uchun QR yaratilmadi. ${qrErrors[0]}`);
    }

    // Timing mark rows: first, last, every 5th
    const timingMarkSize = 3; // mm
    const timingMarkRows = new Set<number>([0, questionsPerColumn - 1]);
    for (let i = 5; i < questionsPerColumn; i += 5) timingMarkRows.add(i);

    const sheetsHtml = students.map((student) => {
      const qrDataUrl = qrCodeMap.get(student.variantCode) || '';
      let gridHtml = '';
      for (let col = 0; col < layout.columns; col++) {
        const start = col * questionsPerColumn + 1;
        const count = Math.min(questionsPerColumn, totalQuestions - col * questionsPerColumn);
        let colHtml = `<div class="grid-col">`;
        // Header row with timing mark + letters
        colHtml += `<div class="q-row q-header">`;
        colHtml += `<div class="timing-mark-area"><div class="timing-mark"></div></div>`;
        colHtml += `<div class="q-num"></div><div class="q-bubbles">`;
        for (const letter of ['A','B','C','D']) {
          colHtml += `<div class="bubble-label">${letter}</div>`;
        }
        colHtml += `</div>`;
        // Right timing mark on last column header
        colHtml += col === layout.columns - 1 ? `<div class="timing-mark" style="margin-left:1mm;flex-shrink:0"></div>` : '';
        colHtml += `</div>`;
        for (let i = 0; i < count; i++) {
          const qNum = start + i;
          // ALL columns get timing marks (not just col 0)
          const showLeftMark = timingMarkRows.has(i);
          const showRightMark = col === layout.columns - 1 && timingMarkRows.has(i);
          colHtml += `<div class="q-row">`;
          colHtml += `<div class="timing-mark-area">${showLeftMark ? '<div class="timing-mark"></div>' : ''}</div>`;
          colHtml += `<div class="q-num">${qNum}.</div>`;
          colHtml += `<div class="q-bubbles">`;
          for (const _letter of ['A','B','C','D']) {
            colHtml += `<div class="bubble"></div>`;
          }
          colHtml += `</div>`;
          // Right timing mark on last column
          colHtml += showRightMark ? `<div class="timing-mark" style="margin-left:1mm;flex-shrink:0"></div>` : '';
          colHtml += `</div>`;
        }
        colHtml += `</div>`;
        gridHtml += colHtml;
      }

      return `
      <div class="sheet">
        <!-- Corner Marks for OMR -->
        <div class="corner-mark" style="top:2mm;left:2mm"></div>
        <div class="corner-mark" style="top:2mm;right:2mm"></div>
        <div class="corner-mark" style="bottom:2mm;left:2mm"></div>
        <div class="corner-mark" style="bottom:2mm;right:2mm"></div>

        <!-- Academy Header -->
        <div class="academy-header">
          ${logoBase64 ? `<img src="${logoBase64}" class="academy-logo"/>` : '<div></div>'}
          <div class="academy-center">
            <div class="academy-name">MATH ACADEMY</div>
            <div class="academy-sub">Xususiy maktabi</div>
          </div>
          <div class="academy-right">
            <div class="academy-slogan">Sharqona ta&#39;lim-tarbiya<br/>va haqiqiy ilm maskani.</div>
            <div class="academy-phone">&#9742; +91-333-66-22</div>
          </div>
        </div>

        <!-- Title & Info -->
        <div class="info-section">
          <div class="info-left">
            <div class="sheet-title">JAVOB VARAQASI</div>
            <table class="info-table">
              <tr><td class="info-label">O&#39;quvchi:</td><td class="info-value">${student.fullName}</td></tr>
              ${test.subjectName ? `<tr><td class="info-label">Fan:</td><td class="info-value">${test.subjectName}</td></tr>` : ''}
              ${periodText ? `<tr><td class="info-label">Davr:</td><td class="info-value">${periodText}</td></tr>` : ''}
              <tr><td class="info-label">ID:</td><td class="info-value" style="font-weight:bold">${student.studentCode || student.variantCode}</td></tr>
              <tr><td class="info-label">Sinf:</td><td class="info-value">${test.classNumber}-${test.groupLetter} &nbsp;&nbsp; <span class="info-label">Savollar:</span> ${totalQuestions}</td></tr>
            </table>
          </div>
          ${qrDataUrl ? `<div class="qr-box"><img src="${qrDataUrl}" class="qr-img"/></div>` : ''}
        </div>

        <!-- Instructions -->
        <div class="instructions">
          <strong>Ko&#39;rsatmalar:</strong>
          Qora yoki ko&#39;k ruchka ishlatiladi. Doirachani to&#39;liq to&#39;ldiring. Bir savolga faqat bitta javob belgilang.
        </div>

        <!-- Answer Grid -->
        <div class="answer-grid">
          ${gridHtml}
        </div>

        <!-- Footer removed -->
      </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; padding: 0; background: white; }

  .sheet {
    width: 210mm; position: relative;
    background: white; padding: 10mm;
    font-family: Arial, sans-serif; color: black;
    box-sizing: border-box; page-break-after: always;
    margin: 0 auto;
  }
  .sheet:last-child { page-break-after: auto; }

  /* Corner marks — 8mm for reliable detection */
  .corner-mark {
    position: absolute; width: 8mm; height: 8mm;
    background: #000; box-sizing: border-box;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Academy header — matches AnswerSheet.tsx */
  .academy-header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2px solid #333; padding-bottom: 2mm; margin-bottom: 2mm;
    padding: 0 5mm;
    font-family: 'Times New Roman', serif;
  }
  .academy-logo { width: 12mm; height: 12mm; object-fit: contain; }
  .academy-center { text-align: center; flex: 1; padding: 0 2mm; }
  .academy-name { font-weight: bold; color: #1a1a6e; font-size: 14pt; letter-spacing: 0.5px; }
  .academy-sub { font-weight: bold; color: #444; font-size: 9pt; }
  .academy-right { text-align: right; }
  .academy-slogan { color: #333; font-size: 8pt; line-height: 1.3; }
  .academy-phone { font-weight: bold; color: #1a1a6e; font-size: 9pt; }

  /* Info section — matches AnswerSheet.tsx */
  .info-section {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 3mm; padding: 0 5mm;
  }
  .info-left { flex: 1; }
  .sheet-title {
    font-size: 16pt; font-weight: bold;
    margin-bottom: 2mm;
  }
  .info-table { font-size: 10pt; border-collapse: collapse; }
  .info-table td { padding: 1mm 0; vertical-align: top; }
  .info-label { font-weight: 600; padding-right: 3mm; white-space: nowrap; }
  .info-value { color: #000; }

  /* QR Code — matches AnswerSheet.tsx */
  .qr-box {
    width: 30mm; height: 30mm; border: 2px solid black;
    display: flex; align-items: center; justify-content: center;
  }
  .qr-img { width: 27mm; height: 27mm; }

  /* Instructions — matches AnswerSheet.tsx */
  .instructions {
    background: #f0f0f0; border: 1px solid #ccc;
    padding: 2mm; margin-bottom: 3mm; font-size: 8pt;
  }

  /* Answer grid — matches AnswerSheet.tsx */
  .answer-grid {
    display: flex; gap: ${layout.columnGap}mm; padding: 0 5mm;
  }
  .grid-col { flex: 1; }
  .q-row {
    display: flex; align-items: center; margin: ${layout.rowMargin}mm 0;
  }
  .q-num {
    width: ${layout.numberWidth}mm; font-weight: bold;
    font-size: ${layout.fontSize}pt; text-align: left;
  }
  .q-bubbles { display: flex; gap: ${layout.bubbleGap}mm; }
  .bubble {
    width: ${layout.bubbleSize}mm; height: ${layout.bubbleSize}mm;
    border: ${layout.borderWidth}px solid #000; border-radius: 50%;
    background: #fff; box-sizing: border-box;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .bubble-label {
    width: ${layout.bubbleSize}mm; text-align: center;
    font-size: ${layout.bubbleFontSize}pt; font-weight: bold; color: #333;
  }
  .q-header { margin-bottom: ${layout.rowMargin + 0.5}mm; }
  .timing-mark-area {
    width: ${timingMarkSize + 1}mm; flex-shrink: 0;
    display: flex; align-items: center;
  }
  .timing-mark {
    width: ${timingMarkSize}mm; height: ${timingMarkSize}mm;
    background: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

</style>
</head><body>${sheetsHtml}</body></html>`;
  }

  /**
   * Get layout config for answer sheet based on question count
   */
  private static getAnswerSheetLayout(totalQuestions: number) {
    if (totalQuestions <= 44) {
      return { columns: 2, bubbleSize: 7.5, bubbleGap: 2.5, rowMargin: 1.2, columnGap: 8, numberWidth: 8, fontSize: 9, bubbleFontSize: 8, borderWidth: 2 };
    }
    if (totalQuestions <= 60) {
      return { columns: 3, bubbleSize: 7.5, bubbleGap: 2.5, rowMargin: 1.2, columnGap: 6, numberWidth: 8, fontSize: 9, bubbleFontSize: 8, borderWidth: 2 };
    }
    if (totalQuestions <= 75) {
      return { columns: 3, bubbleSize: 7, bubbleGap: 2, rowMargin: 0.8, columnGap: 5, numberWidth: 8, fontSize: 8, bubbleFontSize: 7, borderWidth: 2 };
    }
    if (totalQuestions <= 100) {
      return { columns: 4, bubbleSize: 5.5, bubbleGap: 2.5, rowMargin: 1.0, columnGap: 4, numberWidth: 7, fontSize: 7.5, bubbleFontSize: 6.5, borderWidth: 1.5 };
    }
    return { columns: 5, bubbleSize: 5.5, bubbleGap: 1.2, rowMargin: 0.4, columnGap: 3, numberWidth: 6, fontSize: 7, bubbleFontSize: 6, borderWidth: 1.5 };
  }

  /**
   * Booklet imposition — har bir o'quvchi PDF ni kitobcha formatga aylantirish
   * Natija: A4 landscape, har sahifada 2 ta A5 portrait sahifa yonma-yon
   */
  static async imposeBooklet(pdfBuffer: Buffer, studentCount: number): Promise<Buffer> {
    const src = await PDFDocument.load(pdfBuffer);
    const totalPages = src.getPageCount();
    const pagesPerStudent = Math.ceil(totalPages / studentCount);

    console.log(`📖 [BOOKLET] ${studentCount} students, ${totalPages} pages, ~${pagesPerStudent} per student`);

    const dest = await PDFDocument.create();

    // A4 landscape dimensions (pts)
    const LW = 841.89;
    const LH = 595.28;
    const halfW = LW / 2;

    // Original page size
    const origPage = src.getPage(0);
    const { width: origW, height: origH } = origPage.getSize();

    // Scale to fit half of landscape A4 with small margin
    const scale = Math.min(halfW / origW, LH / origH) * 0.95;
    const scaledW = origW * scale;
    const scaledH = origH * scale;
    const xOffLeft = (halfW - scaledW) / 2;
    const xOffRight = halfW + (halfW - scaledW) / 2;
    const yOff = (LH - scaledH) / 2;

    // Embed all pages at once
    const embeddedPages = await dest.embedPages(src.getPages());

    for (let s = 0; s < studentCount; s++) {
      const startPage = s * pagesPerStudent;
      const endPage = Math.min(startPage + pagesPerStudent, totalPages);
      const n = endPage - startPage;
      const padded = Math.ceil(n / 4) * 4;

      // Collect student pages (with null for padding)
      const studentPages: (typeof embeddedPages[0] | null)[] = [];
      for (let i = 0; i < padded; i++) {
        const srcIdx = startPage + i;
        studentPages.push(srcIdx < endPage ? embeddedPages[srcIdx] : null);
      }

      // Booklet imposition: each sheet has front and back
      for (let si = 0; si < padded / 4; si++) {
        const fl = padded - 1 - 2 * si;  // front left page index
        const fr = 2 * si;                // front right page index
        const bl = 2 * si + 1;            // back left page index
        const br = padded - 2 - 2 * si;   // back right page index

        // Front side
        const frontPage = dest.addPage([LW, LH]);
        if (studentPages[fl]) {
          frontPage.drawPage(studentPages[fl]!, { x: xOffLeft, y: yOff, width: scaledW, height: scaledH });
        }
        if (studentPages[fr]) {
          frontPage.drawPage(studentPages[fr]!, { x: xOffRight, y: yOff, width: scaledW, height: scaledH });
        }

        // Back side
        const backPage = dest.addPage([LW, LH]);
        if (studentPages[bl]) {
          backPage.drawPage(studentPages[bl]!, { x: xOffLeft, y: yOff, width: scaledW, height: scaledH });
        }
        if (studentPages[br]) {
          backPage.drawPage(studentPages[br]!, { x: xOffRight, y: yOff, width: scaledW, height: scaledH });
        }
      }

      console.log(`📖 [BOOKLET] Student ${s + 1}: ${n} pages → ${padded} padded → ${padded / 2} sheets`);
    }

    const bytes = await dest.save();
    console.log(`✅ [BOOKLET] Done: ${dest.getPageCount()} landscape pages`);
    return Buffer.from(bytes);
  }
}
