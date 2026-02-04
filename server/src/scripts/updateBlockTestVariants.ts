/**
 * Скрипт для обновления существующих вариантов блок-тестов
 * Добавляет subjectId к каждому вопросу в shuffledQuestions
 * 
 * Использование:
 * npx ts-node src/scripts/updateBlockTestVariants.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import StudentVariant from '../models/StudentVariant';
import BlockTest from '../models/BlockTest';
import { connectDB } from '../config/database';

async function updateBlockTestVariants() {
  try {
    console.log('🔄 Подключение к базе данных...');
    await connectDB();
    
    console.log('🔍 Поиск вариантов блок-тестов без subjectId...');
    
    // Находим все варианты блок-тестов
    const variants = await StudentVariant.find({ 
      testType: 'BlockTest',
      shuffledQuestions: { $exists: true, $ne: [] }
    });
    
    console.log(`📦 Найдено ${variants.length} вариантов блок-тестов`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const variant of variants) {
      try {
        // Проверяем, есть ли уже subjectId у вопросов
        const hasSubjectIds = variant.shuffledQuestions?.some((q: any) => q.subjectId);
        
        if (hasSubjectIds) {
          console.log(`⏭️  Вариант ${variant.variantCode} уже имеет subjectId, пропускаем`);
          skippedCount++;
          continue;
        }
        
        console.log(`🔄 Обновление варианта ${variant.variantCode}...`);
        
        // Загружаем блок-тест
        const blockTest = await BlockTest.findById(variant.testId);
        
        if (!blockTest) {
          console.log(`❌ Блок-тест не найден для варианта ${variant.variantCode}`);
          errorCount++;
          continue;
        }
        
        // Создаем карту вопросов по тексту для быстрого поиска
        const questionMap = new Map();
        
        for (const subjectTest of blockTest.subjectTests) {
          if (subjectTest.questions) {
            for (const question of subjectTest.questions) {
              // Используем текст вопроса как ключ (обрезаем пробелы)
              const key = question.text?.trim().substring(0, 100);
              if (key) {
                questionMap.set(key, {
                  subjectId: subjectTest.subjectId,
                  question: question
                });
              }
            }
          }
        }
        
        console.log(`  📝 Карта вопросов создана: ${questionMap.size} вопросов`);
        
        // Обновляем shuffledQuestions, добавляя subjectId
        let matchedCount = 0;
        const updatedQuestions = variant.shuffledQuestions?.map((question: any) => {
          const key = question.text?.trim().substring(0, 100);
          const match = questionMap.get(key);
          
          if (match) {
            matchedCount++;
            return {
              ...question,
              subjectId: match.subjectId
            };
          } else {
            console.log(`  ⚠️  Вопрос не найден в блок-тесте: ${key?.substring(0, 50)}...`);
            return question;
          }
        });
        
        console.log(`  ✅ Сопоставлено ${matchedCount} из ${variant.shuffledQuestions?.length} вопросов`);
        
        // Сохраняем обновленный вариант
        variant.shuffledQuestions = updatedQuestions;
        await variant.save();
        
        updatedCount++;
        console.log(`✅ Вариант ${variant.variantCode} обновлен`);
        
      } catch (error: any) {
        console.error(`❌ Ошибка при обновлении варианта ${variant.variantCode}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 Результаты обновления:');
    console.log(`  ✅ Обновлено: ${updatedCount}`);
    console.log(`  ⏭️  Пропущено (уже имеют subjectId): ${skippedCount}`);
    console.log(`  ❌ Ошибок: ${errorCount}`);
    console.log(`  📦 Всего обработано: ${variants.length}`);
    
    console.log('\n✅ Скрипт завершен');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  }
}

// Запуск скрипта
updateBlockTestVariants();
