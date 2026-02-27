/**
 * Create "8 Iqtisod A" group from Excel file and add students
 * Usage: npx tsx src/scripts/create8IqtisodAGroup.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import * as path from 'path';
import Student from '../models/Student';
import Group from '../models/Group';
import Branch from '../models/Branch';
import StudentGroup from '../models/StudentGroup';

dotenv.config();

const EXCEL_PATH = path.join(__dirname, '../../../guruhlar/8 Iqtisod A guruh (2).xlsx');

const usedCodes = new Set<number>();

async function preloadUsedCodes(): Promise<void> {
  const docs = await Student.find({ studentCode: { $exists: true, $ne: null } }).select('studentCode').lean();
  docs.forEach((d) => usedCodes.add((d as { studentCode: number }).studentCode));
}

function generateUniqueStudentCode(): number {
  for (let i = 0; i < 100000; i++) {
    const code = Math.floor(10000 + Math.random() * 90000);
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  throw new Error('Could not generate unique studentCode');
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  await preloadUsedCodes();
  console.log(`Preloaded ${usedCodes.size} existing student codes`);

  // Get first active branch
  const branch = await Branch.findOne({ isActive: true });
  if (!branch) {
    console.error('No active branch found');
    process.exit(1);
  }
  console.log(`Branch: ${branch.name} (${branch._id})`);

  // Read Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
  const names = rows
    .map((r) => r[1]?.toString()?.trim())
    .filter(Boolean) as string[];
  console.log(`Excel: ${names.length} students`);

  // Create or find group
  const GROUP_NAME = '8 Iqtisod A';
  const CLASS_NUMBER = 8;
  const LETTER = 'A';

  let group = await Group.findOne({
    branchId: branch._id,
    name: GROUP_NAME,
  });

  if (!group) {
    group = await Group.create({
      branchId: branch._id,
      name: GROUP_NAME,
      classNumber: CLASS_NUMBER,
      letter: LETTER,
      capacity: names.length,
      isActive: true,
    });
    console.log(`Created group: ${group.name} (${group._id})`);
  } else {
    console.log(`Group exists: ${group.name} (${group._id})`);
  }

  // Clear existing group members
  const { deletedCount } = await StudentGroup.deleteMany({ groupId: group._id });
  if (deletedCount > 0) console.log(`Cleared ${deletedCount} existing members`);

  let created = 0;
  let found = 0;

  for (const name of names) {
    const parts = name.split(' ');

    // Try to find existing student
    const candidates = await Student.find({
      fullName: { $regex: parts[0], $options: 'i' },
      classNumber: CLASS_NUMBER,
    }).lean();

    let student: typeof candidates[0] | null = null;

    if (candidates.length === 1) {
      student = candidates[0];
    } else if (candidates.length > 1 && parts[1]) {
      student = candidates.find((s) =>
        s.fullName.toLowerCase().includes(parts[1].toLowerCase())
      ) || null;
    }

    if (!student) {
      const newStudent = await Student.create({
        branchId: branch._id,
        fullName: name,
        classNumber: CLASS_NUMBER,
        profileToken: crypto.randomBytes(16).toString('hex'),
        studentCode: generateUniqueStudentCode(),
        subjectIds: [],
        isActive: true,
      });
      student = newStudent.toObject();
      created++;
      console.log(`  CREATED: ${name}`);
    } else {
      found++;
      console.log(`  FOUND:   ${student.fullName}`);
    }

    await StudentGroup.updateOne(
      { studentId: student._id, groupId: group._id },
      { $setOnInsert: { studentId: student._id, groupId: group._id } },
      { upsert: true }
    );
  }

  console.log(`\nResult: ${created} created, ${found} found, ${names.length} total in group`);
  console.log(`Group ID: ${group._id}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
