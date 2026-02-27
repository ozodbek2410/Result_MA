/**
 * Script to add random directions to students who don't have one
 * Usage: node scripts/addDirectionsToStudents.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

// Simple schemas for the script
const DirectionSchema = new mongoose.Schema({
  nameUzb: String,
  subjects: Array,
  isActive: Boolean,
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

const Direction = mongoose.model('Direction', DirectionSchema);
const Student = mongoose.model('Student', StudentSchema);

async function addDirectionsToStudents() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all active directions
    console.log('\n🔍 Fetching active directions...');
    const directions = await Direction.find({ isActive: true });
    
    if (directions.length === 0) {
      console.log('❌ No active directions found in database');
      process.exit(1);
    }

    console.log(`✅ Found ${directions.length} active directions:`);
    directions.forEach(dir => {
      console.log(`   - ${dir.nameUzb} (ID: ${dir._id})`);
    });

    // Get students without direction (for classes 7-11)
    console.log('\n🔍 Fetching students without direction (classes 7-11)...');
    const studentsWithoutDirection = await Student.find({
      directionId: { $exists: false },
      classNumber: { $gte: 7, $lte: 11 }
    });

    console.log(`✅ Found ${studentsWithoutDirection.length} students without direction`);

    if (studentsWithoutDirection.length === 0) {
      console.log('✅ All students already have directions assigned');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Assign random directions to students
    console.log('\n🔄 Assigning directions to students...');
    let updatedCount = 0;

    for (const student of studentsWithoutDirection) {
      // Pick a random direction
      const randomDirection = directions[Math.floor(Math.random() * directions.length)];
      
      // Update student
      await Student.updateOne(
        { _id: student._id },
        { $set: { directionId: randomDirection._id } }
      );

      updatedCount++;
      console.log(`   ✅ ${student.fullName} (${student.classNumber}-sinf) -> ${randomDirection.nameUzb}`);
    }

    console.log(`\n✅ Successfully updated ${updatedCount} students`);

    // Show summary
    console.log('\n📊 Summary:');
    for (const direction of directions) {
      const count = await Student.countDocuments({ directionId: direction._id });
      console.log(`   - ${direction.nameUzb}: ${count} students`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Done! Database connection closed.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
addDirectionsToStudents();
