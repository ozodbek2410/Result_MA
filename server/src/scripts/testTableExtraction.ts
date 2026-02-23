import path from 'path';
import { TableExtractor } from '../services/parsers/TableExtractor';
import { TableRenderer } from '../services/parsers/TableRenderer';

/**
 * 🧪 TEST SCRIPT: Jadval ekstraktsiyasini test qilish
 * 
 * Ishlatish:
 * npm run test-tables -- path/to/file.docx
 */
async function testTableExtraction() {
  try {
    // Fayl yo'lini olish
    const filePath = process.argv[2];
    
    if (!filePath) {
      console.error('❌ Fayl yo\'li ko\'rsatilmagan!');
      console.log('\n📝 Ishlatish:');
      console.log('  npm run test-tables -- onatili.docx');
      console.log('  npm run test-tables -- "C:\\Users\\ozodb\\Desktop\\test.docx"');
      console.log('  npm run test-tables -- ../biologiya.docx\n');
      process.exit(1);
    }
    
    const fullPath = path.resolve(filePath);
    
    // Fayl mavjudligini tekshirish
    const fs = require('fs');
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Fayl topilmadi: ${fullPath}`);
      console.log('\n💡 Maslahat:');
      console.log('  - Fayl yo\'lini to\'g\'ri yozing');
      console.log('  - Fayl mavjudligini tekshiring');
      console.log('  - Nisbiy yo\'l ishlatishingiz mumkin (masalan: onatili.docx)\n');
      process.exit(1);
    }
    
    console.log(`📄 Fayl: ${fullPath}\n`);
    
    // 1. Jadvallarni ajratish
    console.log('📊 BOSQICH 1: Jadvallarni ajratish...');
    const extractor = new TableExtractor();
    const tables = await extractor.extractTables(fullPath);
    
    console.log(`✅ ${tables.length} ta jadval topildi\n`);
    
    if (tables.length === 0) {
      console.log('ℹ️ Faylda jadval yo\'q');
      return;
    }
    
    // 2. Jadvallarni ko'rsatish
    console.log('📋 JADVALLAR:');
    console.log('='.repeat(70));
    
    for (const table of tables) {
      console.log(`\n📊 ${table.id.toUpperCase()}`);
      console.log('-'.repeat(70));
      console.log(`Qatorlar: ${table.rows.length}`);
      console.log(`Ustunlar: ${table.rows[0]?.cells.length || 0}`);
      console.log('\nHTML Preview:');
      console.log(table.html.substring(0, 200) + '...');
      console.log('-'.repeat(70));
    }
    
    // 3. Jadvallarni rasm qilish
    console.log('\n🎨 BOSQICH 2: Jadvallarni PNG ga konvert qilish...');
    const renderer = new TableRenderer();
    const images = await renderer.renderMultipleTables(tables);
    
    console.log(`\n✅ ${images.size} ta jadval rasm qilindi\n`);
    
    // 4. Natijalarni ko'rsatish
    console.log('📸 NATIJALAR:');
    console.log('='.repeat(70));
    
    for (const [tableId, imageUrl] of images) {
      console.log(`${tableId}: ${imageUrl}`);
    }
    
    console.log('\n✅ Test muvaffaqiyatli yakunlandi!');
    console.log(`📁 Rasmlar: uploads/test-images/`);
    
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

// Run test
testTableExtraction();
