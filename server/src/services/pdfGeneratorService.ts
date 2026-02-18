import { chromium, Browser } from 'playwright';

interface Question {
  number: number;
  subjectName?: string;
  text: string;
  options: string[];
  correctAnswer?: string;
}

interface StudentTest {
  studentName: string;
  variantCode: string;
  questions: Question[];
}

interface TestData {
  title: string;
  className?: string;
  subjectName?: string;
  studentName?: string;
  variantCode?: string;
  questions: Question[];
  students?: StudentTest[]; // Для множественных студентов
}

export class PDFGeneratorService {
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
    // Если есть несколько студентов - генерируем для каждого
    if (testData.students && testData.students.length > 0) {
      const studentsHTML = testData.students.map((student, index) => `
        ${index > 0 ? '<div style="page-break-before: always;"></div>' : ''}
        <div class="student-page">
          <div class="background-overlay"></div>
          <div class="content-wrapper">
            <div class="header">
              <h1>${student.studentName}</h1>
              <div class="info">
                ${[
                  `Variant: ${student.variantCode}`,
                  testData.subjectName,
                  testData.className
                ].filter(Boolean).join(' • ')}
              </div>
            </div>
            
            <div class="questions">
              ${student.questions.map(q => {
                const totalLength = q.options.reduce((sum, opt) => sum + opt.length, 0);
                const optionsClass = totalLength < 80 ? 'options inline' : 'options';
                
                return `
                <div class="question">
                  <div class="question-text">
                    <span class="question-number">${q.number}.</span> ${q.subjectName ? `<span class="subject-tag">[${q.subjectName}]</span> ` : ''}${this.renderMath(q.text)}
                  </div>
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
    }
    
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 9pt;
      line-height: 1.2;
      color: #000;
      background: #fff;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
    }
    
    .student-page {
      position: relative;
      min-height: 100vh;
      background-image: url('http://localhost:9998/logo.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      margin-bottom: 20px;
    }
    
    .background-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, 0.95);
      pointer-events: none;
      z-index: 0;
    }
    
    .content-wrapper {
      position: relative;
      z-index: 1;
    }
    
    .header {
      text-align: center;
      margin-bottom: 8px;
      border-bottom: 1.5px solid #000;
      padding-bottom: 5px;
    }
    
    .header h1 {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 3px;
    }
    
    .header .info {
      font-size: 9pt;
      color: #333;
    }
    
    .questions {
      column-count: 2;
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
    }
    
    body {
      font-family: 'Timew Roman', Times, serif;
      font-size: 9pt;
      line-height: 1.2;
      color: #000;
      background: #fff;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
      position: relative;
      min-height: 100vh;
      background-image: url('http://localhost:9998/logo.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
    }
    
    .background-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, 0.95);
      pointer-events: none;
      z-index: 0;
    }
    
    .content-wrapper {
      position: relative;
      z-index: 1;
    }
    
    .header {
      text-align: center;
      margin-bottom: 8px;
      border-bottom: 1.5px solid #000;
      padding-bottom: 5px;
    }
    
    .header h1 {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 3px;
    }
    
    .header .info {
      font-size: 9pt;
      color: #333;
    }
    
    .questions {
      column-count: 2;
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
    <div class="background-overlay"></div>
    <div class="content-wrapper">
      <div class="header">
        <h1>${testData.title}</h1>
        <div class="info">
          ${[
            testData.className ? `Sinf: ${testData.className}` : '',
            testData.subjectName ? `Fan: ${testData.subjectName}` : '',
            testData.studentName ? `O'quvchi: ${testData.studentName}` : '',
            testData.variantCode ? `Variant: ${testData.variantCode}` : ''
          ].filter(Boolean).join(' • ')}
        </div>
      </div>
      
      <div class="questions">
        ${testData.questions.map(q => {
          const totalLength = q.options.reduce((sum, opt) => sum + opt.length, 0);
          const optionsClass = totalLength < 80 ? 'options inline' : 'options';
          
          return `
          <div class="question">
            <div class="question-text">
              <span class="question-number">${q.number}.</span> ${q.subjectName ? `<span class="subject-tag">[${q.subjectName}]</span> ` : ''}${this.renderMath(q.text)}
            </div>
            <div class="${optionsClass}">
              ${q.options.map((opt, idx) => `
                <div class="option">
          g.fromCharCode(65 + idx)})</span>
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
      formulas.forEach(el) {
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
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
