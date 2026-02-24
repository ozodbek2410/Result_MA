# models/ — Kontekst

## Vazifasi
Mongoose modellar va TypeScript interfeyslari. Har bir DB collection uchun alohida fayl.

## CRM integratsiya
- CRM dan keladigan modellar: `Student`, `Branch`, `Group`, `Direction`, `User` (TEACHER), `Subject`
- Har birida `crmId?: Number` (sparse unique) va `lastSyncedAt?: Date` fieldlari bor
- `SyncLog` — CRM sync tarixi (type, status, result, syncErrors)
- CRM-managed modellarni to'g'ridan-to'g'ri CRUD qilma — faqat sync orqali yangilanadi

## Qoidalar
- Fayl nomi: PascalCase (`BlockTest.ts`, `StudentGroup.ts`)
- Interface nomi: `I` prefiksi (`IUser`, `ITest`, `IBlockTest`)
- Index'larni Schema'da `unique: true` yoki `Schema.index()` bilan qo'sh — ikkalasini BIRGA ISHLATMA (duplicate warning)
- `{ _id: false }` faqat subdocument schema'larda
- `Schema.Types.Mixed` faqat murakkab nested struktura uchun (imkon qadar aniq tip yoz)
- Yangi model qo'shganda `server/src/index.ts` da import qilishni UNUTMA (model registratsiya)
- `ref` qiymatlari model nomiga mos bo'lsin (`'Branch'`, `'Student'`, `'Test'`)
- Mongoose reserved field nomlarini ISHLATMA (`errors`, `isNew`, `save`, `validate` va h.k.)

## Namuna
```typescript
// Model pattern
export interface IStudent extends Document {
  fullName: string;
  branchId: mongoose.Types.ObjectId;
  isActive: boolean;
}

const StudentSchema = new Schema<IStudent>({
  fullName: { type: String, required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  isActive: { type: Boolean, default: true },
});

StudentSchema.index({ branchId: 1 });
export default mongoose.model<IStudent>('Student', StudentSchema);
```
