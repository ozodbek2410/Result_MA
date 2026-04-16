const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Branch");
  require("./dist/models/Subject");
  require("./dist/models/User");
  const Group = require("./dist/models/Group").default;
  const GroupSubjectConfig = require("./dist/models/GroupSubjectConfig").default;

  console.log("=== 5-SINF 01 GURUH TEKSHIRUVI ===\n");

  const g = await Group.findOne({ name: /5.*01/i })
    .populate("teacherId", "fullName username crmId")
    .lean();
  if (!g) { console.log("Topilmadi"); process.exit(1); }

  console.log("Group: " + g.name);
  console.log("  _id:", g._id);
  console.log("  crmId:", g.crmId);
  console.log("  classNumber:", g.classNumber);
  console.log("  letter:", g.letter);
  console.log("  bosh teacher (Group.teacherId):", g.teacherId?.fullName || "BIRIKTIRILMAGAN ❌");

  // Fanlar
  const configs = await GroupSubjectConfig.find({ groupId: g._id })
    .populate("subjectId", "nameUzb")
    .lean();
  console.log("\n  GroupSubjectConfig yozuvlari:", configs.length);
  configs.forEach(c => {
    console.log("    - " + (c.subjectId?.nameUzb || "?") + " (" + c.groupLetter + ")");
  });

  // Barcha guruhlar statistikasi
  console.log("\n=== UMUMIY STATISTIKA ===");
  const allGroups = await Group.find().select("name teacherId crmId").lean();
  const withT = allGroups.filter(g => g.teacherId).length;
  const woT = allGroups.filter(g => !g.teacherId).length;
  console.log("Jami guruhlar:", allGroups.length);
  console.log("Teacher biriktirilgan:", withT);
  console.log("Teacher YO'Q:", woT);

  // GroupSubjectConfig va teacher bog'lanishi
  console.log("\n=== FAN → TEACHER bog'lanishi ===");
  console.log("GroupSubjectConfig modelida `teacherId` FIELDI BOR BO'LSIN — tekshir...");
  const sampleConfig = await GroupSubjectConfig.findOne().lean();
  if (sampleConfig) {
    console.log("GroupSubjectConfig maydonlari:", Object.keys(sampleConfig));
    if (!Object.keys(sampleConfig).includes("teacherId")) {
      console.log("\n⚠️ GroupSubjectConfig da teacherId MAYDONI YO'Q!");
      console.log("   Demak: har fan uchun alohida teacher biriktirish imkoni YO'Q.");
      console.log("   Faqat Group.teacherId — 1 ta umumiy teacher saqlanadi.");
    }
  }

  // 5-sinf 01 uchun barcha fan-teacher bog'lanishini CRM Teacher.groups dan ko'rish
  console.log("\n=== CRM TEACHER.GROUPS field (DB da saqlanmagan) ===");
  console.log("CRM API dan har teacher shu group'larni qaytaradi:");
  console.log("  Teacher → [{ group_id, subject }, ...]");
  console.log("Hozir bu ma'lumot DB ga yozilmayapti.");
  console.log("Teacher.groups[] dan GroupSubjectConfig.teacherId ni to'ldirish kerak.");

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
