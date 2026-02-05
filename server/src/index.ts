import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './config/database';
import { connectRedis } from './config/redis';
import { validateEnv } from './config/env';
import { logger } from './config/logger';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import { registerOMRHandler } from './services/omrQueueHandler';
import { initScheduler } from './scheduler';
import authRoutes from './routes/auth.routes';
import branchRoutes from './routes/branch.routes';
import subjectRoutes from './routes/subject.routes';
import directionRoutes from './routes/direction.routes';
import userRoutes from './routes/user.routes';
import groupRoutes from './routes/group.routes';
import studentRoutes from './routes/student.routes';
import teacherRoutes from './routes/teacher.routes';
import teacherManagementRoutes from './routes/teacherManagement.routes';
import testRoutes from './routes/test.routes';
import blockTestRoutes from './routes/blockTest.routes';
import uploadRoutes from './routes/upload.routes';
import publicRoutes from './routes/public.routes';
import studentVariantRoutes from './routes/studentVariant.routes';
import studentTestConfigRoutes from './routes/studentTestConfig.routes';
import assignmentRoutes from './routes/assignment.routes';
import omrRoutes from './routes/omr.routes';
import statisticsRoutes from './routes/statistics.routes';
import roleRoutes from './routes/roles';
import managerRoutes from './routes/manager.routes';
import methodistRoutes from './routes/methodist.routes';
import observerRoutes from './routes/observer.routes';
import testResultRoutes from './routes/testResult.routes';
import studentActivityLogRoutes from './routes/studentActivityLog.routes';
import healthRoutes from './routes/health.routes';

// Load environment variables
dotenv.config();

// Validate environment variables
const env = validateEnv();

const app = express();
const PORT = env.PORT;

// Trust proxy - важно для работы за nginx
app.set('trust proxy', 1);

// Включаем сжатие ответов
app.use(compression({
  level: 6, // Уровень сжатия (0-9)
  threshold: 1024, // Минимальный размер для сжатия (1KB)
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'server', 'uploads')));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.apiResponse(req.method, req.path, res.statusCode, duration);
  });
  
  next();
});

// Health check routes (no rate limiting)
app.use('/api/health', healthRoutes);

// Routes with specific rate limiters
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/directions', directionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/teacher', teacherManagementRoutes); // O'qituvchi uchun guruh va o'quvchilar
app.use('/api/tests', testRoutes);
app.use('/api/block-tests', blockTestRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/student-variants', studentVariantRoutes);
app.use('/api/student-test-configs', studentTestConfigRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/omr', omrRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/test-results', testResultRoutes);
app.use('/api/activity-logs', studentActivityLogRoutes);

// Custom role routes
app.use('/api/manager', managerRoutes);
app.use('/api/methodist', methodistRoutes);
app.use('/api/observer', observerRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', err, 'SERVER', {
    method: req.method,
    path: req.path,
    body: req.body,
  });

  res.status(err.status || 500).json({
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection', reason, 'PROCESS');
});

// Uncaught exception handler
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', error, 'PROCESS');
  process.exit(1);
});

// Start server
connectDB().then(() => {
  // Подключаем Redis (опционально)
  connectRedis().catch(err => {
    logger.warn('Redis connection failed, continuing without cache', 'REDIS');
  });
  
  // Регистрируем обработчики очередей
  registerOMRHandler();
  logger.info('Queue handlers registered', 'QUEUE');
  
  // Инициализируем планировщик для автоматического повышения класса
  initScheduler();
  
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, 'SERVER');
    logger.info(`Environment: ${env.NODE_ENV}`, 'SERVER');
    logger.info(`API: http://localhost:${PORT}/api`, 'SERVER');
    logger.info(`Health: http://localhost:${PORT}/api/health`, 'SERVER');
  });
}).catch((error) => {
  logger.error('Failed to start server', error, 'SERVER');
  process.exit(1);
});
