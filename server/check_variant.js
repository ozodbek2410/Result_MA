const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Student");
  require("./dist/models/Subject");
  const SV = require("./dist/models/StudentVariant").default;
  const BT = require("./dist/models/BlockTest").default;

  const codes = ["67FFAE43", "25C7E1BC"];

  for (const code of codes) {
    console.log("\n====", code, "====");
    const v = await SV.findOne({ variantCode: new RegExp("^" + code + "$", "i") })
      .populate("studentId", "fullName")
      .populate("shuffledQuestions.subjectId", "nameUzb")
      .lean();

    if (!v) { console.log("TOPILMADI"); continue; }

    console.log("Student:", v.studentId?.fullName);
    console.log("testId:", v.testId);
    console.log("shuffledQuestions count:", v.shuffledQuestions?.length || 0);

    const subjMap = new Map();
    (v.shuffledQuestions || []).forEach((q) => {
      const sid = q.subjectId?._id?.toString() || q.subjectId?.toString() || 'UNKNOWN';
      const name = q.subjectId?.nameUzb || 'NO NAME';
      const key = sid + '|' + name;
      subjMap.set(key, (subjMap.get(key) || 0) + 1);
    });
    console.log("Fanlar shuffledQuestions ichida:");
    subjMap.forEach((cnt, key) => console.log("  " + key + " => " + cnt + " savol"));

    console.log("certSubjects:", JSON.stringify(v.certSubjects));

    const bt = await BT.findById(v.testId).populate("subjectTests.subjectId", "nameUzb").lean();
    if (bt) {
      console.log("BlockTest fanlari:");
      (bt.subjectTests || []).forEach(st => {
        console.log("  " + st.subjectId?.nameUzb + " => " + (st.questions?.length || 0) + " savol");
      });
    }
  }
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
