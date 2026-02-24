# Yangi Feature Qo'shish

## Qachon ishlatilsin
"yangi sahifa", "yangi komponent", "yangi funksiya qo'sh", "feature qo'sh", "qo'shish kerak"

## Qadamlar

### Frontend (React sahifa/komponent)
1. `client/src/pages/teacher/` yoki `client/src/components/` da yangi fayl yarat
2. Kerakli hook'larni `hooks/` dan import qil yoki yangi hook yarat
3. API endpoint kerak bo'lsa `lib/api.ts` orqali chaqir
4. Route kerak bo'lsa `App.tsx` ga lazy import qo'sh
5. Layout'da navigation link qo'sh (agar sahifa bo'lsa)

### Backend (API endpoint)
1. `server/src/routes/[entity].routes.ts` — yangi route handler
2. `server/src/models/[Entity].ts` — yangi model (kerak bo'lsa)
3. `server/src/services/[entity]Service.ts` — biznes logika (murakkab bo'lsa)
4. `server/src/index.ts` — route va model import/register
5. Middleware: `authenticate` + `authorize(UserRole.XXX)`

### Full-stack
1. Backend: Model → Route → Service → index.ts register
2. Frontend: Hook → Component/Page → App.tsx route

## Shablon

### Yangi route fayli
```typescript
import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = express.Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    // ... logic
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

export default router;
```

### Yangi sahifa
```tsx
import { useApiQuery } from '../../hooks/useApi';

export default function NewPage() {
  const { data, isLoading } = useApiQuery(['key'], '/api/endpoint');
  if (isLoading) return <Loading />;
  return <div>...</div>;
}
```

## Checklist
- [ ] Backend: Model yaratildi (kerak bo'lsa)
- [ ] Backend: Route yaratildi va index.ts da register qilindi
- [ ] Backend: authenticate/authorize middleware qo'shildi
- [ ] Frontend: Komponent/sahifa yaratildi
- [ ] Frontend: Route App.tsx ga qo'shildi (sahifa bo'lsa)
- [ ] Frontend: API hook yaratildi/ishlatildi

## TOKEN TEJASH
- Faqat o'zgargan/yaratilgan fayllarni ko'rsat
- Shablon to'ldir, tushuntirma BERMA
