/**
 * BullMQ Worker Process
 * 
 * This is a separate process that handles background jobs.
 * Run with: npm run worker
 * 
 * In production, you can run multiple worker instances:
 * - docker-compose scale worker=10
 * - pm2 start worker.js -i 10
 */

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { startWorker } from './services/queue/wordExportQueue';
import { startPDFWorker } from './services/queue/pdfExportQueue';
import { LocalFileService } from './services/localFileService';

// Import models to register them with Mongoose
import './models/User';
import './models/Teacher';
import './models/Student';
import './models/Branch';
import './models/Subject';
import './models/Direction';
import './models/Group';
import './models/StudentGroup';
import './models/Test';
import './models/BlockTest';
import './models/Assignment';
import './models/TestResult';
import './models/StudentVariant';
import './models/StudentTestConfig';
import './models/StudentActivityLog';
import './models/Upload';
import './models/Role';
import './models/Application';

// Load environment variables from server/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function main() {
  try {
    console.log('🚀 Starting BullMQ Worker...');
    console.log(`📦 Process ID: ${process.pid}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');
    
    // Initialize local file storage
    await LocalFileService.init();
    console.log('✅ Local file storage initialized');
    
    // Start Word export worker
    const wordWorker = startWorker();
    console.log('✅ Word export worker started');
    
    // Start PDF export worker
    const pdfWorker = startPDFWorker();
    console.log('✅ PDF export worker started');
    
    console.log('✅ Worker started successfully');
    console.log('⏳ Waiting for jobs...');
    
    // Keep process alive
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Worker startup failed:', error);
    process.exit(1);
  }
}

main();
