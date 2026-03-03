import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config();
const GROUP_ID = '699d8916d9a16fa13f325f20';
const EXCEL_PATH = path.join(__dirname, '../../../8 Iqtisod A guruh (2).xlsx');

const Student = mongoose.model('Student', new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  fullName: { type: String, required: true },
  classNumber: { type: Number, required: true },
  directionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Direction' },
  profileToken: { type: String, required: true, unique: true },
}, { strict: false }), 'students');

const SG = mongoose.model('StudentGroup', new mongoose.Schema({}, {strict:false}), 'studentgroups');
const Group = mongoose.model('Group', new mongoose.Schema({}, {strict:false}), 'groups');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);

  // 1. Get group info
  const group = await Group.findById(GROUP_ID).lean() as any;
  if (!group) { console.error('Group not found'); process.exit(1); }
  console.log('Group:', group.name, '| branchId:', group.branchId);

  // 2. Read Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const names: string[] = rows.slice(2).map(r => r[1]?.toString()?.trim()).filter(Boolean);
  console.log('Excel names:', names.length);

  // 3. Clear current group members
  const deleted = await SG.deleteMany({ groupId: new mongoose.Types.ObjectId(GROUP_ID) });
  console.log('Cleared', deleted.deletedCount, 'existing members');

  // 4. Find or create each student
  let added = 0, found = 0, created = 0;
  for (const name of names) {
    const parts = name.split(' ');
    const candidates = await Student.find({ fullName: { $regex: parts[0], $options: 'i' } })
      .select('_id fullName classNumber').lean() as any[];

    let student: any = null;
    if (candidates.length === 1) {
      student = candidates[0];
    } else if (candidates.length > 1 && parts[1]) {
      student = candidates.find((s: any) => s.fullName.toLowerCase().includes(parts[1].toLowerCase()));
      if (!student) student = candidates.find((s: any) => s.classNumber === 8);
      if (!student) student = candidates[0];
    }

    if (!student) {
      // Create new student with unique studentCode
      const token = crypto.randomBytes(16).toString('hex');
      let studentCode: number;
      let attempt = 0;
      do {
        studentCode = Math.floor(10000 + Math.random() * 90000);
        attempt++;
      } while (attempt < 100 && await Student.exists({ studentCode }));

      student = await Student.create({
        branchId: group.branchId,
        fullName: name,
        classNumber: 8,
        profileToken: token,
        studentCode,
      });
      console.log('CREATED:', name);
      created++;
    } else {
      console.log('FOUND:', student.fullName, '(cls', student.classNumber + ')');
      found++;
    }

    const sgResult = await SG.updateOne(
      { studentId: student._id, groupId: new mongoose.Types.ObjectId(GROUP_ID) },
      { $setOnInsert: { studentId: student._id, groupId: new mongoose.Types.ObjectId(GROUP_ID) } },
      { upsert: true }
    );
    if (sgResult.upsertedCount > 0) added++;
  }

  console.log(`\nDone: ${added} added to group | ${found} existing | ${created} newly created`);
  await mongoose.disconnect();
}
run().catch(console.error);
