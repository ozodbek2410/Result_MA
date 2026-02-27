import { EventEmitter } from 'events';

/**
 * Простая система очередей для асинхронной обработки тяжелых задач
 * Использует in-memory очередь (для production рекомендуется Bull/BullMQ с Redis)
 */

interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retries: number;
  maxRetries: number;
}

type JobHandler<T = any> = (data: T) => Promise<any>;

class QueueService extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private processing: boolean = false;
  private concurrency: number = 2; // Количество одновременно обрабатываемых задач

  constructor() {
    super();
    this.startProcessing();
  }

  /**
   * Регистрация обработчика для типа задачи
   */
  registerHandler<T = any>(type: string, handler: JobHandler<T>) {
    this.handlers.set(type, handler);
  }

  /**
   * Добавление задачи в очередь
   */
  async addJob<T = any>(
    type: string,
    data: T,
    options: { maxRetries?: number } = {}
  ): Promise<string> {
    const jobId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const job: Job<T> = {
      id: jobId,
      type,
      data,
      status: 'pending',
      createdAt: new Date(),
      retries: 0,
      maxRetries: options.maxRetries ?? 3,
    };

    this.jobs.set(jobId, job);
    this.emit('job:added', job);
    
    // Запускаем обработку, если она не запущена
    if (!this.processing) {
      this.startProcessing();
    }

    return jobId;
  }

  /**
   * Получение статуса задачи
   */
  getJobStatus(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Получение всех задач определенного типа
   */
  getJobsByType(type: string): Job[] {
    return Array.from(this.jobs.values()).filter(job => job.type === type);
  }

  /**
   * Получение статистики очереди
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
    };
  }

  /**
   * Запуск обработки очереди
   */
  private async startProcessing() {
    if (this.processing) return;
    this.processing = true;

    while (this.processing) {
      const pendingJobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'pending')
        .slice(0, this.concurrency);

      if (pendingJobs.length === 0) {
        // Нет задач, ждем немного
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Если все еще нет задач, останавливаем обработку
        const hasPending = Array.from(this.jobs.values()).some(j => j.status === 'pending');
        if (!hasPending) {
          this.processing = false;
          break;
        }
        continue;
      }

      // Обрабатываем задачи параллельно
      await Promise.all(
        pendingJobs.map(job => this.processJob(job))
      );
    }
  }

  /**
   * Обработка одной задачи
   */
  private async processJob(job: Job) {
    const handler = this.handlers.get(job.type);
    
    if (!handler) {
      console.error(`❌ No handler registered for job type: ${job.type}`);
      job.status = 'failed';
      job.error = 'No handler registered';
      job.completedAt = new Date();
      this.emit('job:failed', job);
      return;
    }

    job.status = 'processing';
    job.startedAt = new Date();
    this.emit('job:processing', job);
    
    console.log(`⚙️ Processing job: ${job.id} (${job.type})`);

    try {
      const result = await handler(job.data);
      
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      this.emit('job:completed', job);
      
      console.log(`✅ Job completed: ${job.id} (${job.type})`);
      
      // Удаляем завершенные задачи через 5 минут
      setTimeout(() => {
        this.jobs.delete(job.id);
      }, 5 * 60 * 1000);
      
    } catch (error: any) {
      console.error(`❌ Job failed: ${job.id} (${job.type})`, error.message);
      
      job.retries++;
      
      if (job.retries < job.maxRetries) {
        // Повторная попытка
        job.status = 'pending';
        console.log(`🔄 Retrying job: ${job.id} (attempt ${job.retries + 1}/${job.maxRetries})`);
      } else {
        // Максимум попыток достигнут
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date();
        this.emit('job:failed', job);
      }
    }
  }

  /**
   * Очистка завершенных задач
   */
  clearCompleted() {
    const completed = Array.from(this.jobs.values())
      .filter(job => job.status === 'completed' || job.status === 'failed');
    
    completed.forEach(job => this.jobs.delete(job.id));
    
    console.log(`🗑️ Cleared ${completed.length} completed jobs`);
  }
}

// Singleton instance
export const queueService = new QueueService();

// Типы задач
export const JobTypes = {
  OMR_PROCESS: 'omr:process',
  TEST_IMPORT: 'test:import',
  REPORT_GENERATE: 'report:generate',
  IMAGE_OPTIMIZE: 'image:optimize',
} as const;
