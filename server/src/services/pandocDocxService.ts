import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
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
  /**
   * Find logo file path
   */
  private static async findLogoPath(): Promise<string | null> {
    const candidates = [
      path.join(process.cwd(), '..', 'client', 'public', 'logo.png'),
      path.join(process.cwd(), 'client', 'public', 'logo.png'),
      path.join(__dirname, '../../..', 'client/public/logo.png'),
    ];
    for (const p of candidates) {
      const exists = await fs.access(p).then(() => true).catch(() => false);
      if (exists) return p;
    }
    return null;
  }

  static async generateDocx(testData: TestData): Promise<Buffer> {
    await fs.mkdir(this.TEMP_DIR, { recursive: true });

    const tempId = uuidv4();
    const markdownPath = path.join(this.TEMP_DIR, `${tempId}.md`);
    const docxPath = path.join(this.TEMP_DIR, `${tempId}.docx`);

    try {
      const markdown = this.generateMarkdown(testData);
      await fs.writeFile(markdownPath, markdown, 'utf-8');

      // Проверяем наличие reference.docx
      const hasReference = await fs.access(this.REFERENCE_DOCX).then(() => true).catch(() => false);
      
      // Конвертируем через Pandoc с reference.docx (watermark уже внутри)
      const fromFmt = 'markdown+raw_html+raw_tex+pipe_tables+implicit_figures+link_attributes';
      const pandocCmd = hasReference
        ? `pandoc "${markdownPath}" -o "${docxPath}" --from ${fromFmt} --to docx --columns=200 --reference-doc="${this.REFERENCE_DOCX}"`
        : `pandoc "${markdownPath}" -o "${docxPath}" --from ${fromFmt} --to docx --columns=200`;
      
      console.log('🔄 Running Pandoc:', pandocCmd);
      console.log('📝 Markdown preview (first 500 chars):', markdown.substring(0, 500));
      await execAsync(pandocCmd);

      // Читаем готовый файл
      let buffer: Buffer = await fs.readFile(docxPath) as Buffer;

      // Always apply post-processing (header injection + custom settings)
      buffer = await this.applyCustomSettings(buffer, testData.settings || {});

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

    // Inject watermark logo into header (works without reference.docx)
    await this.injectWatermarkHeader(zip, settings.backgroundOpacity ?? 0.08);

    // Inject academy header table before each student's heading
    try {
      const docFile = zip.file('word/document.xml');
      if (docFile) {
        let docXml = await docFile.async('text');

        // Add logo image to media and create relationship
        let logoRelId: string | null = null;
        const logoPath = await this.findLogoPath();
        if (logoPath) {
          const logoBuffer = fsSync.readFileSync(logoPath);
          zip.file('word/media/academy_logo.png', logoBuffer);

          // Add relationship in word/_rels/document.xml.rels
          const relsFile = zip.file('word/_rels/document.xml.rels');
          if (relsFile) {
            let relsXml = await relsFile.async('text');
            logoRelId = 'rIdAcademyLogo';
            if (!relsXml.includes(logoRelId)) {
              relsXml = relsXml.replace(
                '</Relationships>',
                `<Relationship Id="${logoRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/academy_logo.png"/></Relationships>`
              );
              zip.file('word/_rels/document.xml.rels', relsXml);
            }
          }
        }

        // Ensure required namespaces exist in root element for drawing support
        if (logoRelId) {
          const nsToAdd = [
            ['xmlns:wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'],
            ['xmlns:a', 'http://schemas.openxmlformats.org/drawingml/2006/main'],
            ['xmlns:pic', 'http://schemas.openxmlformats.org/drawingml/2006/picture'],
          ];
          for (const [attr, uri] of nsToAdd) {
            if (!docXml.includes(attr)) {
              docXml = docXml.replace('<w:document ', `<w:document ${attr}="${uri}" `);
            }
          }
        }

        const headerXml = this.generateHeaderXml(logoRelId);

        // Section break paragraphs for column control
        // startBreak: ends whatever came before (2-col), then header starts a new section
        const startBreak = `<w:p><w:pPr><w:sectPr><w:cols w:num="2" w:equalWidth="1" w:space="720"/><w:type w:val="continuous"/></w:sectPr></w:pPr></w:p>`;
        // endBreak: ends the header's 1-col section, questions continue in 2-col (from final body sectPr)
        const endBreak = `<w:p><w:pPr><w:sectPr><w:cols w:num="1" w:equalWidth="1"/><w:type w:val="continuous"/></w:sectPr></w:pPr></w:p>`;

        // Match full Heading1 paragraph (student name) and wrap with section breaks
        docXml = docXml.replace(
          /(<w:p(?:\s[^>]*)?>)(<w:pPr>)(<w:pStyle w:val="Heading1"\s*\/>)([\s\S]*?)(<\/w:p>)/g,
          `${startBreak}${headerXml}$1$2$3$4$5${endBreak}`
        );

        // Ensure final body sectPr has 2-column layout for questions section
        const lastSectPrIdx = docXml.lastIndexOf('<w:sectPr');
        if (lastSectPrIdx !== -1) {
          const closingTagIdx = docXml.indexOf('</w:sectPr>', lastSectPrIdx);
          const sectContent = docXml.substring(lastSectPrIdx, closingTagIdx);
          if (!sectContent.includes('<w:cols')) {
            const insertPos = docXml.indexOf('>', lastSectPrIdx) + 1;
            docXml = docXml.substring(0, insertPos) +
              '<w:cols w:num="2" w:equalWidth="1" w:space="720"/>' +
              docXml.substring(insertPos);
          }
        }

        zip.file('word/document.xml', docXml);
        console.log('✅ Injected academy header into Word document');
      }
    } catch (err) {
      console.warn('⚠️ Failed to inject academy header:', err);
    }

    // Генерируем обновленный DOCX
    const updatedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    return updatedBuffer;
  }

  /**
   * Inject watermark logo into Word header so it appears on every page behind text.
   */
  private static async injectWatermarkHeader(zip: JSZip, opacity: number): Promise<void> {
    const logoPath = await this.findLogoPath();
    if (!logoPath) return;

    const logoBuffer = fsSync.readFileSync(logoPath);
    zip.file('word/media/watermark.png', logoBuffer);

    // Word opacity: 0-100000 scale
    const wordOpacity = Math.round(opacity * 100000);

    // Create or replace header1.xml with watermark image
    const header1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:r>
      <w:drawing>
        <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0"
                   relativeHeight="0" behindDoc="1" locked="1"
                   layoutInCell="1" allowOverlap="1">
          <wp:simplePos x="0" y="0"/>
          <wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH>
          <wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV>
          <wp:extent cx="3600000" cy="3600000"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:wrapNone/>
          <wp:docPr id="99" name="Watermark"/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="99" name="watermark.png"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rIdWatermark">
                    <a:alphaModFix amt="${wordOpacity}"/>
                  </a:blip>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="3600000" cy="3600000"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:anchor>
      </w:drawing>
    </w:r>
  </w:p>
</w:hdr>`;
    zip.file('word/header1.xml', header1Xml);

    // Header rels — link watermark image
    const headerRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdWatermark" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/watermark.png"/>
</Relationships>`;
    zip.file('word/_rels/header1.xml.rels', headerRels);

    // Add header relationship to document.xml.rels
    const docRelsFile = zip.file('word/_rels/document.xml.rels');
    if (docRelsFile) {
      let relsXml = await docRelsFile.async('text');
      const headerRelId = 'rIdHeader1';
      if (!relsXml.includes(headerRelId)) {
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${headerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`
        );
        zip.file('word/_rels/document.xml.rels', relsXml);
      }
    }

    // Reference header in document.xml section properties
    const docFile = zip.file('word/document.xml');
    if (docFile) {
      let docXml = await docFile.async('text');
      if (!docXml.includes('w:headerReference')) {
        if (docXml.includes('<w:sectPr')) {
          docXml = docXml.replace(
            /<w:sectPr([^>]*)>/,
            `<w:sectPr$1><w:headerReference w:type="default" r:id="rIdHeader1"/>`
          );
        } else {
          docXml = docXml.replace(
            '</w:body>',
            `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/></w:sectPr></w:body>`
          );
        }
        zip.file('word/document.xml', docXml);
      }
    }

    // Update [Content_Types].xml
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      let ctXml = await ctFile.async('text');
      if (!ctXml.includes('header1.xml')) {
        ctXml = ctXml.replace(
          '</Types>',
          `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`
        );
        zip.file('[Content_Types].xml', ctXml);
      }
    }
  }

  /**
   * Generate Word XML for academy header table with logo, name, slogan.
   * Injected via JSZip post-processing (Pandoc can't handle HTML tables in DOCX).
   */
  private static generateHeaderXml(logoRelId: string | null): string {
    // 3-column table: logo | MATH ACADEMY | slogan + phone
    const logoCell = logoRelId
      ? `<w:tc>
          <w:tcPr><w:tcW w:w="900" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:r>
            <w:drawing>
              <wp:inline distT="0" distB="0" distL="0" distR="0">
                <wp:extent cx="381000" cy="381000"/>
                <wp:docPr id="100" name="Logo"/>
                <a:graphic>
                  <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:pic>
                      <pic:nvPicPr><pic:cNvPr id="100" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>
                      <pic:blipFill><a:blip r:embed="${logoRelId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                      <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="381000" cy="381000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
                    </pic:pic>
                  </a:graphicData>
                </a:graphic>
              </wp:inline>
            </w:drawing>
          </w:r></w:p>
        </w:tc>`
      : '';

    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="333333"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0"/>
      </w:tblPr>
      <w:tr>
        ${logoCell}
        <w:tc>
          <w:tcPr><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="1a1a6e"/></w:rPr><w:t>MATH ACADEMY</w:t></w:r>
            <w:r><w:t xml:space="preserve"> — </w:t></w:r>
            <w:r><w:rPr><w:b/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>Xususiy maktabi</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr>
            <w:r><w:rPr><w:i/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>Sharqona ta'lim-tarbiya</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr>
            <w:r><w:rPr><w:i/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>va haqiqiy ilm maskani.</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1a1a6e"/></w:rPr><w:t>Tel: +91-333-66-22</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>`;
  }

  /**
   * Resolve image URL to absolute file path for Pandoc
   */
  private static resolveImagePath(url: string): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/uploads/')) {
      // Try multiple base paths
      const candidates = [
        path.join(process.cwd(), url),
        path.join(process.cwd(), 'server', url),
        path.join(__dirname, '../..', url),
      ];
      for (const c of candidates) {
        if (fsSync.existsSync(c)) return c.replace(/\\/g, '/');
      }
      return path.join(process.cwd(), url).replace(/\\/g, '/');
    }
    if (url.startsWith('/')) {
      const fullPath = path.join(process.cwd(), '..', 'client', 'public', url);
      return fullPath.replace(/\\/g, '/');
    }
    return null;
  }

  /**
   * Calculate image width in cm for Word export based on original dimensions.
   * Max column width ~7cm (2-column layout), scale proportionally.
   */
  private static calcImageWidthCm(q: Question): string {
    const MAX_CM = 7;
    const MIN_CM = 3;
    if (q.imageWidth && q.imageWidth > 0) {
      // DOCX parser saves dimensions in px. A4 content area ~680px for 2-col
      const ratio = Math.min(q.imageWidth / 680, 1);
      const cm = Math.max(MIN_CM, Math.round(ratio * MAX_CM * 10) / 10);
      return `${cm}cm`;
    }
    return '6cm'; // Default — most question images need decent size
  }

  /**
   * Generate markdown for question images — only from media[], deduplicated
   */
  private static getQuestionImages(q: Question): string {
    let imgMd = '';
    const seen = new Set<string>();
    const normalizeUrl = (url: string) => url.replace(/^https?:\/\/[^/]+/, '').replace(/\\/g, '/');
    const widthAttr = this.calcImageWidthCm(q);

    if (q.imageUrl) {
      seen.add(normalizeUrl(q.imageUrl));
      const imgPath = this.resolveImagePath(q.imageUrl);
      if (imgPath) {
        imgMd += `![](${imgPath}){width=${widthAttr}}\n\n`;
      }
    }
    if (q.media && q.media.length > 0) {
      for (const m of q.media) {
        if (m.url && !seen.has(normalizeUrl(m.url))) {
          seen.add(normalizeUrl(m.url));
          const imgPath = this.resolveImagePath(m.url);
          if (imgPath) {
            // Tables get wider width
            const w = m.type === 'table' ? '7cm' : widthAttr;
            imgMd += `![](${imgPath}){width=${w}}\n\n`;
          }
        }
      }
    }
    return imgMd;
  }

  private static generateMarkdown(testData: TestData): string {
    let md = '';

    if (testData.students && testData.students.length > 0) {
      testData.students.forEach((student, index) => {
        if (index > 0) {
          md += '\n\n```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n\n';
        }

        md += `# ${student.studentName} | Variant: ${student.variantCode}${testData.className ? ` | ${testData.className}` : ''}\n\n`;

        student.questions.forEach(q => {
          md += `**${q.number}.** ${q.text}\n\n`;

          // Question images
          md += this.getQuestionImages(q);

          if (q.options && q.options.length > 0) {
            const opts = q.options.map((opt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              return `**${letter})** ${opt}`;
            });
            const row1 = opts.slice(0, 2).join('   ');
            const row2 = opts.slice(2).join('   ');
            md += row2 ? `${row1}\n\n${row2}\n\n` : `${row1}\n\n`;
          }
        });
      });

      return md;
    }

    // Single test format
    md += `# ${testData.title}\n\n`;

    if (testData.className) {
      md += `**Sinf: ${testData.className}**\n\n`;
    }

    md += '---\n\n';

    testData.questions.forEach(q => {
      md += `**${q.number}.** ${q.text}\n\n`;

      md += this.getQuestionImages(q);

      if (q.options && q.options.length > 0) {
        const opts = q.options.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx);
          return `**${letter})** ${opt}`;
        });
        const row1 = opts.slice(0, 2).join('   ');
        const row2 = opts.slice(2).join('   ');
        md += row2 ? `${row1}\n\n${row2}\n\n` : `${row1}\n\n`;
      }
    });

    return md;
  }

  /**
   * Generate answer sheet DOCX for multiple students
   */
  static async generateAnswerSheetDocx(data: {
    students: Array<{ fullName: string; variantCode: string }>;
    test: { classNumber: number; groupLetter: string; subjectName?: string };
    totalQuestions: number;
    className?: string;
  }): Promise<Buffer> {
    const { students, test, totalQuestions } = data;
    const qPerCol = Math.ceil(totalQuestions / 2);

    let md = '';
    students.forEach((student, idx) => {
      if (idx > 0) md += '\n\n```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n\n';

      const className = data.className || `${test.classNumber}-${test.groupLetter}`;
      md += `# ${student.fullName} | Variant: ${student.variantCode} | ${className}\n\n`;

      if (test.subjectName) {
        md += `**Fan:** ${test.subjectName} &nbsp;&nbsp; **Savollar soni:** ${totalQuestions}\n\n`;
      }

      // Build 2-column answer table
      const header = '| # | A | B | C | D |   | # | A | B | C | D |';
      const separator = '|---|---|---|---|---|---|---|---|---|---|---|';
      md += `${header}\n${separator}\n`;

      for (let row = 0; row < qPerCol; row++) {
        const q1 = row + 1;
        const q2 = row + qPerCol + 1;
        const right = q2 <= totalQuestions
          ? `| ${q2}. | ○ | ○ | ○ | ○ |`
          : '|   |   |   |   |   |';
        md += `| ${q1}. | ○ | ○ | ○ | ○ |   ${right}\n`;
      }
      md += '\n';
    });

    return this.generateFromMarkdown(md);
  }

  /**
   * Generate DOCX from raw markdown string
   */
  static async generateFromMarkdown(markdown: string): Promise<Buffer> {
    await fs.mkdir(this.TEMP_DIR, { recursive: true });
    const tempId = uuidv4();
    const markdownPath = path.join(this.TEMP_DIR, `${tempId}.md`);
    const docxPath = path.join(this.TEMP_DIR, `${tempId}.docx`);

    try {
      await fs.writeFile(markdownPath, markdown, 'utf-8');
      const hasReference = await fs.access(this.REFERENCE_DOCX).then(() => true).catch(() => false);
      const fromFmt = 'markdown+pipe_tables+raw_html+raw_tex';
      const pandocCmd = hasReference
        ? `pandoc "${markdownPath}" -o "${docxPath}" --from ${fromFmt} --to docx --reference-doc="${this.REFERENCE_DOCX}"`
        : `pandoc "${markdownPath}" -o "${docxPath}" --from ${fromFmt} --to docx`;
      await execAsync(pandocCmd);
      const buffer = await fs.readFile(docxPath) as Buffer;
      return buffer;
    } finally {
      await fs.unlink(markdownPath).catch(() => {});
      await fs.unlink(docxPath).catch(() => {});
    }
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
