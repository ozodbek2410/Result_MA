import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PandocDocxService } from '../pandocDocxService';
import { S3Service } from '../s3Service';
import { LocalFileService } from '../localFileService';
import Test from '../../models/Test';
import StudentVariant from '../../models/StudentVariant';
import { Types } from 'mongoose';
import { convertVariantText } from '../../utils/tiptapConverter';

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

// Job data interface
export interface WordExportJobData {
  testId: string;
  studentIds: string[];
  settings: {
    fontSize?: number;
    fontFamily?: string;
    lineHeight?: number;
    columnsCount?: number;
    backgroundOpacity?: number;
    backgroundImage?: string;
  };
  userId: string;
  isBlockTest?: boolean;
}

// Job result interface
export interface WordExportJobResult {
  fileUrl: string;
  fileName: string;
  size: number;
  studentsCount: number;
}

// Queue instance
export const wordExportQueue = new Queue<WordExportJobData, WordExportJobResult>('word-export', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      count: 100, // Keep last 100 successful jobs
      age: 24 * 3600 // Remove after 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 7 * 24 * 3600 // Remove after 7 days
    }
  }
});

/**
 * Process word export job
 */
async function processWordExport(job: Job<WordExportJobData>): Promise<WordExportJobResult> {
  const { testId, studentIds, settings, userId, isBlockTest } = job.data;
  
  console.log(`🔄 [Worker ${process.pid}] Processing job ${job.id} for test ${testId}`);
  console.log(`📊 [Worker ${process.pid}] Students: ${studentIds.length}, Settings:`, settings);
  
  try {
    // Step 1: Load test (10%)
    await job.updateProgress(10);
    
    const Model = isBlockTest ? (await import('../../models/BlockTest')).default : Test;
    const test: any = await (Model as any).findById(testId)
      .populate('subjectId', 'nameUzb')
      .populate('groupId', 'name classNumber letter')
      .lean();
    
    if (!test) {
      throw new Error('Test topilmadi');
    }
    
    console.log(`✅ [Worker ${process.pid}] Test loaded: ${test.name}`);
    
    // Step 2: Load variants (30%)
    await job.updateProgress(30);
    
    const variantQuery = isBlockTest
      ? { testId: new Types.ObjectId(testId), testType: 'BlockTest', studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) } }
      : { testId: new Types.ObjectId(testId), studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) } };
    
    const variants = await StudentVariant.find(variantQuery)
      .populate('studentId', 'fullName')
      .lean();
    
    console.log(`✅ [Worker ${process.pid}] Loaded ${variants.length} variants`);
    
    // Step 3: Prepare test data (50%)
    await job.updateProgress(50);
    
    const students = variants
      .filter(variant => variant.studentId)
      .map(variant => {
        const questions = (variant.shuffledQuestions && variant.shuffledQuestions.length > 0
          ? variant.shuffledQuestions
          : test.questions
        ).map((q: any, index: number) => {
          // Convert TipTap JSON to LaTeX
          const questionText = convertVariantText(q.text);
          
          const options = (q.variants || q.options || []).map((v: any) => {
            if (typeof v === 'string') return v;
            if (v.text) {
              const converted = convertVariantText(v.text);
              
              // Log if conversion returned empty
              if (!converted || converted.trim().length === 0) {
                console.log(`⚠️ [Worker ${process.pid}] Empty variant text for question ${index + 1}`);
                console.log(`   Original:`, JSON.stringify(v.text).substring(0, 200));
              }
              
              return converted;
            }
            return '';
          });
          
          // Check if any options are empty
          const emptyOptions = options.filter((opt: string) => !opt || opt.trim().length === 0);
          if (emptyOptions.length > 0) {
            console.log(`⚠️ [Worker ${process.pid}] Question ${index + 1} has ${emptyOptions.length} empty options`);
            console.log(`   All options:`, options);
          }
          
          return {
            number: index + 1,
            text: questionText,
            options,
            correctAnswer: q.correctAnswer || ''
          };
        });
        
        return {
          studentName: (variant.studentId as any)?.fullName || 'Student',
          variantCode: variant.variantCode || 'A',
          questions
        };
      });
    
    if (students.length === 0) {
      throw new Error('Variantlar topilmadi');
    }
    
    const testData = {
      title: test.name || 'Test',
      className: test.groupId 
        ? `${(test.groupId as any).classNumber}-${(test.groupId as any).letter}` 
        : '',
      subjectName: (test.subjectId as any)?.nameUzb || '',
      questions: [], // Empty array for compatibility
      students,
      settings
    };
    
    console.log(`✅ [Worker ${process.pid}] Test data prepared: ${students.length} students`);
    
    // Step 4: Generate Word with Pandoc (70%)
    await job.updateProgress(70);
    
    console.log(`📄 [Worker ${process.pid}] Generating Word with Pandoc...`);
    const docxBuffer = await PandocDocxService.generateDocx(testData);
    
    console.log(`✅ [Worker ${process.pid}] Word generated: ${(docxBuffer.length / 1024).toFixed(2)} KB`);
    
    // Step 5: Upload to S3 or local storage (85%)
    await job.updateProgress(85);
    
    const timestamp = Date.now();
    const fileName = `exports/${userId}/${job.id}-${timestamp}.docx`;
    
    let fileUrl: string;
    
    // Try S3 first, fallback to local storage
    if (S3Service.isConfigured()) {
      fileUrl = await S3Service.upload(docxBuffer, fileName);
      console.log(`✅ [Worker ${process.pid}] Uploaded to S3: ${fileUrl}`);
    } else {
      fileUrl = await LocalFileService.upload(docxBuffer, fileName);
      console.log(`✅ [Worker ${process.pid}] Saved locally: ${fileUrl}`);
    }
    
    // Step 6: Complete (100%)
    await job.updateProgress(100);
    
    const result: WordExportJobResult = {
      fileUrl,
      fileName: `test-${test.name?.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}.docx`,
      size: docxBuffer.length,
      studentsCount: students.length
    };
    
    console.log(`✅ [Worker ${process.pid}] Job ${job.id} completed successfully`);
    
    return result;
    
  } catch (error: any) {
    console.error(`❌ [Worker ${process.pid}] Job ${job.id} failed:`, error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Convert TipTap JSON to LaTeX string
 * @deprecated Use convertVariantText directly instead
 */
function convertTiptapToLatex(json: any): string {
  return convertVariantText(json);
}

/**
 * Start worker process
 */
export function startWorker() {
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '10');
  const maxJobsPerMinute = parseInt(process.env.WORKER_MAX_JOBS_PER_MINUTE || '100');
  
  console.log(`🚀 [Worker ${process.pid}] Starting with concurrency: ${concurrency}`);
  
  const worker = new Worker<WordExportJobData, WordExportJobResult>(
    'word-export',
    processWordExport,
    {
      connection: redis,
      concurrency,
      limiter: {
        max: maxJobsPerMinute,
        duration: 60000 // 1 minute
      }
    }
  );
  
  // Event handlers
  worker.on('completed', (job) => {
    console.log(`✅ [Worker ${process.pid}] Job ${job.id} completed`);
  });
  
  worker.on('failed', (job, err) => {
    console.error(`❌ [Worker ${process.pid}] Job ${job?.id} failed:`, err.message);
  });
  
  worker.on('error', (err) => {
    console.error(`❌ [Worker ${process.pid}] Worker error:`, err);
  });
  
  worker.on('ready', () => {
    console.log(`✅ [Worker ${process.pid}] Ready to process jobs`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log(`🛑 [Worker ${process.pid}] SIGTERM received, closing worker...`);
    await worker.close();
    await redis.quit();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log(`🛑 [Worker ${process.pid}] SIGINT received, closing worker...`);
    await worker.close();
    await redis.quit();
    process.exit(0);
  });
  
  return worker;
}

// Export queue for API usage
export default wordExportQueue;
