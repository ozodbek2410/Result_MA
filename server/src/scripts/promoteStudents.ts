import mongoose from 'mongoose';
import Student from '../models/Student';
import { connectDB } from '../config/database';

/**
 * Скрипт для автоматического повышения класса учеников
 * Запускается каждое 1 сентября
 * 
 * Логика:
 * - Ученики с 1-10 класс переходят на следующий класс
 * - Ученики 11 класса помечаются как выпускники (isGraduated = true)
 * - Выпускники не отображаются в обычных списках, только в админ-панелях
 */

async function promoteStudents() {
  try {
    await connectDB();
    console.log('🎓 Начинаем повышение класса учеников...');

    // Повышаем класс для учеников с 1 по 10 класс
    const promotedResult = await Student.updateMany(
      { 
        classNumber: { $gte: 1, $lte: 10 },
        isGraduated: false 
      },
      { 
        $inc: { classNumber: 1 } 
      }
    );

    console.log(`✅ Повышен класс для ${promotedResult.modifiedCount} учеников`);

    // Помечаем учеников 11 класса как выпускников
    const graduatedResult = await Student.updateMany(
      { 
        classNumber: 11,
        isGraduated: false 
      },
      { 
        isGraduated: true 
      }
    );

    console.log(`🎉 Выпущено ${graduatedResult.modifiedCount} учеников 11 класса`);

    // Статистика
    const totalStudents = await Student.countDocuments({ isGraduated: false });
    const totalGraduated = await Student.countDocuments({ isGraduated: true });

    console.log('\n📊 Статистика:');
    console.log(`   Активных учеников: ${totalStudents}`);
    console.log(`   Выпускников: ${totalGraduated}`);

    // Распределение по классам
    console.log('\n📚 Распределение по классам:');
    for (let i = 1; i <= 11; i++) {
      const count = await Student.countDocuments({ classNumber: i, isGraduated: false });
      console.log(`   ${i} класс: ${count} учеников`);
    }

    console.log('\n✨ Повышение класса завершено успешно!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при повышении класса:', error);
    process.exit(1);
  }
}

// Запуск скрипта
promoteStudents();
