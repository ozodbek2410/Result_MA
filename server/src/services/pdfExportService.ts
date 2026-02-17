import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import path from 'path';
import fs from 'fs';

// Путь к шрифтам для поддержки кириллицы и узбекского
const FONTS_DIR = path.join(__dirname, '..', '..', 'fonts');

interface Question {
  number: number;
  subjectName?: string;
  question: string;
  options: string[];
  correctAnswer?: string;
  points?: number;
}

interface TestData {
  title: string;
  studentName?: string;
  className?: string;
  subjectName?: string;
  variantCode?: string;
  questions: Question[];
}

export class PDFExportService {
  /**
   * Генерирует PDF документ с вопросами теста
   */
  static async generateTestPDF(testData: TestData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
          bufferPages: true
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Заголовок
        doc.fontSize(14).font('Helvetica-Bold').text(testData.title, { align: 'center' });
        doc.moveDown(0.3);

        // Информация о студенте/классе в одну строку
        const info: string[] = [];
        if (testData.className) info.push(`Sinf: ${testData.className}`);
        if (testData.subjectName) info.push(`Fan: ${testData.subjectName}`);
        if (testData.studentName) info.push(`O'quvchi: ${testData.studentName}`);
        if (testData.variantCode) info.push(`Variant: ${testData.variantCode}`);
        
        if (info.length > 0) {
          doc.fontSize(10).font('Helvetica').text(info.join(' • '), { align: 'center' });
          doc.moveDown(0.5);
        }

        // Вопросы в 2 колонки
        const pageWidth = doc.page.width - 80; // 40px margins on each side
        const columnWidth = (pageWidth - 20) / 2; // 20px gap between columns
        const leftColumnX = 40;
        const rightColumnX = leftColumnX + columnWidth + 20;
        
        let currentColumn = 0; // 0 = left, 1 = right
        let leftColumnY = doc.y;
        let rightColumnY = doc.y;

        testData.questions.forEach((q, index) => {
          const columnX = currentColumn === 0 ? leftColumnX : rightColumnX;
          let columnY = currentColumn === 0 ? leftColumnY : rightColumnY;
          
          // Проверка на новую страницу
          if (columnY > 720) {
            if (currentColumn === 0) {
              // Переход на правую колонку
              currentColumn = 1;
              columnY = rightColumnY;
            } else {
              // Новая страница
              doc.addPage();
              currentColumn = 0;
              leftColumnY = 80;
              rightColumnY = 80;
              columnY = 80;
            }
          }

          // Номер вопроса и предмет
          doc.fontSize(11).font('Helvetica-Bold');
          let questionHeader = `${q.number}. `;
          if (q.subjectName) {
            questionHeader += `[${q.subjectName}] `;
          }
          
          doc.text(questionHeader, columnX, columnY, { 
            width: columnWidth,
            continued: false 
          });
          columnY = doc.y;

          // Текст вопроса
          doc.fontSize(11).font('Helvetica');
          const questionText = this.cleanLatex(q.question);
          doc.text(questionText, columnX, columnY, { 
            width: columnWidth,
            lineGap: 2
          });
          columnY = doc.y + 3;

          // Варианты ответов в одну строку если помещаются
          if (q.options && q.options.length > 0) {
            const optionsPerLine = this.canFitInOneLine(q.options, columnWidth) ? q.options.length : 1;
            
            for (let i = 0; i < q.options.length; i += optionsPerLine) {
              const lineOptions = q.options.slice(i, i + optionsPerLine);
              const optionTexts = lineOptions.map((option, idx) => {
                const letter = String.fromCharCode(65 + i + idx);
                const optionText = this.cleanLatex(option);
                return `${letter}) ${optionText}`;
              });
              
              doc.fontSize(11).font('Helvetica');
              doc.text(optionTexts.join('   '), columnX, columnY, {
                width: columnWidth,
                lineGap: 1
              });
              columnY = doc.y + 2;
            }
          }

          columnY += 10; // Отступ между вопросами

          // Обновляем позицию для текущей колонки
          if (currentColumn === 0) {
            leftColumnY = columnY;
            currentColumn = 1; // Следующий вопрос в правую колонку
          } else {
            rightColumnY = columnY;
            currentColumn = 0; // Следующий вопрос в левую колонку
          }
        });

        // Футер на последней странице
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).font('Helvetica').text(
            `Sahifa ${i + 1} / ${pageCount}`,
            40,
            doc.page.height - 30,
            { align: 'center', width: doc.page.width - 80 }
          );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Генерирует PDF для нескольких студентов (блок-тест)
   */
  static async generateBulkTestPDF(tests: TestData[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 40, right: 40 }
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        tests.forEach((testData, testIndex) => {
          if (testIndex > 0) {
            doc.addPage();
          }

          // Заголовок для каждого студента
          doc.fontSize(14).font('Helvetica-Bold').text(testData.title, { align: 'center' });
          doc.moveDown(0.3);

          // Информация в одну строку
          const info: string[] = [];
          if (testData.studentName) info.push(`O'quvchi: ${testData.studentName}`);
          if (testData.className) info.push(`Sinf: ${testData.className}`);
          if (testData.variantCode) info.push(`Variant: ${testData.variantCode}`);
          
          if (info.length > 0) {
            doc.fontSize(10).font('Helvetica').text(info.join(' • '), { align: 'center' });
            doc.moveDown(0.5);
          }

          // Вопросы в 2 колонки
          const pageWidth = doc.page.width - 80;
          const columnWidth = (pageWidth - 20) / 2;
          const leftColumnX = 40;
          const rightColumnX = leftColumnX + columnWidth + 20;
          
          let currentColumn = 0;
          let leftColumnY = doc.y;
          let rightColumnY = doc.y;

          testData.questions.forEach((q, qIndex) => {
            const columnX = currentColumn === 0 ? leftColumnX : rightColumnX;
            let columnY = currentColumn === 0 ? leftColumnY : rightColumnY;
            
            if (columnY > 720) {
              if (currentColumn === 0) {
                currentColumn = 1;
                columnY = rightColumnY;
              } else {
                doc.addPage();
                currentColumn = 0;
                leftColumnY = 80;
                rightColumnY = 80;
                columnY = 80;
              }
            }

            doc.fontSize(11).font('Helvetica-Bold');
            let questionHeader = `${q.number}. `;
            if (q.subjectName) {
              questionHeader += `[${q.subjectName}] `;
            }
            
            doc.text(questionHeader, columnX, columnY, { 
              width: columnWidth,
              continued: false 
            });
            columnY = doc.y;

            doc.fontSize(11).font('Helvetica');
            const questionText = this.cleanLatex(q.question);
            doc.text(questionText, columnX, columnY, { 
              width: columnWidth,
              lineGap: 2
            });
            columnY = doc.y + 3;

            if (q.options && q.options.length > 0) {
              const optionsPerLine = this.canFitInOneLine(q.options, columnWidth) ? q.options.length : 1;
              
              for (let i = 0; i < q.options.length; i += optionsPerLine) {
                const lineOptions = q.options.slice(i, i + optionsPerLine);
                const optionTexts = lineOptions.map((option, idx) => {
                  const letter = String.fromCharCode(65 + i + idx);
                  const optionText = this.cleanLatex(option);
                  return `${letter}) ${optionText}`;
                });
                
                doc.fontSize(11).font('Helvetica');
                doc.text(optionTexts.join('   '), columnX, columnY, {
                  width: columnWidth,
                  lineGap: 1
                });
                columnY = doc.y + 2;
              }
            }

            columnY += 10;

            if (currentColumn === 0) {
              leftColumnY = columnY;
              currentColumn = 1;
            } else {
              rightColumnY = columnY;
              currentColumn = 0;
            }
          });
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Проверяет, поместятся ли все варианты в одну строку
   */
  private static canFitInOneLine(options: string[], columnWidth: number): boolean {
    if (options.length > 4) return false; // Больше 4 вариантов - точно не поместятся
    
    const totalLength = options.reduce((sum, opt) => {
      const cleaned = this.cleanLatex(opt);
      return sum + cleaned.length;
    }, 0);
    
    // Примерная оценка: если общая длина меньше 60 символов, поместятся
    return totalLength < 60;
  }

  /**
   * Очищает LaTeX разметку для простого текста
   */
  private static cleanLatex(text: string): string {
    if (!text) return '';
    
    // Убираем HTML теги
    let cleaned = text
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    
    // Обрабатываем LaTeX формулы
    cleaned = cleaned
      // Display math
      .replace(/\$\$(.*?)\$\$/g, (match, formula) => this.convertLatexToUnicode(formula))
      // Inline math
      .replace(/\$(.*?)\$/g, (match, formula) => this.convertLatexToUnicode(formula))
      // Убираем оставшиеся LaTeX команды
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned;
  }

  /**
   * Конвертирует LaTeX формулы в Unicode символы
   */
  private static convertLatexToUnicode(latex: string): string {
    if (!latex) return '';
    
    let result = latex
      // Математические операции
      .replace(/\\cdot/g, '·')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\mp/g, '∓')
      
      // Сравнения
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\neq/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\equiv/g, '≡')
      
      // Греческие буквы
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\epsilon/g, 'ε')
      .replace(/\\theta/g, 'θ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\pi/g, 'π')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\phi/g, 'φ')
      .replace(/\\omega/g, 'ω')
      
      // Специальные символы
      .replace(/\\infty/g, '∞')
      .replace(/\\sum/g, 'Σ')
      .replace(/\\int/g, '∫')
      .replace(/\\partial/g, '∂')
      .replace(/\\nabla/g, '∇')
      
      // Дроби - конвертируем в формат (числитель)/(знаменатель)
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
      
      // Корни
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\sqrt\[(\d+)\]\{([^}]+)\}/g, (match, n, content) => `${n}√($content)`)
      
      // Степени и индексы
      .replace(/\^(\d+)/g, (match, n) => this.toSuperscript(n))
      .replace(/\^{([^}]+)}/g, (match, content) => `^(${content})`)
      .replace(/_(\d+)/g, (match, n) => this.toSubscript(n))
      .replace(/_{([^}]+)}/g, (match, content) => `_(${content})`)
      
      // Скобки
      .replace(/\\left\(/g, '(')
      .replace(/\\right\)/g, ')')
      .replace(/\\left\[/g, '[')
      .replace(/\\right\]/g, ']')
      .replace(/\\left\{/g, '{')
      .replace(/\\right\}/g, '}')
      
      // Текст в формулах
      .replace(/\\text\{([^}]+)\}/g, '$1')
      
      // Убираем оставшиеся команды
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .trim();
    
    return result;
  }

  /**
   * Конвертирует число в верхний индекс (superscript)
   */
  private static toSuperscript(num: string): string {
    const superscripts: { [key: string]: string } = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '-': '⁻', '+': '⁺', '=': '⁼', '(': '⁽', ')': '⁾'
    };
    return num.split('').map(c => superscripts[c] || c).join('');
  }

  /**
   * Конвертирует число в нижний индекс (subscript)
   */
  private static toSubscript(num: string): string {
    const subscripts: { [key: string]: string } = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '-': '₋', '+': '₊', '=': '₌', '(': '₍', ')': '₎'
    };
    return num.split('').map(c => subscripts[c] || c).join('');
  }

  /**
   * Регистрирует шрифты для поддержки кириллицы
   */
  private static registerFonts(doc: PDFKit.PDFDocument) {
    // PDFKit по умолчанию поддерживает базовые шрифты
    // Для полной поддержки кириллицы можно добавить кастомные шрифты
    // Пока используем стандартные Helvetica
  }
}
