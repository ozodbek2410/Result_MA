// Hakimov Azizbek dublikat muammosini hal qilish:
// Eski lokal yozuvdan (69ce060f..., 7-sinf, 2 variant) variantlarni
// yangi CRM yozuviga (69d5fee4..., 6-sinf, 0 variant) ko'chirish.
//
// Natija:
// - Yangi CRM yozuvi 2 ta variantga ega bo'ladi (77CE618F, AE725EF3)
// - Eski yozuv 0 ta variantga ega bo'ladi
// - Foydalanuvchi endi CRM yozuvini tanlasa, variantlar topiladi
//
// Ishlatish:
//   node merge_hakimov.js          → dry-run (ko'rsatadi, o'zgartirmaydi)
//   node merge_hakimov.js --apply  → haqiqiy ko'chirish

const mongoose = require("mongoose");
require("dotenv").config();

const APPLY = process.argv.includes('--apply');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  require("./dist/models/Student");
  require("./dist/models/Group");
  const SV = require("./dist/models/StudentVariant").default;
  const SG = require("./dist/models/StudentGroup").default;

  const OLD_ID = "69ce060f8192bdbc48d65ade"; // Lokal, 7-sinf, 2 variant
  const NEW_ID = "69d5fee4c5920864287a9f2c"; // CRM, 6-sinf, 0 variant

  console.log("Rejim:", APPLY ? "HAQIQIY KO'CHIRISH" : "DRY-RUN (o'zgartirmaydi)");
  console.log();

  // 1. Eski yozuvning variantlari
  const oldVars = await SV.find({ studentId: OLD_ID }).lean();
  console.log(`Eski yozuvdagi variantlar (${oldVars.length}):`);
  oldVars.forEach(v => console.log(`  ${v.variantCode} | ${v.testType} | testId: ${v.testId}`));

  // 2. Yangi yozuvning hozirgi variantlari (bor bo'lsa conflict)
  const newVars = await SV.find({ studentId: NEW_ID }).lean();
  console.log(`\nYangi CRM yozuvidagi variantlar (${newVars.length}):`);
  newVars.forEach(v => console.log(`  ${v.variantCode} | ${v.testType}`));

  if (newVars.length > 0) {
    console.log("\n⚠️ Yangi yozuvda ham variant bor — conflict bo'lishi mumkin!");
    console.log("   Davom etishdan oldin tekshiring.");
  }

  // 3. Dublikat StudentGroup yozuvlari (eski yozuvda 6-03 3 marta bor)
  const oldSGs = await SG.find({ studentId: OLD_ID }).populate('groupId', 'name').lean();
  console.log(`\nEski yozuvning StudentGroup yozuvlari (${oldSGs.length}):`);
  const sgGroupMap = new Map();
  for (const sg of oldSGs) {
    const gname = sg.groupId?.name || 'NO-GROUP';
    if (!sgGroupMap.has(gname)) sgGroupMap.set(gname, []);
    sgGroupMap.get(gname).push(sg._id.toString());
  }
  sgGroupMap.forEach((ids, name) => {
    console.log(`  ${name}: ${ids.length} ta yozuv${ids.length > 1 ? ' (DUBLIKAT!)' : ''}`);
  });

  if (!APPLY) {
    console.log("\n--- DRY-RUN: hech narsa o'zgartirilmadi ---");
    console.log("Bajarish uchun: node merge_hakimov.js --apply");
    process.exit(0);
  }

  // === HAQIQIY KO'CHIRISH ===
  console.log("\n=== KO'CHIRISH BOSHLANDI ===");

  // 1. Variantlar: studentId OLD_ID → NEW_ID
  const upd1 = await SV.updateMany(
    { studentId: OLD_ID },
    { $set: { studentId: NEW_ID } }
  );
  console.log(`✅ ${upd1.modifiedCount} variant ko'chirildi (OLD → NEW)`);

  // 2. 6-03 guruh dublikatlarni tozalash (faqat 1 tasi qoladi)
  for (const [gname, ids] of sgGroupMap.entries()) {
    if (ids.length > 1) {
      // Birinchisini qoldiramiz, qolganlarini o'chiramiz
      const toDelete = ids.slice(1);
      const del = await SG.deleteMany({ _id: { $in: toDelete } });
      console.log(`🗑️ ${gname}: ${del.deletedCount} ta dublikat SG o'chirildi`);
    }
  }

  // 3. Eski yozuvdan 6-03 StudentGroup yozuvini ham NEW ga ko'chirish (agar yangi yozuvda 6-03 yo'q bo'lsa skip)
  // CRM yozuvi allaqachon 6-03 guruhda, shuning uchun ehtiyot uchun o'tkazib yuboramiz

  // 4. Eski yozuvdagi qolgan SG larni o'chirish (7-sinf Texnika ham shu yerga kiradi — user tasdiqlashi kerak)
  //   Biz buni AVTOMATIK qilmaymiz — user qaror qilsin
  console.log("\n⚠️ Eski yozuv (Hakimov Azizbek, 7-sinf) hali ham bazada. Uni o'chirish uchun");
  console.log("   alohida skript kerak bo'ladi. Hozircha faqat variantlar ko'chirildi.");

  console.log("\n=== BAJARILDI ===");
  console.log("Endi CRM yozuvi (Hakimov Azizbek Farrux o'g'li, 6-sinf) 2 ta variantga ega.");
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
