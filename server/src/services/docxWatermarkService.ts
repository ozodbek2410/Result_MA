import { Document, Packer, Paragraph, ImageRun, AlignmentType } from 'docx';
import fs from 'fs/promises';
import path from 'path';

export class DocxWatermarkService {
  /**
   * Добавляет водяной знак (фоновое изображение) в существующий DOCX
   * Примечание: Это упрощенная реализация. Для полноценного водяного знака
   * нужно работать с XML структурой Word напрямую.
   */
  static async addWatermark(docxBuffer: Buffer, imagePath: string): Promise<Buffer> {
    try {
      // Для добавления водяного знака в существующий документ нужно:
      // 1. Распаковать DOCX (это ZIP архив)
      // 2. Изменить document.xml и добавить водяной знак
      // 3. Запаковать обратно
      
      // Это сложная задача, требующая работы с Open XML
      // Проще всего - использовать reference.docx с уже настроенным водяным знаком
      
      console.log('⚠️ Watermark in Word requires manual reference.docx configuration');
      return docxBuffer;
    } catch (error) {
      console.error('❌ Error adding watermark:', error);
      return docxBuffer;
    }
  }

  /**
   * Создает reference.docx с водяным знаком
   * Это нужно запустить один раз для настройки шаблона
   */
  static async createReferenceWithWatermark(outputPath: string, logoPath: string): Promise<void> {
    try {
      // Читаем изображение
      const imageBuffer = await fs.readFile(logoPath);

      // Создаем документ с фоновым изображением
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              // Настройки страницы A4
            }
          },
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 400,
                    height: 400,
                  },
                  floating: {
                    horizontalPosition: {
                      align: AlignmentType.CENTER,
                    },
                    verticalPosition: {
                      align: AlignmentType.CENTER,
                    },
                    behindDocument: true, // Размещаем за текстом
                    allowOverlap: true,
                  },
                }),
              ],
            }),
          ],
        }],
      });

      // Сохраняем
      const buffer = await Packer.toBuffer(doc);
      await fs.writeFile(outputPath, buffer);
      
      console.log('✅ Reference DOCX with watermark created:', outputPath);
    } catch (error) {
      console.error('❌ Error creating reference:', error);
      throw error;
    }
  }
}
