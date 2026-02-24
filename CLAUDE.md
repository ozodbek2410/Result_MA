# ResultMA — Ta'lim Boshqaruv Tizimi

## Loyiha haqida
O'quv markazlari uchun test yaratish, import qilish (DOCX), OMR tekshirish, natijalar statistikasi tizimi. Ma'lumotlar (student, teacher, group, direction) **CRM integratsiya** orqali keladi (`crm.mathacademy.uz`). Monorepo: client + server + python OMR.

## Texnologiyalar
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Zustand, React Query, React Router 6, Framer Motion
- **Backend**: Node.js, Express, TypeScript, Mongoose (MongoDB), BullMQ (Redis)
- **Python**: OpenCV, NumPy, pyzbar — OMR skanerlash uchun
- **Infra**: Docker Compose (MongoDB, Redis, MinIO/S3), Nginx
- **Boshqa**: KaTeX (formulalar), TipTap (editor), Playwright (e2e), Groq API (AI parsing)

## Loyiha strukturasi
```
client/src/
  pages/teacher/       — O'qituvchi sahifalari (test, block-test, guruh, OMR)
  pages/admin/         — Admin sahifalari (CRM sync, filiallar, foydalanuvchilar)
  components/          — UI komponentlar (AnswerSheet, TestEditor, SubjectText)
  components/ui/       — Qayta ishlatiladigan UI (Button, Modal, Loading)
  store/authStore.ts   — Zustand auth holati (JWT token)
  lib/api.ts           — Axios instance (/api proxy)
  types/               — TypeScript tiplar
server/src/
  models/              — Mongoose modellar (User, Test, BlockTest, Student, Branch, SyncLog...)
  routes/              — Express route'lar (auth, test, blockTest, omr, crm...)
  services/            — Biznes logika (docx parser, PDF generator, CRM sync, queue, S3)
  services/parsers/    — Fan bo'yicha DOCX parserlar (Math, Bio, Physics, Chemistry, Literature)
  middleware/          — auth, cache, permissions, rateLimiter
  config/              — database, env, logger, redis
  scripts/             — Admin scriptlar (seed, migrate, cleanup)
server/python/
  omr_hybrid.py        — OMR skanerlash (OpenCV)
  qr_scanner.py        — QR kod o'qish
```

## Buyruqlar
```bash
# Root (monorepo)
npm run dev              # server + client parallel
npm run dev:server       # faqat server (port 9999)
npm run dev:client       # faqat client (port 9998)
npm run build            # barcha workspaces build
npm run setup:python     # Python dependencies

# Server
npm run dev              # tsx watch src/index.ts
npm run worker           # BullMQ worker
npm run seed             # Test data yaratish
npm run create-admin     # Admin user yaratish
npm run create-indexes   # MongoDB indexlar

# Client
npm run dev              # Vite dev server
npm run build            # tsc && vite build
npm run test:e2e         # Playwright testlar

# Docker
docker-compose up -d     # MongoDB + Redis + MinIO
```

## Kod qoidalari
- **Naming**: camelCase (o'zgaruvchilar, funksiyalar), PascalCase (komponentlar, interfeys, class)
- **Import alias**: `@/*` = `client/src/*` (faqat client)
- **Fayl nomlash**: PascalCase komponentlar (`TestEditor.tsx`), camelCase servislar (`groqService.ts`)
- **Route fayl**: `[entity].routes.ts` formati
- **Model fayl**: PascalCase (`BlockTest.ts`), interface `I` prefiksi (`ITest`, `IUser`)
- **State**: Zustand (client), global store `authStore.ts`
- **API**: Axios instance `lib/api.ts` orqali, baseURL `/api`
- **Style**: TailwindCSS utility classes, inline style YOZMA
- **Prettier**: single quote, semi, trailing comma es5, printWidth 100, tabWidth 2

## API/Data formatlari
```typescript
// Muvaffaqiyatli javob
{ data: T }
// yoki to'g'ridan-to'g'ri array/object

// Xato javob
{ message: string }

// Auth header
Authorization: Bearer <JWT_TOKEN>

// Savol formati (Test model)
{
  text: string,
  formula?: string,        // LaTeX
  imageUrl?: string,       // Legacy
  media?: IMediaItem[],    // Yangi: { type, url, position }
  variants: [{ letter: 'A'|'B'|'C'|'D', text: string }],
  correctAnswer?: 'A'|'B'|'C'|'D',
  points: number
}
```

## TOKEN TEJASH QOIDALARI (MAJBURIY)
- Ortiqcha tushuntirma BERMA, faqat kod yoz
- Savol BERMA, eng yaxshi variantni o'zing tanla va bajargandan keyin qisqacha nima qilganingni ayt
- Faqat o'zgargan fayllarni ko'rsat, o'zgarmagan fayllarni QAYTA YOZMA
- Bir xil kodni takrorlab tushuntirma BERMA
- Import, type, interface — faqat kerak bo'lganda ko'rsat
- Agar 3 tadan kam qator o'zgarsa, faqat o'sha qatorlarni ko'rsat
- Har bir javob MAKSIMUM 50 qator kod bo'lsin, undan ko'p bo'lsa faylga yoz
- Hech qachon "mana bu yerda..." "keling ko'raylik..." kabi bo'sh gaplar YOZMA
- Tasdiq so'rama: "bu to'g'rimi?", "davom etaymi?" — BERMA, bajaver
- Xato bo'lsa o'zing tuzat, menga xabar berma (agar jiddiy bo'lmasa)

## TAQIQLANGAN NARSALAR
- `any` tipi — aniq tip yoz yoki `unknown` ishlar
- `inline style` — TailwindCSS ishlat
- `console.log` production'da — faqat `logger` (server) yoki `console.warn/error` (client)
- Yangi dependency qo'shish — avval mavjud kutubxonalardan foydalanishga harakat qil
- `.env` faylni HECH QACHON commit qilma
- `import *` — named import ishlat
- Mongoose model'da `{ strict: false }` — ISHLATMA
- `res.send()` o'rniga `res.json()` ishlat (API route'larda)
- Test/BlockTest model'ni o'zgartirganda migration kerak bo'lishi mumkin — ehtiyot bo'l

## CRM Integratsiya
- **CRM API**: `crm.mathacademy.uz/api` — POST endpointlar (`/students-list`, `/teachers-list`, `/specialty-list`, `/groups-list`)
- **Auth**: `X-API-KEY` + `Authorization: Bearer token` headerlari
- **Sync oqimi**: CRM API → `crmApiService.ts` (fetch) → `crmSyncService.ts` (upsert by crmId) → MongoDB → Frontend (GET endpointlar)
- **Sync tartibi**: Branches → Subjects → Directions → Teachers → Groups → Students (dependency order)
- **Sync chastotasi**: Har 5 daqiqada avtomatik (node-cron), yoki admin paneldan manual trigger
- **CRM-managed entities**: Student, Group, Teacher (User), Direction, Subject, Branch — CRUD o'chirilgan (403), faqat GET
- **Lokal entities**: User (admin/methodist), Test, BlockTest, Assignment, TestResult — CRM dan kelmaydi
- **crmId**: Har bir CRM entity'da `crmId: Number` (sparse unique) — upsert matching uchun
- **Env vars**: `CRM_API_URL`, `CRM_API_KEY`, `CRM_BEARER_TOKEN`, `CRM_SYNC_ENABLED`, `CRM_SYNC_INTERVAL`
- **Admin panel**: `/admin/crm-sync`, `/admin/branches`, `/admin/users` — SUPER_ADMIN/FIL_ADMIN uchun

## Muhim eslatmalar
- **Portlar**: Server `9999`, Client `9998`, Vite proxy `/api` → `localhost:9999`
- **Auth**: JWT based, rollar: `SUPER_ADMIN`, `FIL_ADMIN`, `TEACHER`, `METHODIST`, `STUDENT`
- **DOCX Parser**: Fan bo'yicha maxsus parserlar (`ParserFactory`). Yangi fan qo'shsang — `ParserFactory.ts` ga qo'sh
- **OMR**: Python OpenCV orqali, `omr_hybrid.py` asosiy fayl. Server `child_process.spawn` orqali chaqiradi
- **File upload**: Multer → `server/uploads/`, S3/MinIO production'da
- **Queue**: BullMQ + Redis — OMR va og'ir tasklar uchun. Worker alohida process: `npm run worker`
- **Groq API**: Test parsing uchun AI. Bir nechta API key qo'llab-quvvatlanadi (auto-rotate)
- **Env vars**: `server/.env` — `.env.example` ga qarab to'ldir. Majburiy: `MONGODB_URI`, `JWT_SECRET`, `PORT`, CRM kalitlari
- **Workspaces**: npm workspaces (`server`, `client`). Root'da `npm install` barcha dependency'larni o'rnatadi
- **PDF generation**: `pdfGeneratorService.ts` + `pdfExportService.ts` — uzoq vaqt olishi mumkin, timeout yo'q
- **O'zbek tili**: UI va xato xabarlari o'zbek tilida, kod/commentlar aralash (uz/ru/en)
- **Default login**: `admin/admin123` (SUPER_ADMIN), `teacher/teacher123` (TEACHER)
