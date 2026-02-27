/**
 * General-purpose Excel → Group sync script.
 * Add entries to CONFIGS array to sync any xlsx file to any group.
 *
 * Usage: npx tsx src/scripts/syncGroupsFromExcel.ts [groupId]
 *   - No args: runs all configs
 *   - groupId arg: runs only that group's config
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config();

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
interface SyncConfig {
  groupId: string;
  excelPath: string;  // absolute or relative to project root
  nameColIndex: number; // 0-based column index for student fullName
  startRow: number;     // 0-based row index to start reading names
  classNumber: number;  // default classNumber when creating new students
}

const SINFLAR = path.join(__dirname, '../../../sinflar');

const CONFIGS: SyncConfig[] = [
  // 8-sinf
  { groupId: '699c823ea4595bd49f4a8322', excelPath: path.join(SINFLAR, '8-inyaz.xlsx'),            nameColIndex: 1, startRow: 2, classNumber: 8 }, // 8-A Ijtimoiy
  { groupId: '699c8241a4595bd49f4a832c', excelPath: path.join(SINFLAR, '8A tibbiyot.xlsx'),        nameColIndex: 1, startRow: 2, classNumber: 8 }, // 8-A Tibbiyot
  { groupId: '699c8240a4595bd49f4a8327', excelPath: path.join(SINFLAR, '8-yuridk guruhi.xlsx'),    nameColIndex: 1, startRow: 2, classNumber: 8 }, // 8-A Yuridik
  { groupId: '699c8243a4595bd49f4a8336', excelPath: path.join(SINFLAR, '8-sinf B tibbiyot.xlsx'), nameColIndex: 1, startRow: 2, classNumber: 8 }, // 8-B Tibbiyot
  // 9-sinf
  { groupId: '699c8245a4595bd49f4a833b', excelPath: path.join(SINFLAR, '9-inyaz.xlsx'),            nameColIndex: 1, startRow: 2, classNumber: 9 }, // 9-A Ijtimoiy
  { groupId: '699c8246a4595bd49f4a8340', excelPath: path.join(SINFLAR, '9 A - iqtisod.xlsx'),     nameColIndex: 1, startRow: 2, classNumber: 9 }, // 9-A Iqtisod
  { groupId: '699c8248a4595bd49f4a8345', excelPath: path.join(SINFLAR, '9 texnika.xlsx'),          nameColIndex: 1, startRow: 2, classNumber: 9 }, // 9-A Texnika
  { groupId: '699c8249a4595bd49f4a834a', excelPath: path.join(SINFLAR, '9-sinf yuridik.xlsx'),    nameColIndex: 1, startRow: 2, classNumber: 9 }, // 9-A Yuridik
  { groupId: '699c824aa4595bd49f4a834f', excelPath: path.join(SINFLAR, '9-iqtisod B.xlsx'),       nameColIndex: 1, startRow: 2, classNumber: 9 }, // 9-B Iqtisod
  { groupId: '699c824ba4595bd49f4a8354', excelPath: path.join(SINFLAR, '9 iqtisod c.xlsx'),       nameColIndex: 1, startRow: 2, classNumber: 9 }, // 9-C Iqtisod
  // 10-sinf
  { groupId: '699c824ca4595bd49f4a8359', excelPath: path.join(SINFLAR, '10-inyaz.xlsx'),           nameColIndex: 1, startRow: 2, classNumber: 10 }, // 10-A Ijtimoiy
  { groupId: '699c824ea4595bd49f4a835e', excelPath: path.join(SINFLAR, '10-yuridik.xlsx'),         nameColIndex: 1, startRow: 2, classNumber: 10 }, // 10-A Yuridik
  // 11-sinf
  { groupId: '699c8250a4595bd49f4a8368', excelPath: path.join(SINFLAR, '11-yuridik.xlsx'),         nameColIndex: 1, startRow: 2, classNumber: 11 }, // 11-A Yuridik
  // 8-Iqtisod A (alohida fayl)
  { groupId: '699d8916d9a16fa13f325f20', excelPath: path.join(__dirname, '../../../8 Iqtisod A guruh (2).xlsx'), nameColIndex: 1, startRow: 2, classNumber: 8 },
];
// ──────────────────────────────────────────────────────────────────────────────

const Student = mongoose.model(
  'Student',
  new mongoose.Schema(
    {
      branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
      fullName: { type: String, required: true },
      classNumber: { type: Number, required: true },
      profileToken: { type: String, required: true, unique: true },
      studentCode: { type: Number },
    },
    { strict: false }
  ),
  'students'
);

const SG = mongoose.model('StudentGroup', new mongoose.Schema({}, { strict: false }), 'studentgroups');
const Group = mongoose.model('Group', new mongoose.Schema({}, { strict: false }), 'groups');

// Pre-loaded set of used codes for fast uniqueness check
const usedCodes = new Set<number>();

async function preloadUsedCodes(): Promise<void> {
  const docs = await Student.find({ studentCode: { $exists: true, $ne: null } }).select('studentCode').lean() as any[];
  docs.forEach((d: any) => usedCodes.add(d.studentCode));
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

async function syncGroup(cfg: SyncConfig): Promise<void> {
  const group = (await Group.findById(cfg.groupId).lean()) as any;
  if (!group) {
    console.error(`[${cfg.groupId}] Group not found — skipping`);
    return;
  }
  console.log(`\n=== ${group.name} (${cfg.groupId}) ===`);

  // Read Excel
  const wb = XLSX.readFile(cfg.excelPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
  const names = rows
    .slice(cfg.startRow)
    .map(r => r[cfg.nameColIndex]?.toString()?.trim())
    .filter(Boolean) as string[];
  console.log(`Excel names: ${names.length}`);

  // Clear existing group members
  const { deletedCount } = await SG.deleteMany({ groupId: new mongoose.Types.ObjectId(cfg.groupId) });
  console.log(`Cleared ${deletedCount} existing members`);

  let added = 0, found = 0, created = 0;

  for (const name of names) {
    const parts = name.split(' ');

    // Find existing student
    const candidates = (await Student.find({ fullName: { $regex: parts[0], $options: 'i' } })
      .select('_id fullName classNumber')
      .lean()) as any[];

    let student: any = null;
    if (candidates.length === 1) {
      student = candidates[0];
    } else if (candidates.length > 1) {
      if (parts[1]) {
        student = candidates.find(s => s.fullName.toLowerCase().includes(parts[1].toLowerCase()));
      }
      if (!student) student = candidates.find(s => s.classNumber === cfg.classNumber);
      if (!student) student = candidates[0];
    }

    if (!student) {
      const studentCode = generateUniqueStudentCode();
      student = await Student.create({
        branchId: group.branchId,
        fullName: name,
        classNumber: cfg.classNumber,
        profileToken: crypto.randomBytes(16).toString('hex'),
        studentCode,
      });
      console.log(`  CREATED: ${name}`);
      created++;
    } else {
      console.log(`  FOUND:   ${student.fullName} (cls ${student.classNumber})`);
      found++;
    }

    const result = await SG.updateOne(
      { studentId: student._id, groupId: new mongoose.Types.ObjectId(cfg.groupId) },
      { $setOnInsert: { studentId: student._id, groupId: new mongoose.Types.ObjectId(cfg.groupId) } },
      { upsert: true }
    );
    if (result.upsertedCount > 0) added++;
  }

  console.log(`Done: ${added} added | ${found} existing | ${created} created`);
}

const TEACHER_ID = '699d8915d9a16fa13f325f1f'; // test.teacher

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  await preloadUsedCodes();
  console.log(`Preloaded ${usedCodes.size} existing student codes`);

  const targetGroupId = process.argv[2];
  const configs = targetGroupId
    ? CONFIGS.filter(c => c.groupId === targetGroupId)
    : CONFIGS;

  if (configs.length === 0) {
    console.error('No matching config found for groupId:', targetGroupId);
    process.exit(1);
  }

  for (const cfg of configs) {
    await syncGroup(cfg);
    // Assign teacher to group
    await Group.updateOne(
      { _id: new mongoose.Types.ObjectId(cfg.groupId) },
      { $set: { teacherId: new mongoose.Types.ObjectId(TEACHER_ID) } }
    );
  }

  await mongoose.disconnect();
  console.log('\nAll done.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
