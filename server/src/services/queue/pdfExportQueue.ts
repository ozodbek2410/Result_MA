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
  booklet?: boolean;
  simplex?: boolean;
  answerSheets?: boolean;
  version?: string;
  settings?: {
    fontSize?: number;
    fontFamily?: string;
    lineHeight?: number;
    columnsCount?: number;
    backgroundOpacity?: number;
    backgroundImage?: string;
  };
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
 * Process answer sheet PDF export — lighter than full test PDF
 */
async function processAnswerSheetExport(job: Job<PDFExportJobData>): Promise<PDFExportJobResult> {
  const { testId, studentIds, userId, isBlockTest, version, booklet, simplex } = job.data;
  try {
    await job.updateProgress(10);
    const Model = isBlockTest ? (await import('../../models/BlockTest')).default : Test;
    const query = (Model as any).findById(testId);
    if (!isBlockTest) query.populate('subjectId', 'nameUzb');
    else query.populate('subjectTests.subjectId', 'nameUzb');
    const test: Record<string, unknown> = await query.lean();
    if (!test) throw new Error('Test topilmadi');

    await job.updateProgress(30);

    // Load students
    const Student = (await import('../../models/Student')).default;
    const StudentGroup = (await import('../../models/StudentGroup')).default;
    let allStudents: Array<Record<string, unknown>> = [];
    if (test.groupId) {
      const group = await StudentGroup.findById(test.groupId).populate('students', 'fullName').lean();
      allStudents = ((group as Record<string, unknown>)?.students as Array<Record<string, unknown>>) || [];
    }
    if (allStudents.length === 0 && studentIds.length > 0) {
      allStudents = await Student.find({ _id: { $in: studentIds } }).select('fullName').lean();
    }
    const selected = studentIds.length > 0
      ? allStudents.filter(s => studentIds.includes((s._id as string).toString()))
      : allStudents;

    await job.updateProgress(50);

    // Load variant codes
    const variants = await StudentVariant.find({
      testId: new Types.ObjectId(testId),
      ...(isBlockTest ? { testType: 'BlockTest' } : {}),
      studentId: { $in: selected.map(s => s._id) },
    }).lean();
    const variantMap = new Map<string, string>();
    variants.forEach((v: Record<string, unknown>) => {
      variantMap.set((v.studentId as string)?.toString() || '', (v.variantCode as string) || '');
    });

    const pdfStudents = selected.map(s => ({
      fullName: (s.fullName as string) || '',
      variantCode: variantMap.get((s._id as string).toString()) || '',
    }));

    // totalQuestions
    let totalQuestions = 0;
    if (isBlockTest) {
      const sts = test.subjectTests as Array<Record<string, unknown>> | undefined;
      sts?.forEach(st => { totalQuestions += ((st.questions as unknown[])?.length || 0); });
    } else {
      totalQuestions = (test.questions as unknown[])?.length || 0;
    }

    await job.updateProgress(70);

    const classNumber = (test.classNumber as number) || 10;
    const subjectName = isBlockTest ? '' : ((test.subjectId as Record<string, unknown>)?.nameUzb as string) || '';
    const testType = isBlockTest ? 'block_test' : 'test';

    const useV2 = version === 'v2';
    let pdfBuffer = useV2
      ? await PDFGeneratorService.generateAnswerSheetsPDFV2({ students: pdfStudents, test: { classNumber, groupLetter: 'A', subjectName }, totalQuestions, testType })
      : await PDFGeneratorService.generateAnswerSheetsPDF({ students: pdfStudents, test: { classNumber, groupLetter: 'A', subjectName }, totalQuestions });

    await job.updateProgress(85);

    // Booklet imposition (kitobcha format)
    if (booklet) {
      console.log(`📖 [PDF Worker ${process.pid}] Applying booklet imposition to answer sheets...`);
      // Answer sheets: har talaba 1 sahifa
      const { PDFDocument: PDFDoc } = await import('pdf-lib');
      const tmpDoc = await PDFDoc.load(pdfBuffer);
      const totalSheetPages = tmpDoc.getPageCount();
      const pagesPerSheet = Math.ceil(totalSheetPages / pdfStudents.length);
      const pageCounts = pdfStudents.map((_, i) => {
        const start = i * pagesPerSheet;
        return Math.min(pagesPerSheet, totalSheetPages - start);
      }).filter(c => c > 0);
      pdfBuffer = await PDFGeneratorService.imposeBooklet(pdfBuffer, pageCounts, !!simplex);
      console.log(`✅ [PDF Worker ${process.pid}] Booklet answer sheets: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    }

    const timestamp = Date.now();
    const fileName = `${userId}/${job.id}-${timestamp}.pdf`;
    let fileUrl: string;
    if (S3Service.isConfigured()) {
      fileUrl = await S3Service.upload(pdfBuffer, fileName);
    } else {
      fileUrl = await LocalFileService.upload(pdfBuffer, fileName);
    }

    await job.updateProgress(100);
    return {
      fileUrl,
      fileName: `${booklet ? 'kitobcha-' : ''}javob-varaqasi-${classNumber}-sinf-${timestamp}.pdf`,
      size: pdfBuffer.length,
      studentsCount: pdfStudents.length,
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ [PDF Worker ${process.pid}] Answer sheet job ${job.id} failed:`, err.message);
    throw error;
  }
}

/**
 * Process PDF export job
 */
async function processPDFExport(job: Job<PDFExportJobData>): Promise<PDFExportJobResult> {
  const { testId, studentIds, userId, isBlockTest } = job.data;

  console.log(`🔄 [PDF Worker ${process.pid}] Processing job ${job.id} for test ${testId}`);
  console.log(`📊 [PDF Worker ${process.pid}] Students: ${studentIds.length}`);

  // Answer sheets branch — simpler path, no question rendering
  if (job.data.answerSheets) {
    return processAnswerSheetExport(job);
  }

  try {
    // Step 1: Load test (10%)
    await job.updateProgress(10);
    
    const Model = isBlockTest ? (await import('../../models/BlockTest')).default : Test;
    const query = (Model as any).findById(testId);
    if (!isBlockTest) {
      query.populate('subjectId', 'nameUzb');
      query.populate('groupId', 'name classNumber letter');
    } else {
      query.populate('subjectTests.subjectId', 'nameUzb');
      query.populate('groupId', 'name classNumber letter');
    }
    const test: any = await query.lean();
    
    if (!test) {
      throw new Error('Test topilmadi');
    }
    
    console.log(`✅ [PDF Worker ${process.pid}] Test loaded: ${test.name}`);
    
    // Step 2: Load variants (30%)
    await job.updateProgress(30);
    
    const variantQuery = isBlockTest
      ? { testId: new Types.ObjectId(testId), testType: 'BlockTest', studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) } }
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
            correctAnswer: q.correctAnswer || '',
            imageUrl: q.imageUrl,
            media: q.media,
            imageWidth: q.imageWidth,
            imageHeight: q.imageHeight,
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
        ? ((test.groupId as any).name || `${(test.groupId as any).classNumber}-${(test.groupId as any).letter}`)
        : (isBlockTest && test.classNumber ? `${test.classNumber}-sinf` : ''),
      subjectName: isBlockTest
        ? (test.subjectTests?.[0]?.subjectId?.nameUzb || '')
        : ((test.subjectId as any)?.nameUzb || ''),
      questions: [],
      students,
      settings: job.data.settings
    };
    
    console.log(`✅ [PDF Worker ${process.pid}] Test data prepared: ${students.length} students`);
    
    // Step 4: Generate PDF (70%)
    await job.updateProgress(70);

    let pdfBuffer: Buffer;

    if (job.data.booklet) {
      // Booklet: har talabani alohida render → pageCounts → impose
      console.log(`📄 [PDF Worker ${process.pid}] Generating PDF with page counts for booklet...`);
      const { buffer, pageCounts } = await PDFGeneratorService.generatePDFWithPageCounts(testData);
      console.log(`✅ [PDF Worker ${process.pid}] PDF generated: ${(buffer.length / 1024).toFixed(2)} KB, pageCounts=[${pageCounts.join(',')}]`);

      await job.updateProgress(80);
      console.log(`📖 [PDF Worker ${process.pid}] Applying booklet imposition...`);
      pdfBuffer = await PDFGeneratorService.imposeBooklet(buffer, pageCounts, !!job.data.simplex);
      console.log(`✅ [PDF Worker ${process.pid}] Booklet PDF: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    } else {
      console.log(`📄 [PDF Worker ${process.pid}] Generating PDF...`);
      pdfBuffer = await PDFGeneratorService.generatePDF(testData);
      console.log(`✅ [PDF Worker ${process.pid}] PDF generated: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    }

    // Step 5: Upload to storage (85%)
    await job.updateProgress(85);
    
    const timestamp = Date.now();
    const fileName = `${userId}/${job.id}-${timestamp}.pdf`;
    
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
