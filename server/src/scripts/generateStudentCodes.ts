import mongoose from 'mongoose';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(__dirname, '..', '..', '.env') });

import Student from '../models/Student';

async function generateStudentCodes() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  const students = await Student.find({
    $or: [{ studentCode: { $exists: false } }, { studentCode: null }],
  });

  console.log(`Found ${students.length} students without studentCode`);

  const existingCodes = new Set(
    (await Student.find({ studentCode: { $exists: true, $ne: null } }).select('studentCode').lean()).map(
      (s) => s.studentCode
    )
  );

  let updated = 0;
  for (const student of students) {
    let code: number;
    do {
      code = Math.floor(10000 + Math.random() * 90000);
    } while (existingCodes.has(code));

    existingCodes.add(code);
    await Student.updateOne({ _id: student._id }, { $set: { studentCode: code } });
    updated++;
    if (updated % 100 === 0) console.log(`  ${updated}/${students.length}...`);
  }

  console.log(`Done. Updated ${updated} students.`);
  process.exit(0);
}

generateStudentCodes().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
