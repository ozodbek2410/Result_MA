import { chromium } from 'playwright';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * 🎨 TABLE RENDERER
 * HTML jadvallarni PNG rasm sifatida render qiladi
 */
export class TableRenderer {
  private uploadDir: string;

  constructor() {
    // __dirname: server/dist/services/parsers → go up 3 levels to server/, then into uploads
    this.uploadDir = path.join(__dirname, '../../../uploads', 'test-images');
    
    // Upload papkani yaratish
    if (!fsSync.existsSync(this.uploadDir)) {
      fsSync.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * HTML jadvalni PNG ga konvert qilish
   */
  async renderTableAsImage(tableHtml: string, tableId: string): Promise<string> {
    let browser;
    
    try {
      console.log(`🎨 [RENDERER] Rendering ${tableId} as PNG...`);
      
      // Browser ochish
      browser = await chromium.launch({
        headless: true,
      });
      
      const page = await browser.newPage();
      
      // HTML shablon
      const fullHtml = this.createHtmlTemplate(tableHtml);
      
      // HTML ni yuklash
      await page.setContent(fullHtml, { waitUntil: 'networkidle' });
      
      // Jadval elementini topish
      const tableElement = await page.$('table');
      
      if (!tableElement) {
        throw new Error('Table element not found in HTML');
      }
      
      // Screenshot olish
      const screenshot = await tableElement.screenshot({
        type: 'png',
        omitBackground: false,
      });
      
      // Fayl nomi
      const fileName = `table-${uuidv4()}.png`;
      const savePath = path.join(this.uploadDir, fileName);
      
      // Saqlash
      await fs.writeFile(savePath, screenshot);
      
      const imageUrl = `/uploads/test-images/${fileName}`;
      
      console.log(`✅ [RENDERER] Saved ${tableId} → ${imageUrl}`);
      
      return imageUrl;
    } catch (error) {
      console.error(`❌ [RENDERER] Error rendering ${tableId}:`, error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Bir nechta jadvallarni parallel render qilish
   */
  async renderMultipleTables(
    tables: Array<{ id: string; html: string }>
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    console.log(`🎨 [RENDERER] Rendering ${tables.length} tables...`);
    
    // Har bir jadvalni render qilish
    for (const table of tables) {
      try {
        const imageUrl = await this.renderTableAsImage(table.html, table.id);
        results.set(table.id, imageUrl);
      } catch (error) {
        console.error(`❌ [RENDERER] Failed to render ${table.id}:`, error);
      }
    }
    
    console.log(`✅ [RENDERER] Rendered ${results.size}/${tables.length} tables`);
    
    return results;
  }

  /**
   * HTML shablon yaratish
   */
  private createHtmlTemplate(tableHtml: string): string {
    return `
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', 'Segoe UI', sans-serif;
      background: white;
      padding: 20px;
      display: inline-block;
    }
    
    table {
      border-collapse: collapse;
      background: white;
      font-size: 14px;
      line-height: 1.5;
      min-width: 200px;
      max-width: 800px;
    }
    
    td, th {
      border: 1px solid #333;
      padding: 8px 12px;
      text-align: left;
      vertical-align: top;
      
      /* CRITICAL: Matn o'ralishi uchun */
      white-space: normal;
      word-wrap: break-word;
      word-break: break-word;
      overflow-wrap: break-word;
      max-width: 400px;
    }
    
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    
    /* O'zbek va rus harflari uchun */
    td, th {
      font-family: 'Arial', 'Times New Roman', sans-serif;
    }
    
    /* Raqamlar uchun */
    td:has(> :only-child:is(number)) {
      text-align: right;
    }
  </style>
</head>
<body>
  ${tableHtml}
</body>
</html>
    `.trim();
  }

  /**
   * Test uchun - jadval preview HTML yaratish
   */
  async createPreviewHtml(tableHtml: string, outputPath: string): Promise<void> {
    const html = this.createHtmlTemplate(tableHtml);
    await fs.writeFile(outputPath, html, 'utf-8');
    console.log(`✅ [RENDERER] Preview saved to ${outputPath}`);
  }
}
