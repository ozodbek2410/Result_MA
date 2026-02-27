/**
 * Script to view all directions with their subjects
 * Usage: node scripts/viewDirections.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

const DirectionSchema = new mongoose.Schema({
  nameUzb: String,
  subjects: [{
    type: { type: String, enum: ['single', 'choice'] },
    subjectIds: [mongoose.Schema.Types.ObjectId]
  }],
  isActive: Boolean,
  createdAt: Date
});

const SubjectSchema = new mongoose.Schema({
  nameUzb: String,
  nameRu: String,
  isMandatory: Boolean,
  isActive: Boolean
});

const Direction = mongoose.model('Direction', DirectionSchema);
const Subject = mongoose.model('Subject', SubjectSchema);

async function viewDirections() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const directions = await Direction.find({ isActive: true });
    
    console.log(`📚 Found ${directions.length} active directions:\n`);

    for (const direction of directions) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📖 Direction: ${direction.nameUzb}`);
      console.log(`   ID: ${direction._id}`);
      console.log(`   Created: ${direction.createdAt}`);
      console.log(`\n   Subjects configuration:`);

      for (let i = 0; i < direction.subjects.length; i++) {
        const subjectGroup = direction.subjects[i];
        console.log(`\n   ${i + 1}. Type: ${subjectGroup.type.toUpperCase()}`);
        
        // Get subject details
        const subjects = await Subject.find({
          _id: { $in: subjectGroup.subjectIds }
        });

        subjects.forEach((subject, idx) => {
          const mandatory = subject.isMandatory ? '⭐ (Majburiy)' : '';
          console.log(`      ${idx + 1}) ${subject.nameUzb} (${subject.nameRu}) ${mandatory}`);
        });

        if (subjectGroup.type === 'choice') {
          console.log(`      → O'quvchi bu guruhdan 1 ta fan tanlaydi`);
        }
      }
    }

    console.log(`\n${'='.repeat(60)}\n`);

    await mongoose.connection.close();
    console.log('✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

viewDirections();
