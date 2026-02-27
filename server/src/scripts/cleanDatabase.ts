import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Branch from '../models/Branch';
import Student from '../models/Student';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import Role from '../models/Role';
import Subject from '../models/Subject';
import Test from '../models/Test';
import TestResult from '../models/TestResult';
import BlockTest from '../models/BlockTest';
import StudentTestConfig from '../models/StudentTestConfig';
import StudentVariant from '../models/StudentVariant';
import Upload from '../models/Upload';

// Load .env from server directory
const envPath = process.cwd().includes('server') ? '.env' : './server/.env';
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function cleanDatabase() {
  try {
    console.log('🔌 MongoDB ga ulanish...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB ga ulandi\n');

    console.log('⚠️  ============= OGOHLANTIRISH =============');
    console.log('Bu script quyidagi ma\'lumotlarni o\'chiradi:');
    console.log('  ❌ Barcha filiallar');
    console.log('  ❌ Barcha filial adminlar');
    console.log('  ❌ Barcha o\'qituvchilar');
    console.log('  ❌ Barcha o\'quvchilar');
    console.log('  ❌ Barcha guruhlar');
    console.log('  ❌ Barcha testlar');
    console.log('  ❌ Barcha natijalar');
    console.log('  ❌ Barcha topshiriqlar');
    console.log('  ❌ Barcha konfiguratsiyalar');
    console.log('  ✅ Faqat SUPER_ADMIN va rollar qoladi');
    console.log('');

    // Hozirgi holatni ko'rsatish
    console.log('📊 ============= HOZIRGI HOLAT =============');
    const [
      usersCount,
      branchesCount,
      studentsCount,
      groupsCount,
      testsCount,
      resultsCount,
      configsCount
    ] = await Promise.all([
      User.countDocuments(),
      Branch.countDocuments(),
      Student.countDocuments(),
      Group.countDocuments(),
      Test.countDocuments(),
      TestResult.countDocuments(),
      StudentTestConfig.countDocuments()
    ]);

    console.log(`👥 Foydalanuvchilar: ${usersCount}`);
    console.log(`🏢 Filiallar: ${branchesCount}`);
    console.log(`🎓 O'quvchilar: ${studentsCount}`);
    console.log(`👥 Guruhlar: ${groupsCount}`);
    console.log(`📝 Testlar: ${testsCount}`);
    console.log(`📊 Natijalar: ${resultsCount}`);
    console.log(`⚙️  Konfiguratsiyalar: ${configsCount}`);
    console.log('');

    // Tasdiqlash
    console.log('⏳ 5 soniya kutilmoqda... (Ctrl+C bosib bekor qilishingiz mumkin)');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n🗑️  ============= TOZALASH BOSHLANDI =============\n');

    // 1. O'quvchilar bilan bog'liq ma'lumotlar
    console.log('🗑️  O\'quvchilar va ularning ma\'lumotlarini o\'chirish...');
    await StudentGroup.deleteMany({});
    console.log('  ✅ StudentGroup tozalandi');
    
    await StudentTestConfig.deleteMany({});
    console.log('  ✅ StudentTestConfig tozalandi');
    
    await StudentVariant.deleteMany({});
    console.log('  ✅ StudentVariant tozalandi');
    
    await Student.deleteMany({});
    console.log('  ✅ Student tozalandi');

    // 2. Test va natijalar
    console.log('\n🗑️  Testlar va natijalarni o\'chirish...');
    await TestResult.deleteMany({});
    console.log('  ✅ TestResult tozalandi');
    
    await Test.deleteMany({});
    console.log('  ✅ Test tozalandi');
    
    await BlockTest.deleteMany({});
    console.log('  ✅ BlockTest tozalandi');

    // 3. Guruhlar
    console.log('\n🗑️  Guruhlarni o\'chirish...');
    await Group.deleteMany({});
    console.log('  ✅ Group tozalandi');

    // 4. Foydalanuvchilar (SUPER_ADMIN dan tashqari)
    console.log('\n🗑️  Foydalanuvchilarni o\'chirish (SUPER_ADMIN dan tashqari)...');
    const deletedUsers = await User.deleteMany({ role: { $ne: 'SUPER_ADMIN' } });
    console.log(`  ✅ ${deletedUsers.deletedCount} ta foydalanuvchi o'chirildi`);

    // 5. Filiallar
    console.log('\n🗑️  Filiallarni o\'chirish...');
    await Branch.deleteMany({});
    console.log('  ✅ Branch tozalandi');

    // 6. Yuklangan fayllar
    console.log('\n🗑️  Yuklangan fayllarni o\'chirish...');
    await Upload.deleteMany({});
    console.log('  ✅ Upload tozalandi');

    // 7. Qolgan super adminlarni ko'rsatish
    console.log('\n✅ ============= QOLGAN MA\'LUMOTLAR =============');
    const superAdmins = await User.find({ role: 'SUPER_ADMIN' })
      .select('fullName username phone')
      .lean();
    
    console.log(`\n👑 Super Adminlar (${superAdmins.length} ta):`);
    superAdmins.forEach((admin, index) => {
      console.log(`  ${index + 1}. ${admin.fullName || admin.username}`);
      console.log(`     Username: ${admin.username}`);
      console.log(`     Phone: ${admin.phone || 'Yo\'q'}`);
    });

    const roles = await Role.find().select('name').lean();
    console.log(`\n📋 Rollar (${roles.length} ta):`);
    roles.forEach((role, index) => {
      console.log(`  ${index + 1}. ${role.name}`);
    });

    const subjects = await Subject.find().select('nameUzb').lean();
    console.log(`\n📚 Fanlar (${subjects.length} ta):`);
    subjects.forEach((subject, index) => {
      console.log(`  ${index + 1}. ${subject.nameUzb}`);
    });

    // Yakuniy statistika
    console.log('\n📊 ============= YAKUNIY STATISTIKA =============');
    const [
      finalUsersCount,
      finalBranchesCount,
      finalStudentsCount,
      finalGroupsCount,
      finalTestsCount,
      finalResultsCount
    ] = await Promise.all([
      User.countDocuments(),
      Branch.countDocuments(),
      Student.countDocuments(),
      Group.countDocuments(),
      Test.countDocuments(),
      TestResult.countDocuments()
    ]);

    console.log(`👥 Foydalanuvchilar: ${finalUsersCount} (faqat SUPER_ADMIN)`);
    console.log(`🏢 Filiallar: ${finalBranchesCount}`);
    console.log(`🎓 O'quvchilar: ${finalStudentsCount}`);
    console.log(`👥 Guruhlar: ${finalGroupsCount}`);
    console.log(`📝 Testlar: ${finalTestsCount}`);
    console.log(`📊 Natijalar: ${finalResultsCount}`);
    console.log(`📋 Rollar: ${roles.length}`);
    console.log(`📚 Fanlar: ${subjects.length}`);

    console.log('\n✅ Database muvaffaqiyatli tozalandi!');
    console.log('💡 Endi yangi filiallar, adminlar va o\'qituvchilar qo\'shishingiz mumkin.');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Xatolik:', error);
    process.exit(1);
  }
}

// Scriptni ishga tushirish
console.log('⚠️  ============= DATABASE TOZALASH =============');
console.log('Bu script database\'ni tozalaydi va faqat SUPER_ADMIN qoldiradi!');
console.log('');

cleanDatabase();
