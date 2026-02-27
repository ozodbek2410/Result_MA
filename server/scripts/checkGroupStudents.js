/**
 * Script to check and display students in groups
 * Groups are linked to students via classNumber and subjectId
 * Usage: node scripts/checkGroupStudents.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

const GroupSchema = new mongoose.Schema({
  branchId: mongoose.Schema.Types.ObjectId,
  name: String,
  classNumber: Number,
  subjectId: mongoose.Schema.Types.ObjectId,
  letter: String,
  teacherId: mongoose.Schema.Types.ObjectId,
  capacity: Number,
  createdAt: Date
});

const StudentSchema = new mongoose.Schema({
  branchId: mongoose.Schema.Types.ObjectId,
  fullName: String,
  classNumber: Number,
  phone: String,
  directionId: mongoose.Schema.Types.ObjectId,
  subjectIds: [mongoose.Schema.Types.ObjectId],
  profileToken: String,
  isGraduated: Boolean,
  grades: Array,
  createdAt: Date
});

const SubjectSchema = new mongoose.Schema({
  nameUzb: String,
  nameRu: String,
  isMandatory: Boolean,
  isActive: Boolean
});

const Group = mongoose.model('Group', GroupSchema);
const Student = mongoose.model('Student', StudentSchema);
const Subject = mongoose.model('Subject', SubjectSchema);

async function checkGroupStudents() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all groups
    const groups = await Group.find().lean();
    console.log(`📚 Found ${groups.length} groups\n`);

    for (const group of groups) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📖 Group: ${group.name}`);
      console.log(`   Class: ${group.classNumber}${group.letter}`);
      console.log(`   Subject ID: ${group.subjectId}`);

      // Get subject name
      const subject = await Subject.findById(group.subjectId);
      if (subject) {
        console.log(`   Subject: ${subject.nameUzb} (${subject.nameRu})`);
      }

      // Find students in this class who have this subject
      const students = await Student.find({
        branchId: group.branchId,
        classNumber: group.classNumber,
        subjectIds: group.subjectId,
        isGraduated: false
      }).lean();

      console.log(`\n   👥 Students: ${students.length}`);
      
      if (students.length > 0) {
        console.log(`\n   Student list:`);
        students.forEach((student, idx) => {
          console.log(`      ${idx + 1}. ${student.fullName}`);
        });
      } else {
        console.log(`   ⚠️  No students found for this group`);
        
        // Check if there are students in this class at all
        const classStudents = await Student.find({
          branchId: group.branchId,
          classNumber: group.classNumber,
          isGraduated: false
        }).lean();
        
        console.log(`   ℹ️  Total students in class ${group.classNumber}: ${classStudents.length}`);
        
        if (classStudents.length > 0) {
          // Check if any have this subject
          const withSubject = classStudents.filter(s => 
            s.subjectIds && s.subjectIds.some(id => id.toString() === group.subjectId.toString())
          );
          console.log(`   ℹ️  Students with subject ${subject?.nameUzb}: ${withSubject.length}`);
        }
      }
    }

    console.log(`\n${'='.repeat(60)}\n`);

    // Summary
    console.log('📊 Summary:');
    const totalStudents = await Student.countDocuments({ isGraduated: false });
    console.log(`   Total students: ${totalStudents}`);
    console.log(`   Total groups: ${groups.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkGroupStudents();
