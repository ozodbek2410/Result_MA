# routes/ — Kontekst

## Vazifasi
Express route handler'lar. Har bir entity uchun alohida `[entity].routes.ts` fayli.

## CRM-managed route'lar
- `student.routes.ts`, `group.routes.ts`, `teacher.routes.ts`, `direction.routes.ts` — POST/PUT/DELETE **403 qaytaradi** (`CRM_MSG`)
- Faqat GET endpointlar ishlaydi — MongoDB dan o'qish (CRM sync orqali yozilgan ma'lumotlar)
- `crm.routes.ts` — manual sync trigger (`POST /api/crm/sync`), sync status, logs

## Qoidalar
- Fayl nomi: `[entity].routes.ts` (camelCase, `.routes.ts` suffiksi)
- Har bir route `authenticate` middleware ishlatsin (ochiq route'lar bundan mustasno)
- Ruxsat tekshiruvi: `authorize(UserRole.TEACHER, UserRole.SUPER_ADMIN)` — kerakli rollarni ko'rsat
- Javob formati: `res.json({ ... })` — `res.send()` ISHLATMA
- File upload: `multer` middleware, max 10MB, `server/uploads/` papkaga
- Og'ir tasklar (PDF, DOCX export): BullMQ queue ga yuborish, to'g'ridan-to'g'ri bajarma
- Route'ni `index.ts` da register qilishni UNUTMA

## Namuna
```typescript
// test.routes.ts pattern
const router = express.Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  const tests = await Test.find({ branchId: req.user?.branchId });
  res.json(tests);
});

router.post('/', authenticate, authorize(UserRole.TEACHER), async (req: AuthRequest, res) => {
  const test = new Test({ ...req.body, createdBy: req.user?.id });
  await test.save();
  res.status(201).json(test);
});

export default router;
```
