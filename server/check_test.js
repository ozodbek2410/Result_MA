const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Subject");
  const Test = require("./dist/models/Test").default;
  const BT = require("./dist/models/BlockTest").default;

  const tid = "69ce34e04c2a0b8b38a59209";

  const bt = await BT.findById(tid).populate("subjectTests.subjectId", "nameUzb").lean();
  console.log("BlockTest:", bt ? "TOPILDI" : "YO'Q");
  if (bt) {
    console.log("  classNumber:", bt.classNumber);
    console.log("  period:", bt.periodMonth + "/" + bt.periodYear);
    console.log("  subjectTests:");
    (bt.subjectTests || []).forEach(st => {
      console.log("    " + st.subjectId?.nameUzb + " | questions: " + (st.questions?.length || 0));
    });
  }

  const t = await Test.findById(tid).populate("subjectId", "nameUzb").lean();
  console.log("\nTest:", t ? "TOPILDI" : "YO'Q");
  if (t) {
    console.log("  name:", t.name);
    console.log("  subjectId:", t.subjectId?.nameUzb, "(" + t.subjectId?._id + ")");
    console.log("  classNumber:", t.classNumber);
    console.log("  questions count:", t.questions?.length || 0);
    console.log("  first 2 questions:");
    (t.questions || []).slice(0, 2).forEach((q, i) => {
      const txt = typeof q.text === 'string' ? q.text : JSON.stringify(q.text);
      console.log("    [" + i + "] " + (txt || '').slice(0, 150));
    });
  }
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
