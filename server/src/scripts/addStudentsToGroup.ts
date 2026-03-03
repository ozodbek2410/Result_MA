import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const GROUP_ID = '699d8916d9a16fa13f325f20';

const names = [
  "Abdurahmonov Muhammadali","Shomurodov Ulug'bek","Murodov Muhammadali","Sattorov Akromjon",
  "O'tkirov Botir","Husenov Sevinchbek","Sohibova Shohzodabegim","Teshayeva Kumush",
  "Ibodullayev Ulug'bek","Boltayev Asliddin","Buranov Timur","Sadulloyev Sanjar",
  "Avezova Marhabo","Muhammadov Azizbek","To'rayev Safarbek","Nutfullayeva Shabnam",
  "Saidova Sarvinoz","Erkinov Elyor","Muhammadov Muhammadsolih","Ismoilov Muhammadali",
  "Yo'ldoshev Ulug'bek","Ismatov Yodgorbek","To'ymurodov Behruz","Jo'rayev Umidjon",
  "Zaripov Behruz","Shuhratov Aslonjon","Hakimova Madina","Abdurahmonova Hilola",
  "Sayfullayev Javohir","Ismatov Hayotjon"
];

interface IStudent { _id: mongoose.Types.ObjectId; fullName: string; classNumber: number; }
const studentSchema = new mongoose.Schema<IStudent>({}, { strict: false });
const Student = mongoose.model<IStudent>('Student', studentSchema, 'students');

const sgSchema = new mongoose.Schema({}, { strict: false });
const StudentGroup = mongoose.model('StudentGroup', sgSchema, 'studentgroups');

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected');

  let added = 0, skipped = 0, notFound: string[] = [];

  for (const name of names) {
    const parts = name.split(' ');
    const students = await Student.find({ fullName: { $regex: parts[0], $options: 'i' } }).select('_id fullName classNumber').lean();
    
    let found: any = null;
    if (students.length === 1) {
      found = students[0];
    } else if (students.length > 1 && parts[1]) {
      found = students.find((s: any) => s.fullName.toLowerCase().includes(parts[1].toLowerCase()));
      if (!found) found = students[0];
    }

    if (!found) {
      console.log(`NOT FOUND: ${name}`);
      notFound.push(name);
      continue;
    }

    // Check if already in group
    const existing = await StudentGroup.findOne({ studentId: found._id, groupId: GROUP_ID }).lean();
    if (existing) {
      console.log(`SKIP (already): ${found.fullName}`);
      skipped++;
      continue;
    }

    await StudentGroup.create({ studentId: found._id, groupId: GROUP_ID });
    console.log(`ADDED: ${found.fullName} (${found._id})`);
    added++;
  }

  console.log(`\nDone: ${added} added, ${skipped} skipped, ${notFound.length} not found`);
  if (notFound.length) console.log('Not found:', notFound);
  await mongoose.disconnect();
}

run().catch(console.error);
