import cron from 'node-cron';
import Student from './models/Student';
import { PandocDocxService } from './services/pandocDocxService';
import { CrmSyncService } from './services/crmSyncService';
import { CrmApiService } from './services/crmApiService';
import { MediaCleanupService } from './services/mediaCleanupService';

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
async function runCrmSync() {
  if (!CrmApiService.isConfigured()) return;
  if (CrmSyncService.isSyncRunning()) {
    console.log('[SCHEDULER] CRM sync skipped - already running');
    return;
  }

  try {
    console.log('[SCHEDULER] Starting scheduled CRM sync...');
    await CrmSyncService.syncAll(undefined, 'scheduled');
    console.log('[SCHEDULER] CRM sync completed');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[SCHEDULER] CRM sync failed:', msg);
  }
}

/**
 * Clean up old uploaded files (older than 7 days)
 */
async function cleanupOldUploads() {
  try {
    const cleanupService = new MediaCleanupService();
    const deleted = await cleanupService.cleanupOldFiles(7);
    if (deleted > 0) {
      console.log(`[SCHEDULER] Cleaned up ${deleted} old uploaded files`);
    }
  } catch (error) {
    console.error('[SCHEDULER] Error cleaning up old uploads:', error);
  }
}

export function initScheduler() {
  cron.schedule('0 0 1 9 *', promoteStudentsAuto, {
    timezone: 'Asia/Tashkent'
  });

  cron.schedule('0 * * * *', cleanupTempFiles, {
    timezone: 'Asia/Tashkent'
  });

  // Clean old uploads daily at 3 AM
  cron.schedule('0 3 * * *', cleanupOldUploads, {
    timezone: 'Asia/Tashkent'
  });

  // CRM sync — cleanup stale logs on startup
  CrmSyncService.cleanupStaleSyncs().catch(() => {});

  const syncEnabled = process.env.CRM_SYNC_ENABLED === 'true';
  const syncInterval = process.env.CRM_SYNC_INTERVAL || '*/5 * * * *';

  if (syncEnabled && CrmApiService.isConfigured()) {
    cron.schedule(syncInterval, runCrmSync, { timezone: 'Asia/Tashkent' });
    console.log(`[SCHEDULER] CRM sync enabled: ${syncInterval}`);
    setTimeout(runCrmSync, 10000);
  } else {
    console.log('[SCHEDULER] CRM sync disabled');
  }

  console.log('[SCHEDULER] Scheduler started');
}

export default initScheduler;
