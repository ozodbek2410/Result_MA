import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User, { UserRole } from '../models/User';
import Teacher from '../models/Teacher';
import Branch from '../models/Branch';

dotenv.config();

async function reassignTeacherBranch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/education_system');
    console.log('✅ MongoDB подключен\n');

    // Получаем все филиалы
    const branches = await Branch.find({ isActive: true });
    console.log('📍 Доступные филиалы:');
    branches.forEach((branch, index) => {
      console.log(`   ${index + 1}. ${branch.name} (ID: ${branch._id})`);
    });
    console.log('');

    // Получаем всех филиал админов
    const filAdmins = await User.find({ role: UserRole.FIL_ADMIN }).populate('branchId');
    console.log('👤 Филиал админы:');
    filAdmins.forEach((admin, index) => {
      const branch = admin.branchId as any;
      console.log(`   ${index + 1}. ${admin.username} - ${branch?.name || 'НЕТ ФИЛИАЛА'} (ID: ${admin.branchId})`);
    });
    console.log('');

    // Получаем всех учителей
    const teachers = await Teacher.find({}).populate('userId').populate('branchId');
    console.log('👨‍🏫 Учителя:');
    teachers.forEach((teacher, index) => {
      const branch = teacher.branchId as any;
      const user = teacher.userId as any;
      console.log(`   ${index + 1}. ${teacher.fullName} (${user?.username || 'N/A'})`);
      console.log(`      Текущий филиал: ${branch?.name || 'НЕТ'} (ID: ${teacher.branchId})`);
    });
    console.log('');

    // Проверяем несоответствия
    console.log('🔍 Проверка несоответствий...\n');
    
    for (const admin of filAdmins) {
      const adminBranchId = admin.branchId?.toString();
      console.log(`\n📋 Филиал админ: ${admin.username}`);
      console.log(`   Филиал админа: ${adminBranchId}`);
      
      const teachersInOtherBranches = teachers.filter(t => 
        t.branchId?.toString() !== adminBranchId
      );
      
      if (teachersInOtherBranches.length > 0) {
        console.log(`   ⚠️  Найдено ${teachersInOtherBranches.length} учителей в других филиалах:`);
        
        for (const teacher of teachersInOtherBranches) {
          const user = teacher.userId as any;
          console.log(`\n      👨‍🏫 ${teacher.fullName} (${user?.username})`);
          console.log(`         Текущий филиал: ${teacher.branchId}`);
          console.log(`         Нужный филиал: ${adminBranchId}`);
          
          // Переназначаем учителя
          teacher.branchId = admin.branchId as any;
          await teacher.save();
          
          // Также обновляем User
          if (user) {
            await User.findByIdAndUpdate(user._id, { branchId: admin.branchId });
          }
          
          console.log(`         ✅ ИСПРАВЛЕНО!`);
        }
      } else {
        console.log(`   ✅ Все учителя в правильном филиале`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ПЕРЕНАЗНАЧЕНИЕ ЗАВЕРШЕНО!');
    console.log('='.repeat(60));
    console.log('Теперь все учителя привязаны к филиалам своих админов');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

reassignTeacherBranch();
