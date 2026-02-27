import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../models/Student';
import Group from '../models/Group';
import Branch from '../models/Branch';
import Subject from '../models/Subject';

dotenv.config();

/**
 * O'quvchilarni qayta yaratish skripti
 * - Barcha eski o'quvchilarni o'chiradi
 * - Har bir guruh uchun 20 tadan yangi o'quvchi yaratadi
 */
async function recreateStudents() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma');
    console.log('✅ Connected to MongoDB');

    // 1. Barcha eski o'quvchilarni o'chirish
    console.log('\n🗑️  Deleting all existing students...');
    const deleteResult = await Student.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} students`);

    // 2. Barcha guruhlarni olish
    console.log('\n📚 Loading groups...');
    const groups = await Group.find().lean();
    
    console.log(`✅ Found ${groups.length} groups`);

    if (groups.length === 0) {
      console.log('⚠️  No groups found. Please create groups first.');
      return;
    }

    // 3. Har bir guruh uchun 20 tadan o'quvchi yaratish
    console.log('\n👥 Creating 20 students for each group...');
    
    let totalCreated = 0;
    
    for (const group of groups) {
      const groupName = `${group.classNumber}-${group.letter}`;
      
      console.log(`\n📝 Creating students for: ${groupName}`);
      
      const students = [];
      
      for (let i = 1; i <= 20; i++) {
        const studentNumber = i.toString().padStart(2, '0');
        
        // Generate unique profile token
        const profileToken = `${group.classNumber}${group.letter}${studentNumber}${Date.now()}`.toLowerCase();
        
        students.push({
          fullName: `O'quvchi ${studentNumber} (${groupName})`,
          classNumber: group.classNumber,
          groupId: group._id,
          branchId: group.branchId,
          phoneNumber: `+998901234${studentNumber}${group.classNumber}`,
          parentPhone: `+998901234${studentNumber}${group.classNumber}`,
          profileToken,
          // Yo'nalish (direction) - ixtiyoriy
          directionId: null,
        });
      }
      
      // Bulk insert
      const created = await Student.insertMany(students);
      totalCreated += created.length;
      
      console.log(`  ✅ Created ${created.length} students for ${groupName}`);
    }

    console.log(`\n🎉 Successfully created ${totalCreated} students across ${groups.length} groups!`);
    console.log(`📊 Average: ${Math.round(totalCreated / groups.length)} students per group`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run script
recreateStudents()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
