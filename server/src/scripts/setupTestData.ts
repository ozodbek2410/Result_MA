import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Branch from '../models/Branch';
import Subject from '../models/Subject';
import Group from '../models/Group';
import Student from '../models/Student';
import User from '../models/User';
import bcrypt from 'bcryptjs';

// Load environment variables
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function setupTestData() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Branch.deleteMany({}),
      Subject.deleteMany({}),
      Group.deleteMany({}),
      Student.deleteMany({}),
    ]);
    console.log('✅ Data cleared\n');

    // Create branch
    console.log('📍 Creating branch...');
    const branch = await Branch.create({
      name: 'Test Filial',
      location: 'Toshkent, O\'zbekiston',
      isActive: true,
    });
    console.log(`✅ Branch created: ${branch.name}\n`);

    // Create subjects
    console.log('📚 Creating subjects...');
    const subjects = await Subject.insertMany([
      { nameUzb: 'Matematika', isMandatory: true, isActive: true },
      { nameUzb: 'Fizika', isMandatory: true, isActive: true },
      { nameUzb: 'Kimyo', isMandatory: false, isActive: true },
      { nameUzb: 'Biologiya', isMandatory: false, isActive: true },
      { nameUzb: 'Ingliz tili', isMandatory: false, isActive: true },
      { nameUzb: 'Tabiiy fan', isMandatory: false, isActive: true },
    ]);
    console.log(`✅ Created ${subjects.length} subjects\n`);

    // Create teacher user
    console.log('👨‍🏫 Creating teacher...');
    const hashedPassword = await bcrypt.hash('teacher123', 10);
    const teacher = await User.create({
      username: 'teacher',
      password: hashedPassword,
      fullName: 'Test Teacher',
      role: 'TEACHER',
      branchId: branch._id,
      phone: '+998901234567',
    });
    console.log(`✅ Teacher created: ${teacher.username} / teacher123\n`);

    // Create 2 groups
    console.log('👥 Creating groups...');
    const group1 = await Group.create({
      name: '7-A sinf',
      branchId: branch._id,
      subjectId: subjects[0]._id, // Matematika
      teacherId: teacher._id,
      classNumber: 7,
      letter: 'A', // ОБЯЗАТЕЛЬНОЕ ПОЛЕ!
      capacity: 20,
    });

    const group2 = await Group.create({
      name: '8-B sinf',
      branchId: branch._id,
      subjectId: subjects[1]._id, // Fizika
      teacherId: teacher._id,
      classNumber: 8,
      letter: 'B', // ОБЯЗАТЕЛЬНОЕ ПОЛЕ!
      capacity: 20,
    });
    console.log(`✅ Created 2 groups: ${group1.name}, ${group2.name}\n`);

    // Create 15 students (7-8 per group)
    console.log('👨‍🎓 Creating students...');
    const students = [];

    // Group 1 students (8 students)
    for (let i = 1; i <= 8; i++) {
      const student = await Student.create({
        fullName: `O'quvchi ${i} (7-A)`,
        phone: `+99890123${String(i).padStart(4, '0')}`,
        classNumber: 7,
        branchId: branch._id,
        subjectIds: [subjects[0]._id], // ПРАВИЛЬНОЕ ИМЯ ПОЛЯ!
        profileToken: `student-7a-${i}`,
        isGraduated: false,
      });
      students.push(student);
    }

    // Group 2 students (7 students)
    for (let i = 9; i <= 15; i++) {
      const student = await Student.create({
        fullName: `O'quvchi ${i} (8-B)`,
        phone: `+99890123${String(i).padStart(4, '0')}`,
        classNumber: 8,
        branchId: branch._id,
        subjectIds: [subjects[1]._id], // ПРАВИЛЬНОЕ ИМЯ ПОЛЯ!
        profileToken: `student-8b-${i}`,
        isGraduated: false,
      });
      students.push(student);
    }

    console.log(`✅ Created ${students.length} students\n`);

    // Update groups with students
    // Note: Groups don't have a 'students' field in the schema
    // Students are linked to groups through other means
    console.log('✅ Students created and ready\n');

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('✅ TEST DATA SETUP COMPLETE!');
    console.log('═══════════════════════════════════════');
    console.log('\n📊 Summary:');
    console.log(`   • Branch: ${branch.name}`);
    console.log(`   • Subjects: ${subjects.length}`);
    console.log(`   • Groups: 2 (${group1.name}, ${group2.name})`);
    console.log(`   • Students: ${students.length}`);
    console.log(`   • Teacher: ${teacher.username}`);
    console.log('\n🔑 Login credentials:');
    console.log(`   Username: teacher`);
    console.log(`   Password: teacher123`);
    console.log('\n🌐 Access:');
    console.log(`   URL: http://localhost:9998/teacher`);
    console.log('═══════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setupTestData();
