import { chromium, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';

interface Question {
  number: number;
  subjectName?: string;
  text: string;
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

  /**
   * Convert question image URL to base64 data URI for embedding in PDF
   */
  private static resolveImageForPdf(url: string): string {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;

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
        const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        const b64 = fs.readFileSync(filePath).toString('base64');
        return `data:${mime};base64,${b64}`;
      }
    }
    return url;
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
  /**
   * Render a single batch of students to PDF buffer
   */
  private static async renderBatchPDF(browser: Browser, testData: TestData): Promise<Buffer> {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    try {
      const html = this.generateHTML(testData);
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });

      await page.waitForFunction(`
        () => {
          const elements = document.querySelectorAll('.math-formula');
          if (elements.length === 0) return true;
          return Array.from(elements).every(el => el.querySelector('.katex') !== null);
        }
      `, { timeout: 30000 }).catch(() => {
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

  static async generatePDF(testData: TestData): Promise<Buffer> {
    const BATCH_SIZE = 3;
    const students = testData.students || [];

    // Small data or no students — render in one shot
    if (students.length <= BATCH_SIZE) {
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        return await this.renderBatchPDF(browser, testData);
      } finally {
        if (browser) { await browser.close(); console.log('✅ Browser closed, memory freed'); }
      }
    }

    // Large data — split into batches, merge PDFs
    console.log(`📦 Batching ${students.length} students in groups of ${BATCH_SIZE}`);
    const pdfBuffers: Buffer[] = [];
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });

      for (let i = 0; i < students.length; i += BATCH_SIZE) {
        const batch = students.slice(i, i + BATCH_SIZE);
        console.log(`📄 Rendering batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(students.length / BATCH_SIZE)} (${batch.length} students)`);

        const batchData: TestData = { ...testData, students: batch };
        pdfBuffers.push(await this.renderBatchPDF(browser, batchData));
      }
    } finally {
      if (browser) { await browser.close(); console.log('✅ Browser closed, memory freed'); }
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
              <h1>${student.studentName}</h1>
              <div class="info">
                ${[
                  `Variant: ${student.variantCode}`,
                  testData.subjectName,
                  testData.className
                ].filter(Boolean).join(' &bull; ')}
              </div>
            </div>
            
            <div class="questions">
              ${student.questions.map(q => {
                const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim();
                const cleanOptions = q.options.map(o => stripHtml(o));
                const totalLength = cleanOptions.reduce((sum, opt) => sum + opt.length, 0);
                const maxSingle = Math.max(...cleanOptions.map(o => o.length), 0);
                // inline: sig'sa 1 qatorda, sig'masa 2x2 grid
                const optionsClass = totalLength < 120 && maxSingle < 50 ? 'options inline' : 'options grid';
                
                return `
                <div class="question">
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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
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
      margin-bottom: 8px;
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

  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
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
      margin-bottom: 8px;
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
          
          return `
          <div class="question">
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
  
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
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
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });

      const page = await browser.newPage();
      page.setDefaultTimeout(60000);

      try {
        const html = await this.generateAnswerSheetsHTML(data);
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(300);

        const pdfResult = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        // Playwright may return Uint8Array instead of Buffer
        const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult);
        console.log(`Answer sheets PDF generated: ${(pdfBuffer.length / 1024).toFixed(1)} KB, ${data.students.length} students`);
        return pdfBuffer;
      } finally {
        await page.close();
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Generate answer sheets HTML
   */
  private static async generateAnswerSheetsHTML(data: {
    students: Array<{ fullName: string; variantCode: string }>;
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

    // Generate QR codes for all students
    const qrCodeMap = new Map<string, string>();
    for (const student of students) {
      if (student.variantCode) {
        try {
          const qrDataUrl = await QRCode.toDataURL(student.variantCode.trim().toUpperCase(), {
            width: 200,
            margin: 1,
            errorCorrectionLevel: 'H',
            color: { dark: '#000000', light: '#FFFFFF' }
          });
          qrCodeMap.set(student.variantCode, qrDataUrl);
        } catch (err) {
          console.warn('QR code generation failed for', student.variantCode);
        }
      }
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
        colHtml += `</div></div>`;
        for (let i = 0; i < count; i++) {
          const qNum = start + i;
          const showMark = col === 0 && timingMarkRows.has(i);
          colHtml += `<div class="q-row">`;
          colHtml += `<div class="timing-mark-area">${showMark ? '<div class="timing-mark"></div>' : ''}</div>`;
          colHtml += `<div class="q-num">${qNum}.</div>`;
          colHtml += `<div class="q-bubbles">`;
          for (const _letter of ['A','B','C','D']) {
            colHtml += `<div class="bubble"></div>`;
          }
          colHtml += `</div></div>`;
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
              <tr><td class="info-label">Variant:</td><td class="info-value" style="font-weight:bold">${student.variantCode}</td></tr>
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
    background: white; padding: 14mm 12mm 10mm 12mm;
    font-family: Arial, Helvetica, sans-serif; color: #000;
    box-sizing: border-box; page-break-after: always;
  }
  .sheet:last-child { page-break-after: auto; }

  /* Corner marks */
  .corner-mark {
    position: absolute; width: 5mm; height: 5mm;
    background: #000; box-sizing: border-box;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Academy header */
  .academy-header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2.5px solid #1a1a6e; padding-bottom: 2mm; margin-bottom: 3mm;
    font-family: 'Times New Roman', Georgia, serif;
  }
  .academy-logo { width: 13mm; height: 13mm; object-fit: contain; }
  .academy-center { text-align: center; flex: 1; padding: 0 3mm; }
  .academy-name { font-weight: bold; color: #1a1a6e; font-size: 15pt; letter-spacing: 1px; }
  .academy-sub { font-weight: bold; color: #555; font-size: 9pt; margin-top: 0.5mm; }
  .academy-right { text-align: right; }
  .academy-slogan { color: #444; font-size: 7.5pt; line-height: 1.3; }
  .academy-phone { font-weight: bold; color: #1a1a6e; font-size: 9pt; margin-top: 1mm; }

  /* Info section */
  .info-section {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 3mm; padding: 2mm 0;
  }
  .info-left { flex: 1; }
  .sheet-title {
    font-size: 16pt; font-weight: bold; color: #1a1a6e;
    margin-bottom: 2mm; letter-spacing: 0.5px;
    border-bottom: 1px solid #ddd; padding-bottom: 1.5mm;
  }
  .info-table { font-size: 10pt; border-collapse: collapse; }
  .info-table td { padding: 0.8mm 0; vertical-align: top; }
  .info-label { font-weight: 600; color: #333; padding-right: 3mm; white-space: nowrap; }
  .info-value { color: #000; }

  /* QR Code */
  .qr-box {
    width: 30mm; height: 30mm; border: 1.5px solid #333;
    display: flex; align-items: center; justify-content: center;
    margin-left: 3mm; flex-shrink: 0;
  }
  .qr-img { width: 27mm; height: 27mm; }

  /* Instructions */
  .instructions {
    background: #f5f5f5; border: 1px solid #ccc; border-radius: 1mm;
    padding: 2mm 3mm; margin-bottom: 4mm; font-size: 8pt; color: #333;
    line-height: 1.4;
  }

  /* Answer grid */
  .answer-grid {
    display: flex; gap: ${layout.columnGap}mm; padding: 0 2mm;
  }
  .grid-col { flex: 1; }
  .q-row {
    display: flex; align-items: center; margin: ${layout.rowMargin}mm 0;
  }
  .q-num {
    width: ${layout.numberWidth}mm; font-weight: bold;
    font-size: ${layout.fontSize}pt; text-align: right; padding-right: 1.5mm;
    color: #333;
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
}
