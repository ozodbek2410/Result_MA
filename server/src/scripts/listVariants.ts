#!/usr/bin/env node
/**
 * LIST ALL VARIANTS
 * Database dagi barcha variantlarni ko'rsatadi
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function listVariants() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB ga ulandi\n');
    
    const StudentVariant = (await import('../models/StudentVariant')).default;
    
    const variants = await StudentVariant.find()
      .select('variantCode testId shuffledQuestions')
      .limit(20)
      .sort({ createdAt: -1 })
      .lean();
    
    if (variants.length === 0) {
      console.log('❌ Hech qanday variant topilmadi!');
      console.log('');
      console.log('Variantlar yaratish uchun:');
      console.log('1. Frontend da blok test yarating');
      console.log('2. O\'quvchilarni tanlang');
      console.log('3. "Variantlar yaratish" tugmasini bosing');
      process.exit(0);
    }
    
    console.log(`📊 Jami ${variants.length} ta variant topildi (oxirgi 20 ta):\n`);
    
    variants.forEach((variant: any, index: number) => {
      console.log(`${index + 1}. ${variant.variantCode}`);
      console.log(`   Test ID: ${variant.testId}`);
      console.log(`   Savollar: ${variant.shuffledQuestions?.length || 0} ta`);
      console.log('');
    });
    
    console.log('📋 Titul varoq yaratish uchun:');
    console.log('npm run generate-answer-sheet <variantCode>');
    console.log('');
    console.log('Misol:');
    console.log(`npm run generate-answer-sheet ${variants[0].variantCode}`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

listVariants();
