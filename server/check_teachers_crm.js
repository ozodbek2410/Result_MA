const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Branch");
  require("./dist/models/Subject");
  const User = require("./dist/models/User").default;
  const Group = require("./dist/models/Group").default;

  const teachers = await User.find({ role: "TEACHER" })
    .populate("branchId", "name")
    .populate("teacherSubjects", "nameUzb")
    .lean();

  console.log("=== JAMI TEACHERS ===", teachers.length);

  const withCrm = teachers.filter(t => t.crmId);
  const noCrm = teachers.filter(t => !t.crmId);
  console.log("CRM dan kelgan:", withCrm.length);
  console.log("Lokal:", noCrm.length);

  const withBranch = teachers.filter(t => t.branchId).length;
  const withSubj = teachers.filter(t => Array.isArray(t.teacherSubjects) && t.teacherSubjects.length > 0).length;
  const withPhone = teachers.filter(t => t.phone).length;
  const withTg = teachers.filter(t => t.tgChatId).length;
  const withPhone2 = teachers.filter(t => t.phone2).length;
  const withBirth = teachers.filter(t => t.birthDate).length;
  const withGender = teachers.filter(t => t.gender).length;

  console.log("\n=== CRM teacher field taqsimoti ===");
  console.log("branchId bor:", withBranch, "/", teachers.length);
  console.log("teacherSubjects bor:", withSubj);
  console.log("phone bor:", withPhone);
  console.log("phone2 bor:", withPhone2);
  console.log("birthDate bor:", withBirth);
  console.log("gender bor:", withGender);
  console.log("tgChatId bor:", withTg);

  // Guruh → teacher bog'lanishi
  const groups = await Group.find().select("teacherId name letter").lean();
  const gwt = groups.filter(g => g.teacherId).length;
  console.log("\n=== Guruhlar ===");
  console.log("Teacher biriktirilgan:", gwt, "/", groups.length);
  console.log("Teacher biriktirilmagan:", groups.length - gwt);

  // Har filial bo'yicha
  console.log("\n=== FILIAL BO'YICHA ===");
  const byBranch = new Map();
  for (const t of teachers) {
    const bname = t.branchId?.name || "branchsiz";
    if (!byBranch.has(bname)) byBranch.set(bname, { crm: 0, local: 0 });
    const b = byBranch.get(bname);
    if (t.crmId) b.crm++;
    else b.local++;
  }
  byBranch.forEach((v, k) => {
    console.log("  " + k + ": CRM=" + v.crm + " Lokal=" + v.local);
  });

  // Namuna
  console.log("\n=== NAMUNA ===");
  const sample = withCrm[0];
  if (sample) {
    console.log("crmId:", sample.crmId);
    console.log("username:", sample.username);
    console.log("fullName:", sample.fullName);
    console.log("phone:", sample.phone);
    console.log("phone2:", sample.phone2);
    console.log("birthDate:", sample.birthDate);
    console.log("gender:", sample.gender);
    console.log("branch:", sample.branchId?.name);
    console.log("subjects:", (sample.teacherSubjects || []).map(s => s.nameUzb).join(", "));
    console.log("isActive:", sample.isActive);
    console.log("lastSyncedAt:", sample.lastSyncedAt);
  }

  // CRM'da keladi, lekin yozilmaydigan fieldlar
  console.log("\n=== CRM dan keladi LEKIN YOZILMAYDIGAN fieldlar ===");
  console.log("  first_name, second_name, third_name — faqat fullName ga yig'iladi");
  console.log("  groups[] — teacher qanaqa guruhlar bilan ishlashi CRM da bor, LEKIN lokal DB ga yozilmaydi");
  console.log("  Bu sabab Group.teacherId BO'SH qolishi mumkin!");

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
