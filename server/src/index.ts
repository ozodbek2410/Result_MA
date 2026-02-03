import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './config/database';
import { connectRedis } from './config/redis';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        mongodb: mongoStatus,
        name: mongoose.connection.name || 'N/A'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
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

connectDB().then(() => {
  // Подключаем Redis (опционально)
  connectRedis().catch(err => {
    // Redis опционален, продолжаем без него
  });
  
  // Регистрируем обработчики очередей
  registerOMRHandler();
  console.log('✅ Queue handlers registered');
  
  // Инициализируем планировщик для автоматического повышения класса
  initScheduler();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
  });
});
