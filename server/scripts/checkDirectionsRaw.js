/**
 * Script to check raw direction data
 * Usage: node scripts/checkDirectionsRaw.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function checkDirections() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // Get raw directions
    const directions = await db.collection('directions').find({ isActive: true }).toArray();
    
    console.log(`📚 Found ${directions.length} directions:\n`);
    
    directions.forEach((dir, idx) => {
      console.log(`\n${idx + 1}. ${dir.nameUzb} (ID: ${dir._id})`);
      console.log(`   Subjects array length: ${dir.subjects?.length || 0}`);
      
      if (dir.subjects && dir.subjects.length > 0) {
        dir.subjects.forEach((subj, i) => {
          console.log(`\n   Subject group ${i + 1}:`);
          console.log(`   - Type: ${subj.type}`);
          console.log(`   - SubjectIds: ${JSON.stringify(subj.subjectIds)}`);
          console.log(`   - SubjectIds count: ${subj.subjectIds?.length || 0}`);
        });
      } else {
        console.log('   ⚠️  NO SUBJECTS CONFIGURED!');
      }
    });

    // Also check subjects collection
    console.log('\n\n📚 Checking subjects collection:');
    const subjects = await db.collection('subjects').find({ isActive: true }).toArray();
    console.log(`   Found ${subjects.length} active subjects`);
    
    if (subjects.length > 0) {
      console.log('\n   Sample subjects:');
      subjects.slice(0, 5).forEach(subj => {
        console.log(`   - ${subj.nameUzb} (${subj.nameRu}) - ID: ${subj._id}`);
      });
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkDirections();
