import { queueService, JobTypes } from './queueService';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { logger } from '../config/logger';

const execAsync = promisify(exec);

const SERVER_ROOT = path.join(__dirname, '..', '..');
const SCANNER_DIR = path.join(SERVER_ROOT, 'python', 'omr');
const PYTHON_CMD = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');

interface OMRJobData {
  imagePath: string;
  questionCount?: number;
  variantCode?: string;
}

interface OMRJobResult {
  success: boolean;
  version?: number;
  detected_answers?: Record<string, string>;
  /** backward compat alias for detected_answers */
  answers?: Record<string, string>;
  stats?: {
    answered: number;
    empty: number;
    multi_select: number;
    total: number;
    detection_rate: number;
    avg_confidence: number;
    calibration_dx?: number;
    calibration_dy?: number;
  };
  qr_code?: {
    found: boolean;
    variant_code?: string;
    total_questions?: number;
    test_type?: string;
  };
  error?: string;
  partial?: boolean;
}

async function processOMRImage(data: OMRJobData): Promise<OMRJobResult> {
  const args = [`"${data.imagePath}"`];
  if (data.questionCount) args.push('--questions', data.questionCount.toString());

  const command = `${PYTHON_CMD} -m scanner ${args.join(' ')}`;

  const { stdout, stderr } = await execAsync(command, {
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
    cwd: SCANNER_DIR,
    env: { ...process.env },
  });

  if (stderr) {
    const errLines = stderr.split('\n').filter(l =>
      l.includes('Error') || l.includes('Traceback') || l.includes('Exception')
    );
    if (errLines.length) logger.warn(`[OMR Queue] Python: ${errLines.join(' | ')}`);
  }

  const trimmed = stdout.trim();
  const jsonStart = trimmed.lastIndexOf('\n{');
  const jsonStr = jsonStart >= 0 ? trimmed.substring(jsonStart + 1) : trimmed;
  const result = JSON.parse(jsonStr) as OMRJobResult;

  // backward compat: alias detected_answers → answers (old callers use answers[])
  if (result.detected_answers && !result.answers) {
    result.answers = result.detected_answers;
  }

  return result;
}

export function registerOMRHandler(): void {
  queueService.registerHandler(JobTypes.OMR_PROCESS, async (data: OMRJobData) => {
    return await processOMRImage(data);
  });
}

export async function queueOMRProcessing(
  imagePath: string,
  questionCount?: number,
  variantCode?: string,
): Promise<string> {
  return await queueService.addJob(JobTypes.OMR_PROCESS, {
    imagePath,
    questionCount,
    variantCode,
  });
}

export function getOMRResult(jobId: string): OMRJobResult | null {
  const job = queueService.getJobStatus(jobId);
  if (!job) return null;
  if (job.status === 'completed') return job.result as OMRJobResult;
  if (job.status === 'failed') return { success: false, error: job.error || 'Processing failed' };
  return null;
}
