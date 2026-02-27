import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Teacher from '../models/Teacher';

dotenv.config();

async function migrateTeachersToUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/education_system');
    console.log('✅ MongoDB подключен\n');

    // Получаем всех учителей из таблицы Teacher
    const teachers = await Teacher.find({}).populate('userId');
    console.log(`📚 Найдено учителей в таблице Teacher: ${teachers.length}\n`);

    if (teachers.length === 0) {
      console.log('✅ Миграция не требуется - таблица Teacher пуста');
      process.exit(0);
    }

    let migratedCount = 0;
    let skippedCount = 0;

    for (const teacher of teachers) {
      const user = teacher.userId as any;
      
      if (!user) {
        console.log(`⚠️  Пропускаем учителя ${teacher.fullName} - нет связанного User`);
        skippedCount++;
        continue;
      }

      console.log(`\n📝 Миграция: ${teacher.fullName} (${user.username})`);
      console.log(`   User ID: ${user._id}`);
      console.log(`   Teacher ID: ${teacher._id}`);

      // Проверяем, есть ли уже fullName у пользователя
      if (user.fullName) {
        console.log(`   ℹ️  У пользователя уже есть fullName: ${user.fullName}`);
      } else {
        // Обновляем User, добавляя fullName из Teacher
        await User.findByIdAndUpdate(user._id, {
          fullName: teacher.fullName,
          phone: teacher.phone || user.phone,
          branchId: teacher.branchId || user.branchId
        });
        console.log(`   ✅ Добавлен fullName: ${teacher.fullName}`);
      }

      migratedCount++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 МИГРАЦИЯ ЗАВЕРШЕНА!');
    console.log('='.repeat(60));
    console.log(`Всего учителей: ${teachers.length}`);
    console.log(`Мигрировано: ${migratedCount}`);
    console.log(`Пропущено: ${skippedCount}`);
    console.log('='.repeat(60));
    console.log('\n⚠️  ВАЖНО: Таблица Teacher больше не используется.');
    console.log('Все данные учителей теперь в таблице User.');
    console.log('Вы можете удалить таблицу Teacher из базы данных.');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка миграции:', error);
    process.exit(1);
  }
}

migrateTeachersToUsers();
