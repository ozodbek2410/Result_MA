/**
 * Скрипт для проверки вариантов блок-тестов
 * Показывает есть ли subjectId у вопросов
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import StudentVariant from '../models/StudentVariant';
import { connectDB } from '../config/database';

async function checkVariants() {
  try {
    console.log('🔄 Подключение к базе данных...');
    await connectDB();
    
    console.log('🔍 Поиск вариантов блок-тестов...');
    
    const variants = await StudentVariant.find({ 
      testType: 'BlockTest',
      shuffledQuestions: { $exists: true, $ne: [] }
    }).limit(5);
    
    console.log(`\n📦 Найдено ${variants.length} вариантов блок-тестов (показаны первые 5)\n`);
    
    for (const variant of variants) {
      const hasSubjectIds = variant.shuffledQuestions?.some((q: any) => q.subjectId);
      const totalQuestions = variant.shuffledQuestions?.length || 0;
      
      console.log(`Вариант: ${variant.variantCode}`);
      console.log(`  Всего вопросов: ${totalQuestions}`);
      console.log(`  Есть subjectId: ${hasSubjectIds ? '✅ ДА' : '❌ НЕТ'}`);
      
      if (hasSubjectIds && variant.shuffledQuestions && variant.shuffledQuestions.length > 0) {
        // Подсчитываем вопросы по предметам
        const subjectCounts = new Map();
        for (const q of variant.shuffledQuestions) {
          if (q.subjectId) {
            const sid = q.subjectId.toString();
            subjectCounts.set(sid, (subjectCounts.get(sid) || 0) + 1);
          }
        }
        console.log(`  Вопросов по предметам: ${subjectCounts.size} предмета(ов)`);
        for (const [subjectId, count] of subjectCounts.entries()) {
          console.log(`    - ${subjectId.substring(0, 8)}...: ${count} вопросов`);
        }
      }
      
      if (!hasSubjectIds) {
        console.log(`  ⚠️  НУЖНО ОБНОВИТЬ: Этот вариант не имеет subjectId`);
        console.log(`  📝 Решение: Пересоздайте варианты или запустите скрипт обновления`);
      }
      
      console.log('');
    }
    
    // Статистика
    const totalVariants = await StudentVariant.countDocuments({ 
      testType: 'BlockTest',
      shuffledQuestions: { $exists: true, $ne: [] }
    });
    
    const variantsWithSubjectId = await StudentVariant.countDocuments({
      testType: 'BlockTest',
      'shuffledQuestions.0.subjectId': { $exists: true }
    });
    
    const variantsWithoutSubjectId = totalVariants - variantsWithSubjectId;
    
    console.log('📊 СТАТИСТИКА:');
    console.log(`  Всего вариантов блок-тестов: ${totalVariants}`);
    console.log(`  С subjectId (новые): ${variantsWithSubjectId} ✅`);
    console.log(`  Без subjectId (старые): ${variantsWithoutSubjectId} ⚠️`);
    
    if (variantsWithoutSubjectId > 0) {
      console.log('\n⚠️  ВНИМАНИЕ: Есть старые варианты без subjectId!');
      console.log('📝 Рекомендуется:');
      console.log('   1. Пересоздать варианты через интерфейс (удалить старые, создать новые)');
      console.log('   2. ИЛИ запустить: npx ts-node src/scripts/updateBlockTestVariants.ts');
    } else {
      console.log('\n✅ Все варианты имеют subjectId - все в порядке!');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

checkVariants();
