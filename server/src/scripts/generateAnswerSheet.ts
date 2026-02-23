#!/usr/bin/env node
/**
 * PROFESSIONAL ANSWER SHEET GENERATOR
 * 
 * O'quvchi va test uchun professional titul varoq yaratadi
 * QR kod bilan, timing marks bilan
 * 
 * Ishlatish:
 * npm run generate-answer-sheet <variantCode>
 */

import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

// Load .env file
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

interface StudentVariantData {
  variantCode: string;
  studentId: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
  };
  testId: string;
  testType: string;
  shuffledQuestions: any[];
}

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB ga ulandi');
  } catch (error) {
    console.error('❌ MongoDB ga ulanishda xatolik:', error);
    process.exit(1);
  }
}

async function generateQRCode(text: string): Promise<string> {
  try {
    // QR kodni base64 formatda yaratish
    const qrDataURL = await QRCode.toDataURL(text, {
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrDataURL;
  } catch (error) {
    console.error('❌ QR kod yaratishda xatolik:', error);
    return '';
  }
}

async function getVariantData(variantCode: string): Promise<StudentVariantData | null> {
  try {
    // Import models
    const StudentVariant = (await import('../models/StudentVariant')).default;
    const Student = (await import('../models/Student')).default;
    const Test = (await import('../models/Test')).default;
    const BlockTest = (await import('../models/BlockTest')).default;
    const Subject = (await import('../models/Subject')).default;
    
    // Variant ni olish (populate qilmasdan)
    const variant = await StudentVariant.findOne({ variantCode }).lean();
    
    if (!variant) {
      console.error('❌ Variant topilmadi:', variantCode);
      return null;
    }
    
    // Student ma'lumotlarini alohida olish
    let studentName = 'Noma\'lum';
    try {
      const student = await Student.findById(variant.studentId).lean();
      if (student) {
        studentName = (student as any).fullName || 
                     `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim() ||
                     'Noma\'lum';
      }
    } catch (err) {
      console.log('⚠️ Student ma\'lumotlarini olishda xatolik');
    }
    
    // Test nomini olish
    let testName = 'Test';
    let subjectName = 'Fan';
    
    if (variant.testType === 'BlockTest') {
      try {
        const blockTest = await BlockTest.findById(variant.testId).select('name date').lean();
        if (blockTest) {
          const testDate = new Date((blockTest as any).date);
          const formattedDate = testDate.toLocaleDateString('uz-UZ', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          testName = `Blok Test - ${formattedDate}`;
        }
      } catch (err) {
        console.log('⚠️ BlockTest ma\'lumotlarini olishda xatolik');
      }
    } else {
      try {
        const test = await Test.findById(variant.testId).lean();
        if (test) {
          testName = (test as any).name;
          // Subject ni alohida olish
          if ((test as any).subjectId) {
            const subject = await Subject.findById((test as any).subjectId).lean();
            if (subject) {
              subjectName = (subject as any).name || 'Fan';
            }
          }
        }
      } catch (err) {
        console.log('⚠️ Test ma\'lumotlarini olishda xatolik');
      }
    }
    
    return {
      ...variant,
      studentId: {
        fullName: studentName
      },
      testName,
      subjectName
    } as any;
    
  } catch (error) {
    console.error('❌ Variant ma\'lumotlarini olishda xatolik:', error);
    return null;
  }
}

async function generateAnswerSheet(variantCode: string) {
  console.log('🚀 Professional Answer Sheet Generator');
  console.log('=====================================');
  console.log('');
  
  // 1. Database ga ulanish
  await connectDB();
  
  // 2. Variant ma'lumotlarini olish
  console.log('📊 Variant ma\'lumotlarini olish...');
  const variantData = await getVariantData(variantCode);
  
  if (!variantData) {
    console.error('❌ Variant topilmadi');
    process.exit(1);
  }
  
  const studentName = variantData.studentId?.fullName || 
                     `${variantData.studentId?.firstName || ''} ${variantData.studentId?.lastName || ''}`.trim() ||
                     'Noma\'lum';
  
  console.log('✅ Variant topildi:');
  console.log('  - O\'quvchi:', studentName);
  console.log('  - Test:', (variantData as any).testName);
  console.log('  - Fan:', (variantData as any).subjectName);
  console.log('  - Variant:', variantCode);
  console.log('  - Savollar:', variantData.shuffledQuestions?.length || 0);
  console.log('');
  
  // 3. QR kod yaratish
  console.log('📱 QR kod yaratish...');
  const qrCodeDataURL = await generateQRCode(variantCode);
  console.log('✅ QR kod yaratildi');
  console.log('');
  
  // 4. HTML template ni o'qish
  console.log('📄 HTML template ni o\'qish...');
  const templatePath = path.join(__dirname, '..', '..', 'templates', 'answer_sheet_professional.html');
  let htmlContent = await fs.readFile(templatePath, 'utf-8');
  console.log('✅ Template o\'qildi');
  console.log('');
  
  // 5. Template ni to'ldirish
  console.log('✏️ Template ni to\'ldirish...');
  htmlContent = htmlContent
    .replace(/\{\{studentName\}\}/g, studentName)
    .replace(/\{\{subjectName\}\}/g, (variantData as any).subjectName || 'Fan')
    .replace(/\{\{variantCode\}\}/g, variantCode)
    .replace(/\{\{className\}\}/g, (variantData.studentId as any)?.classNumber || '');
  
  // QR kod ni qo'shish
  if (qrCodeDataURL) {
    htmlContent = htmlContent.replace(
      '<div id="qrcode"></div>',
      `<img src="${qrCodeDataURL}" style="width: 100%; height: 100%;" />`
    );
    // QR code script ni o'chirish
    htmlContent = htmlContent.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcodejs.*?<\/script>/gs, '');
    htmlContent = htmlContent.replace(/<script>[\s\S]*?new QRCode[\s\S]*?<\/script>/g, '');
  }
  
  console.log('✅ Template to\'ldirildi');
  console.log('');
  
  // 6. HTML faylni saqlash
  const outputDir = path.join(process.cwd(), 'generated_answer_sheets');
  await fs.mkdir(outputDir, { recursive: true });
  
  const outputHtmlPath = path.join(outputDir, `${variantCode}.html`);
  await fs.writeFile(outputHtmlPath, htmlContent, 'utf-8');
  
  console.log('✅ HTML fayl saqlandi:', outputHtmlPath);
  console.log('');
  
  // 7. Ko'rsatmalar
  console.log('📋 KEYINGI QADAMLAR:');
  console.log('');
  console.log('1. HTML faylni browser da oching:');
  console.log(`   ${outputHtmlPath}`);
  console.log('');
  console.log('2. PDF yaratish:');
  console.log('   - Ctrl+P (Windows) yoki Cmd+P (Mac)');
  console.log('   - "Save as PDF" ni tanlang');
  console.log('   - 100% scale (kichraytirmasdan!)');
  console.log('');
  console.log('3. Print qiling va o\'quvchiga bering');
  console.log('');
  console.log('✅ TAYYOR!');
  
  await mongoose.disconnect();
}

// CLI
const variantCode = process.argv[2];

if (!variantCode) {
  console.error('❌ Variant kodi kiritilmadi!');
  console.log('');
  console.log('Ishlatish:');
  console.log('  npm run generate-answer-sheet <variantCode>');
  console.log('');
  console.log('Misol:');
  console.log('  npm run generate-answer-sheet BT-2024-001-A');
  process.exit(1);
}

generateAnswerSheet(variantCode).catch(error => {
  console.error('❌ Xatolik:', error);
  process.exit(1);
});
