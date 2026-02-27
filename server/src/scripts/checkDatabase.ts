import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Branch from '../models/Branch';
import Student from '../models/Student';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import Role from '../models/Role';
import Subject from '../models/Subject';

// Load .env from server directory
const envPath = process.cwd().includes('server') ? '.env' : './server/.env';
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function checkDatabase() {
  try {
    console.log('🔌 MongoDB ga ulanish...');
    console.log('URI:', MONGODB_URI.substring(0, 30) + '...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB ga ulandi\n');

    // ============= ROLLAR =============
    console.log('📋 ============= ROLLAR =============');
    const roles = await Role.find().lean();
    console.log(`Jami rollar: ${roles.length}`);
    roles.forEach(role => {
      console.log(`  - ${role.name} (${role.permissions?.length || 0} ta ruxsat)`);
    });
    console.log('');

    // ============= FILIALLAR =============
    console.log('🏢 ============= FILIALLAR =============');
    const branches = await Branch.find().lean();
    console.log(`Jami filiallar: ${branches.length}`);
    branches.forEach(branch => {
      console.log(`  📍 ${branch.name} - ${branch.location || 'Manzil ko\'rsatilmagan'}`);
    });
    console.log('');

    // ============= SUPER ADMINLAR =============
    console.log('👑 ============= SUPER ADMINLAR =============');
    const superAdmins = await User.find({ role: 'SUPER_ADMIN' })
      .select('fullName username phone createdAt')
      .lean();
    console.log(`Jami Super Adminlar: ${superAdmins.length}`);
    superAdmins.forEach((admin, index) => {
      console.log(`\n  ${index + 1}. ${admin.fullName}`);
      console.log(`     Username: ${admin.username}`);
      console.log(`     Phone: ${admin.phone || 'Yo\'q'}`);
      console.log(`     Yaratilgan: ${new Date(admin.createdAt).toLocaleDateString('uz-UZ')}`);
    });
    console.log('');

    // ============= FILIAL ADMINLAR =============
    console.log('🏛️  ============= FILIAL ADMINLAR =============');
    const branchAdmins = await User.find({ role: 'BRANCH_ADMIN' })
      .populate('branchId', 'name location')
      .select('fullName username phone email branchId createdAt')
      .lean();
    console.log(`Jami Filial Adminlar: ${branchAdmins.length}`);
    
    if (branchAdmins.length === 0) {
      console.log('  ⚠️  Filial adminlar topilmadi!');
    } else {
      branchAdmins.forEach((admin: any, index) => {
        console.log(`\n  ${index + 1}. ${admin.fullName}`);
        console.log(`     Username: ${admin.username}`);
        console.log(`     Phone: ${admin.phone || 'Yo\'q'}`);
        console.log(`     Email: ${admin.email || 'Yo\'q'}`);
        console.log(`     Filial: ${admin.branchId?.name || '❌ Filial tayinlanmagan!'}`);
        if (admin.branchId?.location) {
          console.log(`     Manzil: ${admin.branchId.location}`);
        }
        console.log(`     Yaratilgan: ${new Date(admin.createdAt).toLocaleDateString('uz-UZ')}`);
      });
    }
    console.log('');

    // ============= O'QITUVCHILAR =============
    console.log('👨‍🏫 ============= O\'QITUVCHILAR =============');
    const teachers = await User.find({ role: 'TEACHER' })
      .populate('branchId', 'name location')
      .select('fullName username phone email branchId createdAt')
      .lean();
    console.log(`Jami O'qituvchilar: ${teachers.length}`);
    
    if (teachers.length === 0) {
      console.log('  ⚠️  O\'qituvchilar topilmadi!');
    } else {
      // Filial bo'yicha guruhlash
      const teachersByBranch = new Map<string, any[]>();
      teachers.forEach((teacher: any) => {
        const branchName = teacher.branchId?.name || 'Filial tayinlanmagan';
        if (!teachersByBranch.has(branchName)) {
          teachersByBranch.set(branchName, []);
        }
        teachersByBranch.get(branchName)!.push(teacher);
      });

      teachersByBranch.forEach((branchTeachers, branchName) => {
        console.log(`\n  📍 ${branchName} (${branchTeachers.length} ta o'qituvchi)`);
        branchTeachers.forEach((teacher, index) => {
          console.log(`\n    ${index + 1}. ${teacher.fullName}`);
          console.log(`       Username: ${teacher.username}`);
          console.log(`       Phone: ${teacher.phone || 'Yo\'q'}`);
          console.log(`       Email: ${teacher.email || 'Yo\'q'}`);
          console.log(`       Yaratilgan: ${new Date(teacher.createdAt).toLocaleDateString('uz-UZ')}`);
        });
      });
    }
    console.log('');

    // ============= GURUHLAR =============
    console.log('👥 ============= GURUHLAR =============');
    const groups = await Group.find().lean();
    console.log(`Jami guruhlar: ${groups.length}`);
    
    if (groups.length === 0) {
      console.log('  ⚠️  Guruhlar topilmadi!');
    } else {
      // Filial bo'yicha guruhlash
      const groupsByBranch = new Map<string, any[]>();
      
      for (const group of groups) {
        const branch = await Branch.findById(group.branchId).lean();
        const branchName = branch?.name || 'Filial tayinlanmagan';
        
        if (!groupsByBranch.has(branchName)) {
          groupsByBranch.set(branchName, []);
        }
        groupsByBranch.get(branchName)!.push(group);
      }

      for (const [branchName, branchGroups] of groupsByBranch) {
        console.log(`\n  📍 ${branchName} (${branchGroups.length} ta guruh)`);
        
        for (const group of branchGroups) {
          const studentCount = await StudentGroup.countDocuments({ groupId: group._id });
          const teacher = group.teacherId ? await User.findById(group.teacherId).select('fullName').lean() : null;
          const subject = group.subjectId ? await Subject.findById(group.subjectId).select('nameUzb').lean() : null;
          
          console.log(`\n    📚 ${group.name}`);
          console.log(`       Sinf: ${group.classNumber}-${group.letter}`);
          console.log(`       Fan: ${subject?.nameUzb || 'Yo\'q'}`);
          console.log(`       O'qituvchi: ${teacher?.fullName || '❌ Tayinlanmagan'}`);
          console.log(`       O'quvchilar: ${studentCount} ta`);
          console.log(`       Sig'im: ${group.capacity || 20} ta`);
        }
      }
    }
    console.log('');

    // ============= O'QUVCHILAR =============
    console.log('🎓 ============= O\'QUVCHILAR =============');
    const students = await Student.find()
      .select('fullName phone parentPhone branchId createdAt')
      .lean();
    console.log(`Jami o'quvchilar: ${students.length}`);
    
    if (students.length === 0) {
      console.log('  ⚠️  O\'quvchilar topilmadi!');
    } else {
      // Filial bo'yicha guruhlash
      const studentsByBranch = new Map<string, any[]>();
      
      for (const student of students) {
        const branch = await Branch.findById(student.branchId).lean();
        const branchName = branch?.name || 'Filial tayinlanmagan';
        
        if (!studentsByBranch.has(branchName)) {
          studentsByBranch.set(branchName, []);
        }
        studentsByBranch.get(branchName)!.push(student);
      }

      for (const [branchName, branchStudents] of studentsByBranch) {
        console.log(`\n  📍 ${branchName} (${branchStudents.length} ta o'quvchi)`);
        
        // Faqat birinchi 5 ta o'quvchini ko'rsatish (juda ko'p bo'lsa)
        const displayCount = Math.min(5, branchStudents.length);
        for (let i = 0; i < displayCount; i++) {
          const student = branchStudents[i];
          const studentGroups = await StudentGroup.find({ studentId: student._id }).lean();
          const groupNames = [];
          
          for (const sg of studentGroups) {
            const group = await Group.findById(sg.groupId).select('name').lean();
            if (group) groupNames.push(group.name);
          }
          
          console.log(`\n    ${i + 1}. ${student.fullName}`);
          console.log(`       Phone: ${student.phone || 'Yo\'q'}`);
          console.log(`       Ota-ona: ${student.parentPhone || 'Yo\'q'}`);
          console.log(`       Guruhlar: ${groupNames.length > 0 ? groupNames.join(', ') : 'Yo\'q'}`);
          console.log(`       Yaratilgan: ${new Date(student.createdAt).toLocaleDateString('uz-UZ')}`);
        }
        
        if (branchStudents.length > displayCount) {
          console.log(`\n    ... va yana ${branchStudents.length - displayCount} ta o'quvchi`);
        }
      }
    }
    console.log('');

    // ============= UMUMIY STATISTIKA =============
    console.log('📊 ============= UMUMIY STATISTIKA =============');
    console.log(`👑 Super Adminlar: ${superAdmins.length}`);
    console.log(`🏛️  Filial Adminlar: ${branchAdmins.length}`);
    console.log(`👨‍🏫 O'qituvchilar: ${teachers.length}`);
    console.log(`🎓 O'quvchilar: ${students.length}`);
    console.log(`🏢 Filiallar: ${branches.length}`);
    console.log(`👥 Guruhlar: ${groups.length}`);
    console.log(`📋 Rollar: ${roles.length}`);
    console.log('');

    // ============= MUAMMOLAR =============
    console.log('⚠️  ============= MUAMMOLAR =============');
    const issues: string[] = [];

    // Filial tayinlanmagan adminlar
    const adminsWithoutBranch = branchAdmins.filter((admin: any) => !admin.branchId);
    if (adminsWithoutBranch.length > 0) {
      issues.push(`❌ ${adminsWithoutBranch.length} ta filial admin filialsiz`);
    }

    // Filial tayinlanmagan o'qituvchilar
    const teachersWithoutBranch = teachers.filter((teacher: any) => !teacher.branchId);
    if (teachersWithoutBranch.length > 0) {
      issues.push(`❌ ${teachersWithoutBranch.length} ta o'qituvchi filialsiz`);
    }

    // O'qituvchisiz guruhlar
    const groupsWithoutTeacher = groups.filter((group: any) => !group.teacherId);
    if (groupsWithoutTeacher.length > 0) {
      issues.push(`⚠️  ${groupsWithoutTeacher.length} ta guruh o'qituvchisiz`);
    }

    // O'quvchisiz guruhlar
    for (const group of groups) {
      const studentCount = await StudentGroup.countDocuments({ groupId: group._id });
      if (studentCount === 0) {
        issues.push(`⚠️  "${group.name}" guruhida o'quvchilar yo'q`);
      }
    }

    if (issues.length === 0) {
      console.log('✅ Muammolar topilmadi!');
    } else {
      issues.forEach(issue => console.log(`  ${issue}`));
    }
    console.log('');

    console.log('✅ Tekshirish tugadi!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

checkDatabase();
