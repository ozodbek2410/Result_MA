# services/ — Kontekst

## Vazifasi
Biznes logika, tashqi servislar integratsiyasi va og'ir hisoblash vazifalari. Route handler'lardan chaqiriladi.

## CRM integratsiya servislari
- `crmApiService.ts` — CRM API HTTP klient (fetch, retry, throttle 1.1s, pagination auto-iterate)
- `crmSyncService.ts` — Sync logika: CRM → MongoDB upsert (crmId bo'yicha), dependency order
- Sync tartibi: Branches → Subjects → Directions → Teachers → Groups → Students
- `isSyncing` mutex — concurrent sync oldini oladi
- Teacher sync: auto-username (`name_crmId`), default password `teacher123`

## Qoidalar
- Class-based servislar (`export class GroqService { ... }`)
- Servis nomlari: camelCase fayl (`groqService.ts`), PascalCase class (`GroqService`)
- `parsers/` — DOCX parsing, yangi fan qo'shsang `ParserFactory.ts` ni yangilashni UNUTMA
- `queue/` — BullMQ queue'lar, og'ir tasklar (PDF, DOCX export) uchun
- File operatsiyalar: `localFileService.ts` (local), `s3Service.ts` (S3/MinIO)
- Logger: `import { logger } from '../config/logger'` — `console.log` o'rniga
- Python chaqiruvlar: `child_process.spawn` orqali (`omrQueueHandler.ts`)
- Xatolik: Error throw qil, route handler'da catch qilsin

## Namuna
```typescript
// Service pattern
export class PDFExportService {
  static async generatePDF(testId: string): Promise<Buffer> {
    const test = await Test.findById(testId).populate('subjectId');
    if (!test) throw new Error('Test topilmadi');
    // ... PDF generation logic
    return pdfBuffer;
  }
}
```
