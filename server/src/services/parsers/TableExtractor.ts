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
   * Paragrafdan matnni ajratish (oddiy matn + OMML formulalar)
   */
  private extractTextFromParagraph(para: any): string {
    let text = '';

    // Paragraf elementlarini tartibda ko'rib chiqish
    // XML2JS: para keys = ['w:pPr', 'w:r', 'm:oMath', ...] — tartib saqlanmaydi
    // Shuning uchun barcha elementlarni tekshiramiz
    for (const key of Object.keys(para)) {
      if (key === '$' || key === 'w:pPr') continue;

      if (key === 'w:r') {
        // Oddiy matn run'lari
        for (const run of para[key]) {
          const textElements = run['w:t'] || [];
          for (const textEl of textElements) {
            text += typeof textEl === 'string' ? textEl : (textEl._ || '');
          }
        }
      } else if (key === 'm:oMath') {
        // OMML formulalar (kimyo izotoplar, sub/superscript)
        for (const math of para[key]) {
          text += this.extractOmmlText(math);
        }
      } else if (key === 'm:oMathPara') {
        // OMML formula paragrafi
        for (const mathPara of para[key]) {
          const oMaths = mathPara['m:oMath'] || [];
          for (const math of oMaths) {
            text += this.extractOmmlText(math);
          }
        }
      }
    }

    return text.trim();
  }

  /**
   * OMML formuladan matn ajratish (sub/sup HTML taglari bilan)
   * m:sPre → ₆¹³C, m:sSub → C₆, m:sSup → C²⁺
   */
  private extractOmmlText(node: any): string {
    if (typeof node !== 'object' || node === null) return '';
    if (Array.isArray(node)) return node.map(n => this.extractOmmlText(n)).join('');

    let text = '';
    for (const key of Object.keys(node)) {
      if (key === '$' || key === 'w:rPr' || key === 'm:rPr' || key === 'm:ctrlPr'
        || key === 'm:sPrePr' || key === 'm:sSubPr' || key === 'm:sSupPr'
        || key === 'm:sSubSupPr' || key === 'm:fPr' || key === 'm:dPr'
        || key === 'm:naryPr') continue;

      const items = Array.isArray(node[key]) ? node[key] : [node[key]];

      if (key === 'm:t') {
        // Formula matn
        for (const t of items) {
          text += typeof t === 'string' ? t : (t._ || '');
        }
      } else if (key === 'm:r') {
        // Formula run (m:t ichida)
        for (const run of items) {
          const tElements = run['m:t'] || [];
          for (const t of tElements) {
            text += typeof t === 'string' ? t : (t._ || '');
          }
        }
      } else if (key === 'm:sPre') {
        // Pre-sub/superscript: ₆¹³C
        for (const spre of items) {
          const sub = this.extractOmmlText(spre['m:sub'] || []);
          const sup = this.extractOmmlText(spre['m:sup'] || []);
          const base = this.extractOmmlText(spre['m:e'] || []);
          text += `<sub>${sub}</sub><sup>${sup}</sup>${base}`;
        }
      } else if (key === 'm:sSub') {
        // Subscript: H₂O
        for (const ssub of items) {
          const base = this.extractOmmlText(ssub['m:e'] || []);
          const sub = this.extractOmmlText(ssub['m:sub'] || []);
          text += `${base}<sub>${sub}</sub>`;
        }
      } else if (key === 'm:sSup') {
        // Superscript: Ca²⁺
        for (const ssup of items) {
          const base = this.extractOmmlText(ssup['m:e'] || []);
          const sup = this.extractOmmlText(ssup['m:sup'] || []);
          text += `${base}<sup>${sup}</sup>`;
        }
      } else if (key === 'm:sSubSup') {
        // Sub+Superscript combined
        for (const sss of items) {
          const base = this.extractOmmlText(sss['m:e'] || []);
          const sub = this.extractOmmlText(sss['m:sub'] || []);
          const sup = this.extractOmmlText(sss['m:sup'] || []);
          text += `${base}<sub>${sub}</sub><sup>${sup}</sup>`;
        }
      } else if (key === 'm:d') {
        // Delimiter (qavslar): (content)
        for (const d of items) {
          text += '(' + this.extractOmmlText(d['m:e'] || []) + ')';
        }
      } else if (key === 'm:f') {
        // Fraction: numerator/denominator
        for (const f of items) {
          const num = this.extractOmmlText(f['m:num'] || []);
          const den = this.extractOmmlText(f['m:den'] || []);
          text += `${num}/${den}`;
        }
      } else if (key === 'm:e') {
        // Base element
        text += this.extractOmmlText(node[key]);
      } else {
        // Recurse into other elements
        text += this.extractOmmlText(node[key]);
      }
    }

    return text;
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
   * HTML escape (sub/sup taglarni saqlaydi)
   */
  private escapeHtml(text: string): string {
    // sub/sup taglarni vaqtincha saqlash
    const preserved: string[] = [];
    let safe = text.replace(/<\/?(sub|sup)>/g, (m) => {
      preserved.push(m);
      return `\x00${preserved.length - 1}\x00`;
    });
    safe = safe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
    // sub/sup taglarni qaytarish
    safe = safe.replace(/\x00(\d+)\x00/g, (_, i) => preserved[parseInt(i)]);
    return safe;
  }
}
