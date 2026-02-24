# Yangi API Endpoint

## Qachon ishlatilsin
"endpoint qo'sh", "API yarat", "route qo'sh", "backend endpoint", "CRUD"

## Qadamlar
1. Model kerakmi? → `server/src/models/[Entity].ts`
2. Route yaratish → `server/src/routes/[entity].routes.ts`
3. Service kerakmi? (murakkab logika) → `server/src/services/[entity]Service.ts`
4. Route register → `server/src/index.ts`
5. Frontend hook → `client/src/hooks/use[Entity].ts`

## Shablon

### CRUD Route (to'liq)
```typescript
import express from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import Entity from '../models/Entity';

const router = express.Router();

// GET all
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const items = await Entity.find({ branchId: req.user?.branchId });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// GET by id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const item = await Entity.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Topilmadi' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// POST create
router.post('/', authenticate, authorize(UserRole.TEACHER), async (req: AuthRequest, res) => {
  try {
    const item = new Entity({ ...req.body, createdBy: req.user?.id });
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// PUT update
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const item = await Entity.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ message: 'Topilmadi' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// DELETE
router.delete('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req: AuthRequest, res) => {
  try {
    await Entity.findByIdAndDelete(req.params.id);
    res.json({ message: "O'chirildi" });
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

export default router;
```

### index.ts ga register qilish
```typescript
import entityRoutes from './routes/entity.routes';
app.use('/api/entities', entityRoutes);
```

## Checklist
- [ ] Model yaratildi (kerak bo'lsa) va index.ts da import qilindi
- [ ] Route fayli yaratildi
- [ ] authenticate/authorize middleware qo'shildi
- [ ] index.ts da `app.use('/api/...', routes)` register qilindi
- [ ] Error handling har bir handler'da bor
- [ ] Response format: `res.json(...)` / `res.status(XXX).json({ message })`

## TOKEN TEJASH
- Faqat yangi yaratilgan fayllarni ko'rsat
- CRUD'dan faqat kerakli method'larni yarat, barchasini EMAS
