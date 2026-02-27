import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  SectionType,
  convertInchesToTwip,
  HeadingLevel
} from 'docx';
import fs from 'fs/promises';
import path from 'path';

/**
 * Создает reference.docx с нужными параметрами верстки:
 * - Шрифт: Cambria 11
 * - Колонки: 2
 * - Интервал: 1 (240 twips)
 * - Отступы после: 0
 * - Поля: 1.27 см (0.5 дюйма)
 */
async function createReferenceDocx() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Cambria',
            size: 22
          },
          paragraph: {
            spacing: {
              after: 0,
              line: 240
            }
          }
        }
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            font: 'Cambria',
            size: 22
          },
          paragraph: {
            spacing: {
              after: 0,
              line: 240
            }
          }
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            font: 'Cambria',
            size: 22,
            bold: true
          },
          paragraph: {
            spacing: {
              after: 0,
              line: 240
            },
            alignment: AlignmentType.CENTER
          }
        }
      ]
    },
    sections: [{
      properties: {
        type: SectionType.CONTINUOUS,
        column: {
          space: convertInchesToTwip(0.5),
          count: 2,
          separate: false
        },
        page: {
          margin: {
            top: convertInchesToTwip(0.5),
            right: convertInchesToTwip(0.5),
            bottom: convertInchesToTwip(0.5),
            left: convertInchesToTwip(0.5)
          }
        }
      },
      children: [
        // Заголовок H1
        new Paragraph({
          children: [
            new TextRun({
              text: 'Заголовок теста',
              font: 'Cambria',
              size: 22,
              bold: true
            })
          ],
          spacing: { after: 0, line: 240 },
          alignment: AlignmentType.CENTER
        }),
        
        // Обычный текст
        new Paragraph({
          children: [
            new TextRun({ 
              text: 'Пример текста с формулой: ',
              font: 'Cambria',
              size: 22
            })
          ],
          spacing: { after: 0, line: 240 }
        }),
        
        // Пример вопроса
        new Paragraph({
          children: [
            new TextRun({ 
              text: '1. Текст вопроса',
              font: 'Cambria',
              size: 22
            })
          ],
          spacing: { after: 0, line: 240 }
        }),
        
        // Варианты ответов
        new Paragraph({
          children: [
            new TextRun({ 
              text: 'A) Вариант 1   B) Вариант 2   C) Вариант 3   D) Вариант 4',
              font: 'Cambria',
              size: 22
            })
          ],
          spacing: { after: 0, line: 240 }
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  
  const templatesDir = path.join(process.cwd(), 'templates');
  await fs.mkdir(templatesDir, { recursive: true });
  
  const outputPath = path.join(templatesDir, 'reference.docx');
  await fs.writeFile(outputPath, buffer);
  
  console.log('✅ Reference DOCX created:', outputPath);
}

createReferenceDocx().catch(console.error);
