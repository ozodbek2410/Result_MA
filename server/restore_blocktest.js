// O'chirilgan BlockTest'ni qayta tiklash — 29 yetim variantdan ma'lumot.
// Barcha savollar variant.shuffledQuestions ichida saqlangan, shu yerdan
// BlockTest.subjectTests[].questions ni qayta yig'amiz.
//
// Ishlatish:
//   node restore_blocktest.js          → dry-run
//   node restore_blocktest.js --apply  → haqiqiy tiklash

const mongoose = require("mongoose");
require("dotenv").config();

const APPLY = process.argv.includes("--apply");
const DELETED_TEST_ID = "69ce34e04c2a0b8b38a59209";

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Student");
  require("./dist/models/Subject");
  require("./dist/models/Branch");
  require("./dist/models/Group");
  require("./dist/models/User");
  const SV = require("./dist/models/StudentVariant").default;
  const BT = require("./dist/models/BlockTest").default;

  console.log("Rejim:", APPLY ? "HAQIQIY TIKLASH" : "DRY-RUN (o'zgartirmaydi)\n");

  // 1. Tiklanadigan BlockTest allaqachon bormi?
  const existing = await BT.findById(DELETED_TEST_ID).lean();
  if (existing) {
    console.log("⚠️ BlockTest allaqachon mavjud:", DELETED_TEST_ID);
    console.log("   Tiklashga hojat yo'q.");
    process.exit(0);
  }

  // 2. Yetim variantlarni olish
  const variants = await SV.find({ testId: DELETED_TEST_ID }).lean();
  if (variants.length === 0) {
    console.log("❌ Bu testId uchun variant topilmadi:", DELETED_TEST_ID);
    process.exit(1);
  }
  console.log(`✅ ${variants.length} ta yetim variant topildi`);

  // 3. Eng to'liq variantni asosiy deb tanlash (shuffledQuestions count max)
  const representative = variants.reduce((max, v) =>
    (v.shuffledQuestions?.length || 0) > (max.shuffledQuestions?.length || 0) ? v : max,
    variants[0]
  );
  console.log(`   Asosiy variant: ${representative.variantCode} (${representative.shuffledQuestions?.length} savol)`);

  // 4. subjectTests yig'ish — variant shuffledQuestions dan subject bo'yicha guruhlash
  // Eslatma: variantlar bir xil savollarni shuffle qilishgan, lekin "asl tartib"
  // noma'lum. Biz faqat subject va questions to'plamini ishlatamiz.
  const subjectMap = new Map();
  for (const q of representative.shuffledQuestions || []) {
    const sid = q.subjectId?._id?.toString() || q.subjectId?.toString();
    if (!sid) continue;
    if (!subjectMap.has(sid)) subjectMap.set(sid, []);
    subjectMap.get(sid).push({
      text: q.text,
      variants: q.variants,
      correctAnswer: q.correctAnswer,
      subjectId: sid,
      points: q.points || 1,
    });
  }
  const subjectTests = [...subjectMap.entries()].map(([sid, questions]) => ({
    subjectId: new mongoose.Types.ObjectId(sid),
    groupLetter: null,
    questions,
  }));

  console.log(`   Fanlar: ${subjectTests.length}, jami savol: ${subjectTests.reduce((s,st)=>s+st.questions.length,0)}`);
  subjectTests.forEach((st, i) => console.log(`     ${i+1}. subjectId: ${st.subjectId} | ${st.questions.length} savol`));

  // 5. classNumber va branchId ni student'lardan aniqlash
  const Student = require("./dist/models/Student").default;
  const stIds = [...new Set(variants.map(v => v.studentId.toString()))];
  const students = await Student.find({ _id: { $in: stIds } }).select("classNumber branchId").lean();
  const classCount = new Map();
  const branchCount = new Map();
  for (const s of students) {
    classCount.set(s.classNumber, (classCount.get(s.classNumber) || 0) + 1);
    const b = s.branchId?.toString();
    if (b) branchCount.set(b, (branchCount.get(b) || 0) + 1);
  }
  const classNumber = [...classCount.entries()].sort((a,b) => b[1]-a[1])[0][0];
  const branchId = [...branchCount.entries()].sort((a,b) => b[1]-a[1])[0][0];
  console.log(`   Aniqlangan classNumber: ${classNumber}, branchId: ${branchId}`);

  // 6. Sana — eng yangi variant createdAt ni ishlatamiz (test shundan biroz oldin yaratilgan)
  const latestDate = variants.reduce((max, v) => v.createdAt > max ? v.createdAt : max, variants[0].createdAt);
  const periodMonth = latestDate.getMonth() + 1;
  const periodYear = latestDate.getFullYear();

  // 7. createdBy — biror teacherId kerak. Ehtiyot uchun birinchi admin/teacher olamiz
  const User = require("./dist/models/User").default;
  const firstUser = await User.findOne({ role: { $in: ["TEACHER", "SUPER_ADMIN"] } })
    .select("teacherId _id").lean();
  const createdBy = firstUser?.teacherId || firstUser?._id;

  const btData = {
    _id: new mongoose.Types.ObjectId(DELETED_TEST_ID),
    branchId: new mongoose.Types.ObjectId(branchId),
    classNumber,
    date: latestDate,
    periodMonth,
    periodYear,
    subjectTests,
    studentConfigs: [],
    createdBy,
    createdAt: latestDate,
  };
  console.log("\n=== TIKLANADIGAN BlockTest ===");
  console.log({
    _id: btData._id.toString(),
    branchId: btData.branchId.toString(),
    classNumber: btData.classNumber,
    period: `${btData.periodMonth}/${btData.periodYear}`,
    date: btData.date,
    subjects: btData.subjectTests.length,
    totalQuestions: btData.subjectTests.reduce((s,st)=>s+st.questions.length,0),
  });

  if (!APPLY) {
    console.log("\n--- DRY-RUN: hech narsa yaratilmadi ---");
    console.log("Bajarish uchun: node restore_blocktest.js --apply");
    process.exit(0);
  }

  // 8. BlockTestni yaratish
  const newBt = new BT(btData);
  await newBt.save();
  console.log("\n✅ BlockTest tiklandi:", newBt._id);
  console.log("   Endi 29 ta variant o'z BlockTestiga bog'langan.");
  console.log("   Skanerlash endi to'g'ri fan nomi va test sarlavhasini ko'rsatadi.");
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
