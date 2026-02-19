import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PDFGeneratorService } from '../pdfGeneratorService';
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
export interface PDFExportJobData {
  testId: string;
  studentIds: string[];
  userId: string;
  isBlockTest?: boolean;
}

// Job result interface
export interface PDFExportJobResult {
  fileUrl: string;
  fileName: string;
  size: number;
  studentsCount: number;
}

// Queue instance
export const pdfExportQueue = new Queue<PDFExportJobData, PDFExportJobResult>('pdf-export', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 3600
    },
    removeOnFail: {
      count: 500,
      age: 7 * 24 * 3600
    }
  }
});

/**
 * Process PDF export job
 */
async function processPDFExport(job: Job<PDFExportJobData>): Promise<PDFExportJobResult> {
  const { testId, studentIds, userId, isBlockTest } = job.data;
  
  console.log(`🔄 [PDF Worker ${process.pid}] Processing job ${job.id} for test ${testId}`);
  console.log(`📊 [PDF Worker ${process.pid}] Students: ${studentIds.length}`);
  
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
    
    console.log(`✅ [PDF Worker ${process.pid}] Test loaded: ${test.name}`);
    
    // Step 2: Load variants (30%)
    await job.updateProgress(30);
    
    const variantQuery = isBlockTest 
      ? { blockTestId: testId, studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) } }
      : { testId: new Types.ObjectId(testId), studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) } };
    
    const variants = await StudentVariant.find(variantQuery)
      .populate('studentId', 'fullName')
      .lean();
    
    console.log(`✅ [PDF Worker ${process.pid}] Loaded ${variants.length} variants`);
    
    // Step 3: Prepare test data (50%)
    await job.updateProgress(50);
    
    const students = variants
      .filter(variant => variant.studentId)
      .map(variant => {
        const questions = (variant.shuffledQuestions && variant.shuffledQuestions.length > 0
          ? variant.shuffledQuestions
          : test.questions
        ).map((q: any, index: number) => {
          const questionText = convertVariantText(q.text);
          
          const options = (q.variants || q.options || []).map((v: any) => {
            if (typeof v === 'string') return v;
            if (v.text) {
              return convertVariantText(v.text);
            }
            return '';
          });
          
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
      students
    };
    
    console.log(`✅ [PDF Worker ${process.pid}] Test data prepared: ${students.length} students`);
    
    // Step 4: Generate PDF (70%)
    await job.updateProgress(70);
    
    console.log(`📄 [PDF Worker ${process.pid}] Generating PDF...`);
    const pdfBuffer = await PDFGeneratorService.generatePDF(testData);
    
    console.log(`✅ [PDF Worker ${process.pid}] PDF generated: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    
    // Step 5: Upload to storage (85%)
    await job.updateProgress(85);
    
    const timestamp = Date.now();
    const fileName = `exports/${userId}/${job.id}-${timestamp}.pdf`;
    
    let fileUrl: string;
    
    if (S3Service.isConfigured()) {
      fileUrl = await S3Service.upload(pdfBuffer, fileName);
      console.log(`✅ [PDF Worker ${process.pid}] Uploaded to S3: ${fileUrl}`);
    } else {
      fileUrl = await LocalFileService.upload(pdfBuffer, fileName);
      console.log(`✅ [PDF Worker ${process.pid}] Saved locally: ${fileUrl}`);
    }
    
    // Step 6: Complete (100%)
    await job.updateProgress(100);
    
    const result: PDFExportJobResult = {
      fileUrl,
      fileName: `test-${test.name?.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}.pdf`,
      size: pdfBuffer.length,
      studentsCount: students.length
    };
    
    console.log(`✅ [PDF Worker ${process.pid}] Job ${job.id} completed successfully`);
    
    return result;
    
  } catch (error: any) {
    console.error(`❌ [PDF Worker ${process.pid}] Job ${job.id} failed:`, error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Start PDF worker process
 */
export function startPDFWorker() {
  const concurrency = parseInt(process.env.PDF_WORKER_CONCURRENCY || '5');
  
  console.log(`🚀 [PDF Worker ${process.pid}] Starting with concurrency: ${concurrency}`);
  
  const worker = new Worker<PDFExportJobData, PDFExportJobResult>(
    'pdf-export',
    processPDFExport,
    {
      connection: redis,
      concurrency,
      limiter: {
        max: 50,
        duration: 60000
      }
    }
  );
  
  worker.on('completed', (job) => {
    console.log(`✅ [PDF Worker ${process.pid}] Job ${job.id} completed`);
  });
  
  worker.on('failed', (job, err) => {
    console.error(`❌ [PDF Worker ${process.pid}] Job ${job?.id} failed:`, err.message);
  });
  
  worker.on('error', (err) => {
    console.error(`❌ [PDF Worker ${process.pid}] Worker error:`, err);
  });
  
  worker.on('ready', () => {
    console.log(`✅ [PDF Worker ${process.pid}] Ready to process PDF jobs`);
  });
  
  return worker;
}

export default pdfExportQueue;
