// CRM API dan teacher ma'lumotlarini real-time o'qish.
// Qaysi maydonlar keladi, qaysi null ekanligini ko'rsatish.

require("dotenv").config({ path: ".env" });

const CRM_URL = process.env.CRM_API_URL;
const API_KEY = process.env.CRM_API_KEY;
const BEARER = process.env.CRM_BEARER_TOKEN;

if (!CRM_URL || !API_KEY || !BEARER) {
  console.error("❌ CRM env vars yo'q!");
  process.exit(1);
}

async function fetchTeachers(page = 1) {
  const response = await fetch(`${CRM_URL}/teachers-list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": API_KEY,
      Authorization: `Bearer ${BEARER}`,
    },
    body: JSON.stringify({ page, per_page: 5 }),
  });
  if (!response.ok) {
    console.error("HTTP", response.status, await response.text());
    process.exit(1);
  }
  return response.json();
}

(async () => {
  console.log("🔌 CRM API ga ulanish:", CRM_URL);
  const data = await fetchTeachers(1);

  console.log("\n=== Response tuzilishi ===");
  console.log("Top-level keys:", Object.keys(data));

  // CRM API format: { success: true, data: { teachers: [...], pagination: {...} } }
  const inner = data.data || data;
  const teachers = inner.teachers || inner.items || (Array.isArray(inner) ? inner : []);
  console.log("inner keys:", Object.keys(inner).slice(0, 10));
  console.log("Teachers count (pg 1):", teachers.length);

  if (teachers.length === 0) {
    console.log("Bo'sh!");
    process.exit(1);
  }

  const t = teachers[0];
  console.log("\n=== 1-TEACHER TO'LIQ DATA ===");
  console.log(JSON.stringify(t, null, 2));

  console.log("\n=== BARCHA 5 TEACHERS — muhim fieldlar ===");
  teachers.forEach((t, i) => {
    console.log(`\n${i + 1}. ${t.full_name} (id: ${t.id})`);
    console.log("   phone:", t.phone);
    console.log("   phone2:", t.phone2);
    console.log("   birth_date:", t.birth_date);
    console.log("   gender:", t.gender);
    console.log("   tg_chat_id:", t.tg_chat_id);
    console.log("   is_active:", t.is_active);
    console.log("   organization:", t.organization?.name || null);
    console.log("   subjects:", (t.subjects || []).map(s => s.name || s.title).join(", "));
    console.log("   groups:", (t.groups || []).length + " ta");
    (t.groups || []).slice(0, 3).forEach(g => {
      console.log("     - " + (g.name || g.level) + " | subject: " + (g.subject?.name || g.subject?.title || "?"));
    });
  });

  console.log("\n=== STATISTIKA — CRM API qaytaradigan fieldlar ===");
  const hasPhone = teachers.filter(t => t.phone).length;
  const hasBirth = teachers.filter(t => t.birth_date).length;
  const hasGender = teachers.filter(t => t.gender).length;
  const hasTg = teachers.filter(t => t.tg_chat_id).length;
  const hasGroups = teachers.filter(t => t.groups && t.groups.length > 0).length;
  const hasSubjects = teachers.filter(t => t.subjects && t.subjects.length > 0).length;
  console.log(`phone: ${hasPhone}/${teachers.length}`);
  console.log(`birth_date: ${hasBirth}/${teachers.length}`);
  console.log(`gender: ${hasGender}/${teachers.length}`);
  console.log(`tg_chat_id: ${hasTg}/${teachers.length}`);
  console.log(`subjects[]: ${hasSubjects}/${teachers.length}`);
  console.log(`groups[]: ${hasGroups}/${teachers.length}`);
})();
