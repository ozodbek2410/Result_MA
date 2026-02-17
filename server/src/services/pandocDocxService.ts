import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';

const execAsync = promisify(exec);

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
  // Настройки форматирования
  settings?: {
    fontSize?: number;
    fontFamily?: string;
    lineHeight?: number;
    columnsCount?: number;
    backgroundOpacity?: number;
    backgroundImage?: string; // base64 или путь
  };
}

export class PandocDocxService {
  private static readonly TEMP_DIR = path.join(process.cwd(), 'temp');
  private static readonly REFERENCE_DOCX = path.join(process.cwd(), 'templates', 'reference.docx');

  /**
   * Генерирует Word документ через Pandoc с заданными параметрами верстки
   */
  static async generateDocx(testData: TestData): Promise<Buffer> {
    await fs.mkdir(this.TEMP_DIR, { recursive: true });

    const tempId = uuidv4();
    const markdownPath = path.join(this.TEMP_DIR, `${tempId}.md`);
    const docxPath = path.join(this.TEMP_DIR, `${tempId}.docx`);

    try {
      // Генерируем Markdown с LaTeX формулами
      const markdown = this.generateMarkdown(testData);
      await fs.writeFile(markdownPath, markdown, 'utf-8');

      // Проверяем наличие reference.docx
      const hasReference = await fs.access(this.REFERENCE_DOCX).then(() => true).catch(() => false);
      
      // Конвертируем через Pandoc с reference.docx (watermark уже внутри)
      const pandocCmd = hasReference
        ? `pandoc "${markdownPath}" -o "${docxPath}" --from markdown --to docx --reference-doc="${this.REFERENCE_DOCX}"`
        : `pandoc "${markdownPath}" -o "${docxPath}" --from markdown --to docx`;
      
      console.log('🔄 Running Pandoc:', pandocCmd);
      await execAsync(pandocCmd);

      // Читаем готовый файл
      let buffer = await fs.readFile(docxPath);

      // Применяем пользовательские настройки если есть
      if (testData.settings) {
        buffer = await this.applyCustomSettings(buffer as Buffer, testData.settings);
      }

      // Удаляем временные файлы
      await fs.unlink(markdownPath).catch(() => {});
      await fs.unlink(docxPath).catch(() => {});

      console.log('✅ Pandoc generated DOCX successfully');
      return buffer;

    } catch (error: any) {
      console.error('❌ Pandoc error:', error);
      
      // Очистка при ошибке
      await fs.unlink(markdownPath).catch(() => {});
      await fs.unlink(docxPath).catch(() => {});
      
      throw new Error(`Pandoc conversion failed: ${error.message}`);
    }
  }

  /**
   * Применяет пользовательские настройки к DOCX файлу
   */
  private static async applyCustomSettings(
    docxBuffer: Buffer,
    settings: NonNullable<TestData['settings']>
  ): Promise<Buffer> {
    const zip = await JSZip.loadAsync(docxBuffer as any);

    // Обновляем styles.xml для изменения шрифта и размера
    const stylesFile = zip.file('word/styles.xml');
    if (stylesFile && (settings.fontSize || settings.fontFamily || settings.lineHeight)) {
      let stylesXml = await stylesFile.async('text');
      
      // Изменяем базовый стиль Normal
      if (settings.fontSize) {
        const fontSizeHalfPt = settings.fontSize * 2; // Word использует half-points
        stylesXml = stylesXml.replace(
          /<w:sz w:val="\d+"/g,
          `<w:sz w:val="${fontSizeHalfPt}"`
        );
        stylesXml = stylesXml.replace(
          /<w:szCs w:val="\d+"/g,
          `<w:szCs w:val="${fontSizeHalfPt}"`
        );
      }
      
      if (settings.fontFamily) {
        stylesXml = stylesXml.replace(
          /<w:rFonts[^>]*>/g,
          `<w:rFonts w:ascii="${settings.fontFamily}" w:hAnsi="${settings.fontFamily}" w:cs="${settings.fontFamily}"/>`
        );
      }
      
      if (settings.lineHeight) {
        const lineSpacing = Math.round(settings.lineHeight * 240); // Word line spacing units
        stylesXml = stylesXml.replace(
          /<w:spacing[^>]*>/g,
          `<w:spacing w:line="${lineSpacing}" w:lineRule="auto"/>`
        );
      }
      
      zip.file('word/styles.xml', stylesXml);
      console.log('✅ Applied font settings:', settings.fontSize, settings.fontFamily, settings.lineHeight);
    }

    // Обновляем watermark opacity если нужно
    if (settings.backgroundOpacity !== undefined) {
      const headerFile = zip.file('word/header1.xml');
      if (headerFile) {
        let headerXml = await headerFile.async('text');
        
        // Конвертируем opacity (0-1) в Word format (0-100000)
        const wordOpacity = Math.round(settings.backgroundOpacity * 100000);
        
        // Обновляем alphaModFix
        headerXml = headerXml.replace(
          /<a:alphaModFix amt="\d+"/g,
          `<a:alphaModFix amt="${wordOpacity}"`
        );
        
        zip.file('word/header1.xml', headerXml);
        console.log('✅ Applied watermark opacity:', settings.backgroundOpacity);
      }
    }

    // Если есть кастомное изображение watermark
    if (settings.backgroundImage && settings.backgroundImage.startsWith('data:image')) {
      try {
        // Извлекаем base64 данные
        const base64Data = settings.backgroundImage.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Заменяем watermark.png
        zip.file('word/media/watermark.png', imageBuffer);
        console.log('✅ Applied custom watermark image');
      } catch (error) {
        console.warn('⚠️ Failed to apply custom watermark:', error);
      }
    }

    // Генерируем обновленный DOCX
    const updatedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    return updatedBuffer;
  }

  /**
   * Генерирует Markdown с LaTeX формулами
   */
  private static generateMarkdown(testData: TestData): string {
    let md = '';

    // Если есть несколько студентов - генерируем для каждого
    if (testData.students && testData.students.length > 0) {
      testData.students.forEach((student, index) => {
        if (index > 0) {
          md += '\n\\newpage\n\n'; // Разрыв страницы между студентами
        }

        // Заголовок для студента
        md += `# ${student.studentName}\n\n`;
        md += `**Variant: ${student.variantCode}**`;
        
        if (testData.className) {
          md += ` • **${testData.className}**`;
        }
        
        md += '\n\n---\n\n';

        // Вопросы студента
        student.questions.forEach(q => {
          const header = `**${q.number}.**`;
          md += `${header} ${q.text}\n\n`;

          if (q.options && q.options.length > 0) {
            const optionsLine = q.options
              .map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                return `**${letter})** ${opt}`;
              })
              .join('   ');
            
            md += `${optionsLine}\n\n`;
          }
        });
      });

      return md;
    }

    // Старый формат - один тест без студентов
    md += `# ${testData.title}\n\n`;

    if (testData.className) {
      md += `**Sinf: ${testData.className}**\n\n`;
    }

    md += '---\n\n';

    testData.questions.forEach(q => {
      const header = `**${q.number}.**`;
      md += `${header} `;
      md += `${q.text}\n\n`;

      if (q.options && q.options.length > 0) {
        const optionsLine = q.options
          .map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            return `**${letter})** ${opt}`;
          })
          .join('   ');
        
        md += `${optionsLine}\n\n`;
      }
    });

    return md;
  }

  /**
   * Очистка старых временных файлов (вызывать периодически)
   */
  static async cleanupTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.TEMP_DIR);
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 час

      for (const file of files) {
        const filePath = path.join(this.TEMP_DIR, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          console.log(`🗑️ Cleaned up old temp file: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }
}
