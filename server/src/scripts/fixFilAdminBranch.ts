import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User, { UserRole } from '../models/User';
import Teacher from '../models/Teacher';
import Branch from '../models/Branch';

dotenv.config();

async function fixFilAdminBranch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/education_system');
    console.log('✅ MongoDB подключен\n');

    // Получаем всех филиал админов
    const filAdmins = await User.find({ role: UserRole.FIL_ADMIN });
    console.log(`Найдено филиал админов: ${filAdmins.length}\n`);

    if (filAdmins.length === 0) {
      console.log('❌ Филиал админы не найдены');
      process.exit(0);
    }

    // Получаем все филиалы
    const branches = await Branch.find({ isActive: true });
    console.log(`Найдено активных филиалов: ${branches.length}\n`);

    if (branches.length === 0) {
      console.log('❌ Активные филиалы не найдены');
      process.exit(1);
    }

    // Проверяем каждого филиал админа
    for (const admin of filAdmins) {
      console.log(`\n📋 Филиал админ: ${admin.username}`);
      console.log(`   ID: ${admin._id}`);
      console.log(`   BranchId: ${admin.branchId || 'НЕ УСТАНОВЛЕН'}`);

      if (!admin.branchId) {
        // Если у админа нет филиала, назначаем первый доступный
        const branch = branches[0];
        admin.branchId = branch._id;
        await admin.save();
        console.log(`   ✅ Назначен филиал: ${branch.name} (${branch._id})`);
      } else {
        const branch = branches.find(b => b._id.toString() === admin.branchId?.toString());
        if (branch) {
          console.log(`   ✅ Филиал уже назначен: ${branch.name}`);
        } else {
          console.log(`   ⚠️  Филиал не найден, назначаем новый`);
          admin.branchId = branches[0]._id;
          await admin.save();
          console.log(`   ✅ Назначен филиал: ${branches[0].name}`);
        }
      }
    }

    // Проверяем учителей без филиала
    console.log('\n\n📚 Проверка учителей...');
    const teachers = await Teacher.find({}).populate('userId');
    console.log(`Всего учителей: ${teachers.length}\n`);

    let fixedCount = 0;
    for (const teacher of teachers) {
      if (!teacher.branchId) {
        console.log(`⚠️  Учитель без филиала: ${teacher.fullName} (${teacher._id})`);
        
        // Назначаем первый филиал
        teacher.branchId = branches[0]._id;
        await teacher.save();
        
        // Также обновляем User
        const user = teacher.userId as any;
        if (user && !user.branchId) {
          await User.findByIdAndUpdate(user._id, { branchId: branches[0]._id });
          console.log(`   ✅ Назначен филиал: ${branches[0].name}`);
          fixedCount++;
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 ПРОВЕРКА ЗАВЕРШЕНА!');
    console.log('='.repeat(50));
    console.log(`Филиал админов проверено: ${filAdmins.length}`);
    console.log(`Учителей исправлено: ${fixedCount}`);
    console.log('='.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

fixFilAdminBranch();
