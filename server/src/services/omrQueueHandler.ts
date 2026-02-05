import { queueService, JobTypes } from './queueService';
import { spawn } from 'child_process';
import path from 'path';

/**
 * Обработчик для OMR задач в очереди
 */

interface OMRJobData {
  imagePath: string;
  correctAnswers?: string[];
  questionCount?: number;
}

interface OMRResult {
  success: boolean;
  answers?: string[];
  score?: number;
  error?: string;
}

/**
 * Обработка OMR изображения через Python скрипт
 */
async function processOMRImage(data: OMRJobData): Promise<OMRResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'server', 'python', 'omr_final_v2.py');
    const args = [pythonScript, data.imagePath];

    if (data.questionCount) {
      args.push('--questions', data.questionCount.toString());
    }

    console.log(`🐍 Running Python OMR script: ${pythonScript}`);
    
    const pythonProcess = spawn('python', args);
    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Python script failed with code ${code}`);
        console.error('Error:', errorData);
        reject(new Error(`OMR processing failed: ${errorData}`));
        return;
      }

      try {
        // Парсим результат из Python
        const result = JSON.parse(outputData);
        
        // Если есть правильные ответы, вычисляем балл
        if (data.correctAnswers && result.answers) {
          let score = 0;
          result.answers.forEach((answer: string, index: number) => {
            if (answer === data.correctAnswers![index]) {
              score++;
            }
          });
          
          resolve({
            success: true,
            answers: result.answers,
            score: score,
          });
        } else {
          resolve({
            success: true,
            answers: result.answers,
          });
        }
      } catch (error: any) {
        console.error('❌ Failed to parse OMR result:', error);
        reject(new Error(`Failed to parse OMR result: ${error.message}`));
      }
    });

    // Таймаут на случай зависания
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('OMR processing timeout'));
    }, 60000); // 60 секунд
  });
}

/**
 * Регистрация обработчика OMR задач
 */
export function registerOMRHandler() {
  queueService.registerHandler(JobTypes.OMR_PROCESS, async (data: OMRJobData) => {
    console.log(`📸 Processing OMR image: ${data.imagePath}`);
    
    const result = await processOMRImage(data);
    
    console.log(`✅ OMR processing completed: ${result.answers?.length || 0} answers detected`);
    
    return result;
  });
}

/**
 * Добавление OMR задачи в очередь
 */
export async function queueOMRProcessing(
  imagePath: string,
  correctAnswers?: string[],
  questionCount?: number
): Promise<string> {
  const jobId = await queueService.addJob(JobTypes.OMR_PROCESS, {
    imagePath,
    correctAnswers,
    questionCount,
  });

  return jobId;
}

/**
 * Получение результата OMR обработки
 */
export function getOMRResult(jobId: string): OMRResult | null {
  const job = queueService.getJobStatus(jobId);
  
  if (!job) {
    return null;
  }

  if (job.status === 'completed') {
    return job.result;
  }

  if (job.status === 'failed') {
    return {
      success: false,
      error: job.error || 'Processing failed',
    };
  }

  // Еще обрабатывается
  return null;
}
