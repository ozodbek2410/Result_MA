import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

/**
 * Добавляет водяной знак (фоновое изображение) в reference.docx
 * Word документы - это ZIP архивы с XML файлами внутри
 */
async function addWatermarkToReference() {
  const referencePath = path.join(process.cwd(), 'templates', 'reference.docx');
  const logoPath = path.join(process.cwd(), '..', 'client', 'public', 'logo.png');
  const backupPath = path.join(process.cwd(), 'templates', 'reference.backup.docx');

  try {
    console.log('📄 Adding watermark to reference.docx...');

    // Проверяем наличие файлов
    await fs.access(referencePath);
    await fs.access(logoPath);

    // Создаем резервную копию
    await fs.copyFile(referencePath, backupPath);
    console.log('✅ Backup created:', backupPath);

    // Читаем logo.png
    const logoBuffer = await fs.readFile(logoPath);

    // Читаем DOCX как ZIP
    const docxBuffer = await fs.readFile(referencePath);
    const zip = await JSZip.loadAsync(docxBuffer);
    
    // Добавляем изображение в media папку
    zip.file('word/media/watermark.png', logoBuffer);
    console.log('✅ Logo added to word/media/watermark.png');

    // Читаем document.xml.rels для добавления связи
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (!relsFile) {
      throw new Error('document.xml.rels not found');
    }
    
    let relsXml = await relsFile.async('text');
    
    // Проверяем, есть ли уже связь с watermark.png
    if (!relsXml.includes('watermark.png')) {
      // Находим максимальный Id
      const idMatches = relsXml.match(/Id="rId(\d+)"/g) || [];
      const maxId = Math.max(...idMatches.map(m => parseInt(m.match(/\d+/)![0])));
      const newId = maxId + 1;

      // Добавляем новую связь перед закрывающим тегом
      const newRel = `<Relationship Id="rId${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/watermark.png"/>`;
      relsXml = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);
      
      zip.file('word/_rels/document.xml.rels', relsXml);
      console.log(`✅ Relationship added: rId${newId}`);

      // Создаем header1.xml с водяным знаком
      const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr/>
      <w:drawing>
        <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">
          <wp:simplePos x="0" y="0"/>
          <wp:positionH relativeFrom="page">
            <wp:align>center</wp:align>
          </wp:positionH>
          <wp:positionV relativeFrom="page">
            <wp:align>center</wp:align>
          </wp:positionV>
          <wp:extent cx="4000000" cy="4000000"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:wrapNone/>
          <wp:docPr id="1" name="Watermark"/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="1" name="Watermark"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rId${newId}">
                    <a:alphaModFix amt="50000"/>
                  </a:blip>
                  <a:stretch>
                    <a:fillRect/>
                  </a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="4000000" cy="4000000"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect">
                    <a:avLst/>
                  </a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:anchor>
      </w:drawing>
    </w:r>
  </w:p>
</w:hdr>`;

      zip.file('word/header1.xml', headerXml);
      console.log('✅ header1.xml created with watermark');

      // Создаем _rels для header
      const headerRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/watermark.png"/>
</Relationships>`;

      zip.file('word/_rels/header1.xml.rels', headerRelsXml);
      console.log('✅ header1.xml.rels created');

      // Обновляем document.xml для использования header
      const documentFile = zip.file('word/document.xml');
      if (!documentFile) {
        throw new Error('document.xml not found');
      }
      
      let documentXml = await documentFile.async('text');
      
      // Находим первый sectPr и добавляем headerReference
      if (documentXml.includes('<w:sectPr')) {
        // Добавляем headerReference если его нет
        if (!documentXml.includes('w:headerReference')) {
          documentXml = documentXml.replace(
            /<w:sectPr([^>]*)>/,
            `<w:sectPr$1><w:headerReference w:type="default" r:id="rId${newId + 1}"/>`
          );
        }
      }
      
      zip.file('word/document.xml', documentXml);
      console.log('✅ document.xml updated');

      // Обновляем document.xml.rels для header
      const headerRelId = newId + 1;
      const headerRel = `<Relationship Id="rId${headerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`;
      relsXml = relsXml.replace('</Relationships>', `${headerRel}</Relationships>`);
      zip.file('word/_rels/document.xml.rels', relsXml);
      console.log(`✅ Header relationship added: rId${headerRelId}`);
    }

    // Сохраняем обновленный DOCX
    const updatedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(referencePath, updatedBuffer);
    
    console.log('✅ Reference.docx updated with watermark!');
    console.log('');
    console.log('🎉 Done! All exported Word documents will now have the watermark.');
    console.log('💡 Backup saved at:', backupPath);

  } catch (error: any) {
    console.error('❌ Error adding watermark:', error.message);
    console.log('');
    console.log('⚠️  Automatic watermark failed. Please add manually:');
    console.log('1. Open templates/reference.docx in Microsoft Word');
    console.log('2. Design → Watermark → Custom Watermark → Picture');
    console.log('3. Select client/public/logo.png');
    console.log('4. Set transparency to ~50%');
    console.log('5. Save and close');
    process.exit(1);
  }
}

addWatermarkToReference();
