const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Student");
  require("./dist/models/Subject");
  require("./dist/models/Group");
  require("./dist/models/Branch");
  const SV = require("./dist/models/StudentVariant").default;
  const BT = require("./dist/models/BlockTest").default;
  const Student = require("./dist/models/Student").default;
  const SG = require("./dist/models/StudentGroup").default;
  const STC = require("./dist/models/StudentTestConfig").default;
  const TR = require("./dist/models/TestResult").default;

  console.log("=".repeat(70));
  console.log("  5-SINF 01 TO'LIQ DIAGNOSTIKA");
  console.log("=".repeat(70));

  // 1. 5-sinf 01 guruh studentlari
  const Group = require("./dist/models/Group").default;
  const g01 = await Group.findOne({ name: /5.*01/i }).lean();
  if (!g01) { console.log("5-sinf 01 guruh topilmadi!"); process.exit(1); }
  console.log("\n1. GURUH:", g01.name, "| _id:", g01._id);

  const sgs = await SG.find({ groupId: g01._id }).lean();
  const uniqueSids = [...new Set(sgs.map(sg => sg.studentId.toString()))];
  console.log("   StudentGroup yozuvlari:", sgs.length, "| Unique studentlar:", uniqueSids.length);

  // 2. Har student uchun BARCHA variantlar (active + superseded)
  console.log("\n2. BARCHA VARIANTLAR (active + superseded)");
  const allVars = await SV.find({ studentId: { $in: uniqueSids } })
    .populate("shuffledQuestions.subjectId", "nameUzb")
    .sort({ createdAt: 1 })
    .lean();

  console.log("   Jami variant yozuvlari:", allVars.length);

  // Variant uzunlik taqsimoti
  const lenDist = {};
  const testIdDist = {};
  const supersededDist = { active: 0, superseded: 0 };
  for (const v of allVars) {
    const len = v.shuffledQuestions?.length || 0;
    lenDist[len] = (lenDist[len] || 0) + 1;
    const tid = v.testId?.toString() || "null";
    testIdDist[tid] = (testIdDist[tid] || 0) + 1;
    if (v.superseded) supersededDist.superseded++;
    else supersededDist.active++;
  }
  console.log("   Savol soni taqsimoti:", JSON.stringify(lenDist));
  console.log("   TestId taqsimoti:", JSON.stringify(testIdDist));
  console.log("   Active/Superseded:", JSON.stringify(supersededDist));

  // 3. Har bir testId haqida ma'lumot
  console.log("\n3. TESTID LAR HAQIDA");
  for (const tid of Object.keys(testIdDist)) {
    if (tid === "null") continue;
    const bt = await BT.findById(tid).populate("subjectTests.subjectId", "nameUzb").lean();
    if (bt) {
      const subs = bt.subjectTests?.map(st => (st.subjectId?.nameUzb || "?") + "(" + (st.groupLetter || "u") + "):" + (st.questions?.length || 0)).join(", ");
      console.log("   " + tid + " → MAVJUD: " + bt.classNumber + "-sinf " + bt.periodMonth + "/" + bt.periodYear + " | " + subs);
    } else {
      console.log("   " + tid + " → O'CHIRILGAN (DB da yo'q)");
    }
  }

  // 4. O'chirilgan test variantlari tafsiloti
  const deletedTestId = Object.keys(testIdDist).find(tid => {
    // o'chirilgan testId topish
    return tid !== "null";
  });
  console.log("\n4. ESKI VARIANTLAR TAFSILOTI (birinchi 3 ta)");
  const sampleVars = allVars.slice(0, 3);
  for (const v of sampleVars) {
    const s = await Student.findById(v.studentId).select("fullName").lean();
    console.log("   " + (s?.fullName || "?") + " | " + v.variantCode + " | " + (v.shuffledQuestions?.length || 0) + " savol | superseded:" + !!v.superseded + " | testId:" + v.testId);

    // Fan taqsimoti
    const subMap = {};
    for (const q of (v.shuffledQuestions || [])) {
      const name = q.subjectId?.nameUzb || q.subjectId?._id?.toString() || "?";
      subMap[name] = (subMap[name] || 0) + 1;
    }
    console.log("     Fanlar:", JSON.stringify(subMap));
  }

  // 5. StudentTestConfig — konfiguratsiya bormi
  console.log("\n5. STUDENTTESTCONFIG (5-sinf 01 studentlari)");
  const configs = await STC.find({ studentId: { $in: uniqueSids } })
    .populate("subjects.subjectId", "nameUzb")
    .lean();
  console.log("   Jami config:", configs.length);
  if (configs.length > 0) {
    const c = configs[0];
    const s = await Student.findById(c.studentId).select("fullName").lean();
    console.log("   Namuna (" + s?.fullName + "):");
    console.log("     totalQuestions:", c.totalQuestions);
    console.log("     subjects:", (c.subjects || []).map(sub =>
      (sub.subjectId?.nameUzb || "?") + "(" + (sub.groupLetter || "u") + "):" + sub.questionCount
    ).join(", "));
    console.log("     pointsConfig:", JSON.stringify(c.pointsConfig));
  }

  // 6. TestResult
  console.log("\n6. TESTRESULT (5-sinf 01 studentlari)");
  const results = await TR.find({ studentId: { $in: uniqueSids } }).lean();
  console.log("   Jami natijalar:", results.length);
  if (results.length > 0) {
    results.forEach(r => {
      console.log("   " + r.studentId + " | answers:" + (r.answers?.length || 0) + " | " + r.totalPoints + "/" + r.maxPoints + " (" + r.percentage + "%)");
    });
  }

  // 7. PM2 loglardan variant generate/delete history
  console.log("\n7. VARIANT YARATISH/O'CHIRISH TARIXI");
  console.log("   Birinchi variant yaratilgan:", allVars.length > 0 ? allVars[0].createdAt : "yo'q");
  console.log("   Oxirgi variant yaratilgan:", allVars.length > 0 ? allVars[allVars.length - 1].createdAt : "yo'q");

  // Superseded vaqtlari
  const supersededVars = allVars.filter(v => v.superseded && v.supersededAt);
  if (supersededVars.length > 0) {
    console.log("   Superseded qilingan variantlar:");
    supersededVars.forEach(v => console.log("     " + v.variantCode + " | supersededAt: " + v.supersededAt));
  } else {
    console.log("   Superseded qilingan variant yo'q");
  }

  // 8. Xulosa
  console.log("\n" + "=".repeat(70));
  console.log("  XULOSA");
  console.log("=".repeat(70));
  const activeVars = allVars.filter(v => !v.superseded);
  const has90 = activeVars.filter(v => (v.shuffledQuestions?.length || 0) >= 90);
  const has30 = activeVars.filter(v => (v.shuffledQuestions?.length || 0) === 30);
  console.log("  Aktiv variantlar:", activeVars.length);
  console.log("  90+ savolli:", has90.length);
  console.log("  30 savolli:", has30.length);
  console.log("  0 savolli:", activeVars.filter(v => !v.shuffledQuestions?.length).length);

  if (has30.length > 0 && has90.length === 0) {
    console.log("\n  ⚠️ MUAMMO: Barcha aktiv variantlar 30 savolli.");
    console.log("  Aslida 90 bo'lishi kerak (5 fan × (30+30+10+10+10)).");
    console.log("  60 ta savol yo'qolgan — variant generatsiyasi bug yoki");
    console.log("  BlockTest o'zgartirilganda variantlar qayta yozilgan.");
  }

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
