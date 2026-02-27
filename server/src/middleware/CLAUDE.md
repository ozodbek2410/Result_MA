# middleware/ — Kontekst

## Vazifasi
Express middleware'lar: autentifikatsiya, avtorizatsiya, keshlash va rate limiting.

## Qoidalar
- `authenticate` — JWT token tekshirish, `req.user` ga decoded token yozish
- `authorize(...roles)` — rol tekshirish, `UserRole` enum ishlatish
- `AuthRequest` — `req.user` bilan kengaytirilgan Request tipi, route handler'larda shu tipni ishlat
- `cache` middleware — GET so'rovlar uchun, Redis orqali
- `rateLimiter` — auth route'lar uchun qattiqroq, umumiy API uchun yumshoqroq
- Yangi middleware qo'shganda `index.ts` yoki tegishli route faylda ulashni UNUTMA

## Namuna
```typescript
// Route'da ishlatish
router.get('/', authenticate, authorize(UserRole.TEACHER), async (req: AuthRequest, res) => {
  const userId = req.user?.id; // string
  const role = req.user?.role; // UserRole enum
  // ...
});
```
