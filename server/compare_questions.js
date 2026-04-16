const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Subject");
  const SV = require("./dist/models/StudentVariant").default;
  const BT = require("./dist/models/BlockTest").default;

  console.log("=== Variant 25C7E1BC namuna savollari ===");
  const v = await SV.findOne({ variantCode: /^25C7E1BC$/i }).lean();
  v.shuffledQuestions.slice(0, 5).forEach((q, i) => {
    console.log("  " + (i+1) + ". " + (q.text || "").slice(0, 150));
    console.log("     correct: " + q.correctAnswer + " | variants: " + JSON.stringify((q.variants||[]).map(x=>x.letter + ":" + (x.text||"").slice(0,20))));
  });

  const btB = await BT.findById("69ce3d88405b1f08730c3d53").lean();

  console.log("\n=== B Ingliz tili C: 3 ta ===");
  const inglizC = btB.subjectTests.find(st => st.groupLetter === "C");
  (inglizC?.questions || []).slice(0, 3).forEach((q, i) => {
    console.log("  " + (i+1) + ". " + (q.text || "").slice(0, 150));
  });

  console.log("\n=== B Ingliz tili D: 3 ta ===");
  const inglizD = btB.subjectTests.find(st => st.groupLetter === "D");
  (inglizD?.questions || []).slice(0, 3).forEach((q, i) => {
    console.log("  " + (i+1) + ". " + (q.text || "").slice(0, 150));
  });

  // Fuzzy match — variant savolining bir qismi B ning qaysi savolida bor
  console.log("\n=== Fuzzy match ===");
  let anyMatch = false;
  for (const vq of v.shuffledQuestions) {
    const vt = (vq.text || "").trim();
    if (vt.length < 15) continue;
    const firstPart = vt.slice(0, 25);
    for (const st of btB.subjectTests) {
      for (const bq of (st.questions || [])) {
        const bt = (bq.text || "").trim();
        if (bt.includes(firstPart)) {
          console.log("MATCH: variant['" + vt.slice(0, 50) + "'] → B." + st.groupLetter + "[" + bt.slice(0, 50) + "]");
          anyMatch = true;
          break;
        }
      }
      if (anyMatch) break;
    }
    if (anyMatch) break;
  }
  if (!anyMatch) console.log("Hech qanday fuzzy match topilmadi — variant va B butunlay boshqa savollar.");

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
