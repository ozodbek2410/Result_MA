import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User';
import Branch from '../models/Branch';

dotenv.config();

async function createTestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Проверяем, существует ли тестовый пользователь
    const existingUser = await User.findOne({ username: 'test@teacher.com' });
    if (existingUser) {
      console.log('⚠️  Тестовый пользователь уже существует');
      console.log('📧 Username:', existingUser.username);
      console.log('🔑 Password: Test123!@#');
      process.exit(0);
    }

    // Находим или создаем тестовый филиал
    let testBranch = await Branch.findOne({ name: 'Test Branch' });
    if (!testBranch) {
      testBranch = await Branch.create({
        name: 'Test Branch',
        location: 'Test Location',
        isActive: true
      });
      console.log('✅ Создан тестовый филиал');
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash('Test123!@#', 10);

    // Создаем тестового учителя
    const testUser = await User.create({
      username: 'test@teacher.com',
      password: hashedPassword,
      fullName: 'Test Teacher',
      role: 'TEACHER',
      branchId: testBranch._id,
      isActive: true
    });

    console.log('✅ Тестовый пользователь создан успешно!');
    console.log('');
    console.log('📧 Username: test@teacher.com');
    console.log('🔑 Password: Test123!@#');
    console.log('👤 Role: TEACHER');
    console.log('🏢 Branch:', testBranch.name);
    console.log('');
    console.log('Используйте эти данные для E2E тестов');
    console.log('');
    console.log('Для входа:');
    console.log('1. Откройте http://localhost:9998');
    console.log('2. Введите username: test@teacher.com');
    console.log('3. Введите password: Test123!@#');

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

createTestUser();
