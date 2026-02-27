import mongoose from 'mongoose';
import Student from '../models/Student';
import { connectDB } from '../config/database';

async function fixMissingProfileTokens() {
  try {
    await connectDB();
    console.log('Connected to database');

    // Find students without profileToken
    const studentsWithoutToken = await Student.find({
      $or: [
        { profileToken: { $exists: false } },
        { profileToken: null },
        { profileToken: '' }
      ]
    });

    console.log(`Found ${studentsWithoutToken.length} students without profileToken`);

    if (studentsWithoutToken.length === 0) {
      console.log('All students have profileToken. No action needed.');
      process.exit(0);
    }

    // Update each student with a new profileToken
    for (const student of studentsWithoutToken) {
      const newToken = Math.random().toString(36).substring(2, 15) + 
                       Math.random().toString(36).substring(2, 15);
      
      student.profileToken = newToken;
      await student.save();
      
      console.log(`✓ Updated ${student.fullName} with token: ${newToken}`);
    }

    console.log(`\n✅ Successfully updated ${studentsWithoutToken.length} students`);
    process.exit(0);
  } catch (error) {
    console.error('Error fixing profile tokens:', error);
    process.exit(1);
  }
}

fixMissingProfileTokens();
