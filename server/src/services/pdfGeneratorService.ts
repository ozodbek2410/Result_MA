import { chromium, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

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
  static async generatePDF(testData: TestData): Promise<Buffer> {
    let browser: Browser | null = null;
    
    try {
      // Создаем новый browser для каждого PDF
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Уменьшает использование shared memory
          '--disable-gpu' // Отключаем GPU для headless
        ]
      });
      
      const page = await browser.newPage();
      
      // Увеличиваем timeout для страницы
      page.setDefaultTimeout(60000);

      try {
        // Генерируем HTML
        const html = this.generateHTML(testData);

        // Загружаем HTML
        await page.setContent(html, { 
          waitUntil: 'networkidle',
          timeout: 60000
        });

        // Ждем рендера KaTeX формул
        await page.waitForFunction(`
          () => {
            const elements = document.querySelectorAll('.math-formula');
            if (elements.length === 0) return true;
            return Array.from(elements).every(el => 
              el.querySelector('.katex') !== null
            );
          }
        `, { timeout: 30000 }).catch(() => {
          console.warn('⚠️ KaTeX render timeout, continuing anyway');
        });

        // Небольшая задержка для стабильности
        await page.waitForTimeout(1000);

        // Генерируем PDF
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '10mm',
            right: '10mm',
            bottom: '10mm',
            left: '10mm'
          }
        });

        return pdfBuffer;
      } finally {
        await page.close();
      }
    } finally {
      // КРИТИЧНО: Закрываем browser после каждого PDF
      if (browser) {
        await browser.close();
        console.log('✅ Browser closed, memory freed');
      }
    }
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
    
    .background-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, ${1 - bgOpacity});
      pointer-events: none;
      z-index: 0;
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
      gap: 8px;
    }
    
    .options.inline .option {
      display: inline-flex;
      margin-right: 8px;
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
  ${logoBase64 ? `<img src="${logoBase64}" class="bg-watermark" />` : ''}
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
      min-height: 100vh;
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
    
    .background-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, ${1 - bgOpacity});
      pointer-events: none;
      z-index: 0;
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
      gap: 8px;
    }
    
    .options.inline .option {
      display: inline-flex;
      margin-right: 8px;
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
    
    // Обрабатываем display math $...$
    text = text.replace(/\$\$(.*?)\$\$/g, (_match, latex) => {
      return `<span class="math-formula display-math" data-latex="${this.escapeHtml(latex.trim())}"></span>`;
    });
    
    // Обрабатываем inline math $...$
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
        const html = this.generateAnswerSheetsHTML(data);
        await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(500);

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

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
  private static generateAnswerSheetsHTML(data: {
    students: Array<{ fullName: string; variantCode: string }>;
    test: { classNumber: number; groupLetter: string; subjectName?: string; periodMonth?: number; periodYear?: number };
    totalQuestions: number;
    sheetsPerPage?: number;
  }): string {
    const { students, test, totalQuestions } = data;
    const layout = this.getAnswerSheetLayout(totalQuestions);
    const questionsPerColumn = Math.ceil(totalQuestions / layout.columns);

    const months = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
    const periodText = test.periodMonth && test.periodYear
      ? `${months[test.periodMonth - 1]} ${test.periodYear}` : '';

    // Read logo as base64
    let logoBase64 = '';
    try {
      const logoPath = path.join(process.cwd(), '..', 'client', 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    } catch {}

    const sheetsHtml = students.map((student) => {
      // Build bubble grid columns
      let gridHtml = '';
      for (let col = 0; col < layout.columns; col++) {
        const start = col * questionsPerColumn + 1;
        const count = Math.min(questionsPerColumn, totalQuestions - col * questionsPerColumn);
        let colHtml = `<div style="flex:1">`;
        for (let i = 0; i < count; i++) {
          const qNum = start + i;
          colHtml += `<div style="display:flex;align-items:center;margin:${layout.rowMargin}mm 0">`;
          colHtml += `<div style="width:${layout.numberWidth}mm;font-weight:bold;font-size:${layout.fontSize}pt;text-align:left">${qNum}.</div>`;
          colHtml += `<div style="display:flex;gap:${layout.bubbleGap}mm;flex:1">`;
          for (const letter of ['A','B','C','D']) {
            colHtml += `<div style="width:${layout.bubbleSize}mm;height:${layout.bubbleSize}mm;border:${layout.borderWidth}px solid #000;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:${layout.bubbleFontSize}pt;font-weight:bold;box-sizing:border-box">${letter}</div>`;
          }
          colHtml += `</div></div>`;
        }
        colHtml += `</div>`;
        gridHtml += colHtml;
      }

      return `
      <div class="sheet" style="width:210mm;position:relative;background:white;padding:10mm;font-family:Arial,sans-serif;color:black;box-sizing:border-box;page-break-after:always">
        <!-- Academy Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:2mm;margin-bottom:2mm;padding:0 5mm;font-family:'Times New Roman',serif">
          <div style="display:flex;align-items:center;gap:2mm">
            ${logoBase64 ? `<img src="${logoBase64}" style="width:12mm;height:12mm;object-fit:contain"/>` : ''}
          </div>
          <div style="text-align:center;flex:1;padding:0 2mm">
            <div style="font-weight:bold;color:#1a1a6e;font-size:14pt;letter-spacing:0.5px">MATH ACADEMY</div>
            <div style="font-weight:bold;color:#444;font-size:9pt">Xususiy maktabi</div>
          </div>
          <div style="text-align:right">
            <div style="color:#333;font-size:8pt;line-height:1.3">Sharqona ta'lim-tarbiya<br/>va haqiqiy ilm maskani.</div>
            <div style="font-weight:bold;color:#1a1a6e;font-size:9pt">&#9742; +91-333-66-22</div>
          </div>
        </div>

        <!-- Corner Marks -->
        <div style="position:absolute;top:1mm;left:1mm;width:12mm;height:12mm;background:black;border:6mm solid black;box-sizing:border-box"></div>
        <div style="position:absolute;top:1mm;right:1mm;width:12mm;height:12mm;background:black;border:6mm solid black;box-sizing:border-box"></div>
        <div style="position:absolute;bottom:1mm;left:1mm;width:12mm;height:12mm;background:black;border:6mm solid black;box-sizing:border-box"></div>
        <div style="position:absolute;bottom:1mm;right:1mm;width:12mm;height:12mm;background:black;border:6mm solid black;box-sizing:border-box"></div>

        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3mm;padding:0 5mm">
          <div style="flex:1">
            <h1 style="font-size:16pt;font-weight:bold;margin:0 0 2mm 0">JAVOB VARAQASI</h1>
            <div style="font-size:10pt">
              <div style="margin:1mm 0"><span style="font-weight:600">O'quvchi:</span> ${student.fullName}</div>
              ${test.subjectName ? `<div style="margin:1mm 0"><span style="font-weight:600">Fan:</span> ${test.subjectName}</div>` : ''}
              ${periodText ? `<div style="margin:1mm 0"><span style="font-weight:600">Davr:</span> ${periodText}</div>` : ''}
              <div style="margin:1mm 0"><span style="font-weight:600">Variant:</span> <b>${student.variantCode}</b></div>
              <div style="margin:1mm 0"><span style="font-weight:600">Sinf:</span> ${test.classNumber}-${test.groupLetter}
                <span style="margin-left:5mm;font-weight:600">Savollar soni: ${totalQuestions}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Instructions -->
        <div style="background:#f0f0f0;padding:2mm;margin-bottom:3mm;border:1px solid #ccc;font-size:8pt">
          <h3 style="font-size:9pt;font-weight:bold;margin:0 0 1.5mm 0">Ko'rsatmalar:</h3>
          <ul style="margin:0;padding-left:5mm">
            <li style="margin:0.5mm 0">Qora yoki ko'k ruchka ishlatiladi. Doirachani to'liq to'ldiring.</li>
            <li style="margin:0.5mm 0">Bir savolga faqat bitta javob belgilang. O'chirish yoki tuzatish mumkin emas.</li>
          </ul>
        </div>

        <!-- Answer Grid -->
        <div style="display:flex;gap:${layout.columnGap}mm;padding:0 5mm">
          ${gridHtml}
        </div>
      </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; padding: 0; }
  .sheet:last-child { page-break-after: auto; }
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
      return { columns: 4, bubbleSize: 6.5, bubbleGap: 1.5, rowMargin: 0.6, columnGap: 4, numberWidth: 7, fontSize: 7.5, bubbleFontSize: 6.5, borderWidth: 1.5 };
    }
    return { columns: 5, bubbleSize: 5.5, bubbleGap: 1.2, rowMargin: 0.4, columnGap: 3, numberWidth: 6, fontSize: 7, bubbleFontSize: 6, borderWidth: 1.5 };
  }
}
