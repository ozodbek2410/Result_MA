import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';

export interface TableCell {
  text: string;
  rowSpan?: number;
  colSpan?: number;
}

export interface TableRow {
  cells: TableCell[];
}

export interface ExtractedTable {
  id: string;
  rows: TableRow[];
  html: string;
}

/**
 * 📊 TABLE EXTRACTOR
 * DOCX fayldan jadvallarni ajratib oladi va HTML ga konvert qiladi
 */
export class TableExtractor {
  /**
   * DOCX dan barcha jadvallarni ajratish
   */
  async extractTables(docxPath: string): Promise<ExtractedTable[]> {
    try {
      console.log('📊 [TABLE] Extracting tables from DOCX...');
      
      const zip = new AdmZip(docxPath);
      const documentXml = zip.readAsText('word/document.xml');
      
      if (!documentXml) {
        console.log('⚠️ [TABLE] No document.xml found');
        return [];
      }
      
      // XML ni parse qilish
      const parsed = await parseStringPromise(documentXml);
      const body = parsed['w:document']?.['w:body']?.[0];
      
      if (!body) {
        console.log('⚠️ [TABLE] No body found in document');
        return [];
      }
      
      // Jadvallarni topish
      const tables = this.findTables(body);
      
      console.log(`✅ [TABLE] Found ${tables.length} tables`);
      
      return tables;
    } catch (error) {
      console.error('❌ [TABLE] Error extracting tables:', error);
      return [];
    }
  }

  /**
   * XML body dan jadvallarni topish
   */
  private findTables(body: any): ExtractedTable[] {
    const tables: ExtractedTable[] = [];
    let tableIndex = 0;
    
    // Body ichidagi barcha elementlarni ko'rib chiqish
    for (const key in body) {
      if (key === 'w:tbl') {
        // Jadval topildi
        const tableTags = body[key];
        
        for (const tableTag of tableTags) {
          const table = this.parseTable(tableTag, tableIndex);
          if (table) {
            tables.push(table);
            tableIndex++;
          }
        }
      }
    }
    
    return tables;
  }

  /**
   * Bitta jadvalni parse qilish
   */
  private parseTable(tableTag: any, index: number): ExtractedTable | null {
    try {
      const rows: TableRow[] = [];
      
      // Jadval qatorlarini topish (w:tr)
      const tableRows = tableTag['w:tr'] || [];
      
      for (const rowTag of tableRows) {
        const row = this.parseRow(rowTag);
        if (row) {
          rows.push(row);
        }
      }
      
      if (rows.length === 0) {
        return null;
      }
      
      const html = this.convertToHtml(rows);
      
      return {
        id: `table${index + 1}`,
        rows,
        html,
      };
    } catch (error) {
      console.error('❌ [TABLE] Error parsing table:', error);
      return null;
    }
  }

  /**
   * Jadval qatorini parse qilish
   */
  private parseRow(rowTag: any): TableRow | null {
    try {
      const cells: TableCell[] = [];
      
      // Qator katakchalarini topish (w:tc)
      const cellTags = rowTag['w:tc'] || [];
      
      for (const cellTag of cellTags) {
        const cell = this.parseCell(cellTag);
        if (cell) {
          cells.push(cell);
        }
      }
      
      return { cells };
    } catch (error) {
      console.error('❌ [TABLE] Error parsing row:', error);
      return null;
    }
  }

  /**
   * Jadval katakchani parse qilish
   */
  private parseCell(cellTag: any): TableCell | null {
    try {
      let text = '';
      
      // Katakcha ichidagi paragraflarni topish (w:p)
      const paragraphs = cellTag['w:p'] || [];
      
      for (const para of paragraphs) {
        const paraText = this.extractTextFromParagraph(para);
        if (paraText) {
          text += (text ? '\n' : '') + paraText;
        }
      }
      
      // Merge info (rowSpan, colSpan)
      const tcPr = cellTag['w:tcPr']?.[0];
      const gridSpan = tcPr?.['w:gridSpan']?.[0]?.['$']?.['w:val'];
      const vMerge = tcPr?.['w:vMerge']?.[0];
      
      return {
        text: text.trim(),
        colSpan: gridSpan ? parseInt(gridSpan) : undefined,
        rowSpan: vMerge ? 2 : undefined, // Simplified
      };
    } catch (error) {
      console.error('❌ [TABLE] Error parsing cell:', error);
      return null;
    }
  }

  /**
   * Paragrafdan matnni ajratish (oddiy matn, formatsiz)
   */
  private extractTextFromParagraph(para: any): string {
    let text = '';
    
    // Paragraf ichidagi run'larni topish (w:r)
    const runs = para['w:r'] || [];
    
    for (const run of runs) {
      // Text elementi (w:t)
      const textElements = run['w:t'] || [];
      
      for (const textEl of textElements) {
        if (typeof textEl === 'string') {
          text += textEl;
        } else if (textEl._) {
          text += textEl._;
        }
      }
    }
    
    return text.trim();
  }

  /**
   * Jadval strukturasini HTML ga konvert qilish
   */
  private convertToHtml(rows: TableRow[]): string {
    let html = '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px;">\n';
    
    for (const row of rows) {
      html += '  <tr>\n';
      
      for (const cell of row.cells) {
        const colspan = cell.colSpan ? ` colspan="${cell.colSpan}"` : '';
        const rowspan = cell.rowSpan ? ` rowspan="${cell.rowSpan}"` : '';
        
        html += `    <td${colspan}${rowspan} style="border: 1px solid #000; padding: 8px;">${this.escapeHtml(cell.text)}</td>\n`;
      }
      
      html += '  </tr>\n';
    }
    
    html += '</table>';
    
    return html;
  }

  /**
   * HTML escape
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }
}
