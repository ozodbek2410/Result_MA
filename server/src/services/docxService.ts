import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, ImageRun, Header, Footer, convertInchesToTwip } from 'docx';
import fs from 'fs/promises';
import path from 'path';

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
  students?: StudentTest[];
}

export class DocxService {
  private static readonly LOGO_PATH = path.join(process.cwd(), '..', 'client', 'public', 'logo.png');

  /**
   * Генерирует Word документ с фоновым изображением
   */
  static async generateDocx(testData: TestData): Promise<Buffer> {
    try {
      // Читаем логотип
      const hasLogo = await fs.access(this.LOGO_PATH).then(() => true).catch(() => false);
      let logoBuffer: Buffer | undefined;
      
      if (hasLogo) {
        logoBuffer = await fs.readFile(this.LOGO_PATH);
        console.log('✅ Logo loaded for watermark');
      } else {
        console.warn('⚠️ Logo not found, generating without watermark');
      }

      // Создаем секции документа
      const sections = [];

      if (testData.students && testData.students.length > 0) {
        // Множественные студенты
        for (const student of testData.students) {
          const section = await this.createSection(
            student.studentName,
            student.variantCode,
            testData.className,
            testData.subjectName,
            student.questions,
            logoBuffer
          );
          sections.push(section);
        }
      } else {
        // Один тест
        const section = await this.createSection(
          testData.title,
          testData.variantCode,
          testData.className,
          testData.subjectName,
          testData.questions,
          logoBuffer
        );
        sections.push(section);
      }

      // Создаем документ
      const doc = new Document({
        sections
      });

      // Генерируем буфер
      const buffer = await Packer.toBuffer(doc);
      console.log('✅ DOCX generated successfully with docx.js');
      
      return buffer;
    } catch (error: any) {
      console.error('❌ Error generating DOCX:', error);
      throw new Error(`DOCX generation failed: ${error.message}`);
    }
  }

  /**
   * Создает секцию документа (страницу) с водяным знаком
   */
  private static async createSection(
    title: string,
    variantCode: string | undefined,
    className: string | undefined,
    subjectName: string | undefined,
    questions: Question[],
    logoBuffer: Buffer | undefined
  ) {
    const children: Paragraph[] = [];

    // Заголовок
    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      })
    );

    // Информация
    const info = [
      variantCode ? `Variant: ${variantCode}` : '',
      className
    ].filter(Boolean).join(' • ');

    if (info) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: info,
              bold: true,
              size: 20
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        })
      );
    }

    // Разделитель
    children.push(
      new Paragraph({
        text: '_______________________________________________________________________________',
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      })
    );

    // Вопросы
    for (const q of questions) {
      // Номер и текст вопроса
      const questionRuns: TextRun[] = [
        new TextRun({
          text: `${q.number}. `,
          bold: true,
          size: 22
        }),
        new TextRun({
          text: q.text,
          size: 22
        })
      ];

      children.push(
        new Paragraph({
          children: questionRuns,
          spacing: { after: 100 }
        })
      );

      // Варианты ответов
      if (q.options && q.options.length > 0) {
        const optionsText = q.options
          .map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            return `${letter}) ${opt}`;
          })
          .join('   ');

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: optionsText,
                size: 22
              })
            ],
            indent: { left: convertInchesToTwip(0.5) },
            spacing: { after: 150 }
          })
        );
      }
    }

    // Создаем header с водяным знаком
    let headers: { default?: Header } | undefined;

    if (logoBuffer) {
      try {
        headers = {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    type: 'png',
                    data: logoBuffer,
                    transformation: {
                      width: 300,
                      height: 300,
                    },
                  } as any),
                ],
              }),
            ],
          }),
        };
      } catch (error) {
        console.warn('⚠️ Failed to create header with image:', error);
      }
    }

    return {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.5),
            right: convertInchesToTwip(0.5),
            bottom: convertInchesToTwip(0.5),
            left: convertInchesToTwip(0.5),
          },
        },
        column: {
          count: 2,
          space: convertInchesToTwip(0.5),
        },
      },
      headers,
      children,
    };
  }

  /**
   * Парсит LaTeX формулы из текста (упрощенная версия)
   */
  private static parseLatex(text: string): string {
    // Убираем LaTeX разметку для простого текста
    // В будущем можно добавить конвертацию в OMML (Office Math Markup Language)
    return text.replace(/\$\$?(.*?)\$\$?/g, '$1');
  }
}
