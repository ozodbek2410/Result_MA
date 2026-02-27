/**
 * Script to fix direction subjects with correct IDs
 * Usage: node scripts/fixDirectionSubjects.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function fixDirections() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // Get all active subjects
    const subjects = await db.collection('subjects').find({ isActive: true }).toArray();
    console.log(`📚 Found ${subjects.length} active subjects:\n`);
    
    const subjectMap = {};
    subjects.forEach(subj => {
      console.log(`   - ${subj.nameUzb} (ID: ${subj._id})`);
      subjectMap[subj.nameUzb] = subj._id;
    });

    // Update Iqtisod direction
    console.log('\n\n🔄 Updating Iqtisod direction...');
    const iqtisodSubjects = [
      { type: 'single', subjectIds: [subjectMap['Matematika']] },
      { type: 'single', subjectIds: [subjectMap['Ingliz tili']] },
      { type: 'single', subjectIds: [subjectMap["O'zbek tili"]] },
      { type: 'single', subjectIds: [subjectMap['Tarix']] },
      { type: 'single', subjectIds: [subjectMap['Iqtisod']] }
    ].filter(s => s.subjectIds[0]); // Remove undefined subjects

    const iqtisodResult = await db.collection('directions').updateOne(
      { nameUzb: 'Iqtisod' },
      { $set: { subjects: iqtisodSubjects } }
    );
    console.log(`   ✅ Updated Iqtisod: ${iqtisodResult.modifiedCount} document(s)`);

    // Update Informatika direction
    console.log('\n🔄 Updating Informatika direction...');
    const informatikaSubjects = [
      { type: 'single', subjectIds: [subjectMap['Matematika']] },
      { type: 'single', subjectIds: [subjectMap['Ingliz tili']] },
      { type: 'single', subjectIds: [subjectMap["O'zbek tili"]] },
      { type: 'single', subjectIds: [subjectMap['Fizika']] },
      { type: 'single', subjectIds: [subjectMap['Informatika']] }
    ].filter(s => s.subjectIds[0]); // Remove undefined subjects

    const informatikaResult = await db.collection('directions').updateOne(
      { nameUzb: 'Informatika' },
      { $set: { subjects: informatikaSubjects } }
    );
    console.log(`   ✅ Updated Informatika: ${informatikaResult.modifiedCount} document(s)`);

    // Verify updates
    console.log('\n\n📊 Verification:');
    const directions = await db.collection('directions').find({ isActive: true }).toArray();
    
    for (const dir of directions) {
      console.log(`\n${dir.nameUzb}:`);
      for (const subjGroup of dir.subjects) {
        const subj = subjects.find(s => s._id.toString() === subjGroup.subjectIds[0].toString());
        if (subj) {
          console.log(`   ✅ ${subj.nameUzb}`);
        } else {
          console.log(`   ❌ Unknown subject: ${subjGroup.subjectIds[0]}`);
        }
      }
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

fixDirections();
