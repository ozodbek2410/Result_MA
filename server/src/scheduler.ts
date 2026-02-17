import cron from 'node-cron';
import Student from './models/Student';
import { PandocDocxService } from './services/pandocDocxService';

/**
 * Автоматический планировщик для повышения класса учеников
 * Запускается каждое 1 сентября в 00:00 (по ташкентскому времени)
 */

async function promoteStudentsAuto() {
  try {
    console.log('🎓 [SCHEDULER] Начинаем автоматическое повышение класса учеников...');
    const startTime = Date.now();

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

    console.log(`✅ [SCHEDULER] Повышен класс для ${promotedResult.modifiedCount} учеников`);

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

    console.log(`🎉 [SCHEDULER] Выпущено ${graduatedResult.modifiedCount} учеников 11 класса`);

    // Статистика
    const totalStudents = await Student.countDocuments({ isGraduated: false });
    const totalGraduated = await Student.countDocuments({ isGraduated: true });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n📊 [SCHEDULER] Статистика:');
    console.log(`   Активных учеников: ${totalStudents}`);
    console.log(`   Выпускников: ${totalGraduated}`);
    console.log(`   Время выполнения: ${duration}с`);
    console.log('✨ [SCHEDULER] Повышение класса завершено успешно!\n');

  } catch (error) {
    console.error('❌ [SCHEDULER] Ошибка при автоматическом повышении класса:', error);
  }
}

/**
 * Очистка временных файлов Pandoc
 * Удаляет файлы старше 1 часа
 */
async function cleanupTempFiles() {
  try {
    console.log('🗑️ [SCHEDULER] Очистка временных файлов Pandoc...');
    await PandocDocxService.cleanupTempFiles();
    console.log('✅ [SCHEDULER] Очистка завершена');
  } catch (error) {
    console.error('❌ [SCHEDULER] Ошибка при очистке временных файлов:', error);
  }
}

/**
 * Настройка планировщика
 * Формат cron: секунда минута час день месяц день_недели
 * '0 0 1 9 *' = каждое 1 сентября в 00:00
 */
export function initScheduler() {
  // Запуск каждое 1 сентября в 00:00
  cron.schedule('0 0 1 9 *', promoteStudentsAuto, {
    timezone: 'Asia/Tashkent'
  });

  // Очистка временных файлов каждый час
  cron.schedule('0 * * * *', cleanupTempFiles, {
    timezone: 'Asia/Tashkent'
  });

  console.log('📅 [SCHEDULER] Планировщик запущен');
  console.log('   → Автоматическое повышение класса: каждое 1 сентября в 00:00 (Asia/Tashkent)');
  console.log('   → Очистка временных файлов: каждый час');
  
  // Для тестирования: раскомментируйте строку ниже, чтобы запускать каждую минуту
  // cron.schedule('* * * * *', promoteStudentsAuto, { timezone: 'Asia/Tashkent' });
  // console.log('   ⚠️ ТЕСТОВЫЙ РЕЖИМ: Запуск каждую минуту!');
}

export default initScheduler;
