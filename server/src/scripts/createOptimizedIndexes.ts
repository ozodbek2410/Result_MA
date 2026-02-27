import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Загружаем .env из правильной директории
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function createOptimizedIndexes() {
  try {
    console.log('🔄 Creating optimized indexes...\n');

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';
    console.log('📍 MongoDB URI:', mongoUri.replace(/\/\/.*@/, '//<credentials>@')); // Скрываем пароль
    console.log('⏳ Connecting to MongoDB...');
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    if (!db) {
      throw new Error('Database connection not established');
    }

    // Tests
    console.log('📚 Tests collection:');
    try {
      await db.collection('tests').createIndex(
        { branchId: 1, createdBy: 1, createdAt: -1 },
        { background: true }
      );
      console.log('  ✅ branchId + createdBy + createdAt');
    } catch (e: any) {
      if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
        console.log('  ⚠️  Already exists');
      } else {
        throw e;
      }
    }

    // BlockTests
    console.log('\n📦 Block tests collection:');
    try {
      await db.collection('blocktests').createIndex(
        { branchId: 1, classNumber: 1, date: -1 },
        { background: true }
      );
      console.log('  ✅ branchId + classNumber + date');
    } catch (e: any) {
      if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
        console.log('  ⚠️  Already exists');
      } else {
        throw e;
      }
    }

    // Students
    console.log('\n👨‍🎓 Students collection:');
    try {
      await db.collection('students').createIndex(
        { branchId: 1, classNumber: 1 },
        { background: true }
      );
      console.log('  ✅ branchId + classNumber');
    } catch (e: any) {
      if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
        console.log('  ⚠️  Already exists');
      } else {
        throw e;
      }
    }

    // StudentVariants
    console.log('\n🎲 Student variants collection:');
    try {
      await db.collection('studentvariants').createIndex(
        { testId: 1, studentId: 1 },
        { background: true }
      );
      console.log('  ✅ testId + studentId');
    } catch (e: any) {
      if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
        console.log('  ⚠️  Already exists');
      } else {
        throw e;
      }
    }
    
    // StudentTestConfigs
    console.log('\n⚙️  Student test configs collection:');
    try {
      await db.collection('studenttestconfigs').createIndex(
        { studentId: 1, blockTestId: 1 },
        { background: true }
      );
      console.log('  ✅ studentId + blockTestId');
    } catch (e: any) {
      if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
        console.log('  ⚠️  Already exists');
      } else {
        throw e;
      }
    }
    
    // Groups
    console.log('\n👥 Groups collection:');
    try {
      await db.collection('groups').createIndex(
        { branchId: 1, classNumber: 1 },
        { background: true }
      );
      console.log('  ✅ branchId + classNumber');
    } catch (e: any) {
      if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
        console.log('  ⚠️  Already exists');
      } else {
        throw e;
      }
    }

    console.log('\n✅ All indexes created successfully!');
    console.log('📊 Expected improvement: 10-100x faster queries');
    console.log('💡 Tip: Run this script periodically to ensure indexes are up to date');
    
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error creating indexes:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    await mongoose.disconnect();
    process.exit(1);
  }
}

createOptimizedIndexes();
