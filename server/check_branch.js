const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Teacher");
  const User = require("./dist/models/User").default;
  const Student = require("./dist/models/Student").default;
  const Branch = require("./dist/models/Branch").default;

  // test user
  const testUsers = await User.find({ username: /test/i }).populate("branchId", "name").lean();
  console.log("=== 'test' username li userlar ===");
  for (const u of testUsers) {
    console.log(`  username: ${u.username} | role: ${u.role} | branchId: ${u.branchId?._id || u.branchId} | branchName: ${u.branchId?.name}`);
  }

  // All branches
  const branches = await Branch.find().lean();
  console.log("\n=== BARCHA FILIALLAR ===");
  for (const b of branches) {
    const studentCount = await Student.countDocuments({ branchId: b._id });
    const crmCount = await Student.countDocuments({ branchId: b._id, crmId: { $exists: true, $ne: null } });
    const nonCrmCount = studentCount - crmCount;
    console.log(`${b._id} | ${b.name} | ${studentCount} student (CRM: ${crmCount}, lokal: ${nonCrmCount}) | crmId: ${b.crmId || '-'}`);
  }

  // CRM Hakimov
  const crm = await Student.findById("69d5fee4c5920864287a9f2c").populate("branchId", "name").lean();
  console.log("\nCRM Hakimov branchId:", crm?.branchId?._id, "|", crm?.branchId?.name);

  // Old Hakimov
  const old = await Student.findById("69ce060f8192bdbc48d65ade").populate("branchId", "name").lean();
  console.log("Old Hakimov branchId:", old?.branchId?._id, "|", old?.branchId?.name);

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
