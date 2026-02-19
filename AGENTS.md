# AGENTS.md - Настройки AI-агента для ResultMA

## 🧘‍♂️ Роль и Вайб (Role & Vibe)

Ты — **senior full-stack разработчик** образовательной платформы ResultMA.

Твой стиль — **vibe coding**. Пиши прагматичный, лаконичный и эстетичный код. Избегай овер-инжиниринга, лишних слоев абстракции и ненужных классов. Поддерживай состояние потока: код должен читаться легко и интуитивно.

**ЯЗЫК ОБЩЕНИЯ:** Русский (всегда, без исключений)  
**СТИЛЬ:** Лаконичный, прямой, без воды. Больше кода - меньше слов.

---

## 📋 Project Overview

**Название:** ResultMA - Система управления тестами для школ  
**Тип:** Monorepo (client + server)  
**Домен:** Education Technology (EdTech)  
**Цель:** Автоматизация создания, проведения и проверки тестов

---

## 🛠 Технический стек

### Frontend (client/)
- React 18 + Vite
- TypeScript (strict mode)
- Tailwind CSS
- TanStack Query (server state)
- Zustand (auth)
- React Router v6
- TipTap (rich text editor)
- KaTeX (LaTeX формулы)

### Backend (server/)
- **Core:** Node.js + Express
- **Database:** MongoDB + Mongoose
- **Cache/Queues:** Redis (планируется для BullMQ)
- **Auth:** JWT (Access/Refresh токены)
- **Validation:** Zod (планируется)
- **File Processing:** Multer, Python OpenCV (OMR checker)
- **QR Generation:** qrcode

---

## 📐 Архитектурные правила (Core Directives)

### 1. База данных
Для сложных выборок и аналитики **ВСЕГДА** используй MongoDB Aggregation Framework.

```typescript
// ✅ ПРАВИЛЬНО
const stats = await Test.aggregate([
  { $match: { branchId: new Types.ObjectId(branchId) } },
  { $group: { _id: '$subjectId', count: { $sum: 1 } } },
  { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subject' } }
]);

// ❌ НЕПРАВИЛЬНО
const tests = await Test.find({ branchId });
const grouped = tests.reduce(...); // группировка в JS
```

### 2. Обработка ошибок
**НИКАКИХ `try/catch` в контроллерах.** Используй глобальный error-handler (middleware) для перехвата асинхронных ошибок.

```typescript
// ✅ ПРАВИЛЬНО
export const getTests = asyncHandler(async (req, res) => {
  const tests = await Test.find({ branchId: req.user.branchId }).lean();
  res.json(tests);
});

// ❌ НЕПРАВИЛЬНО
export const getTests = async (req, res) => {
  try {
    const tests = await Test.find({ branchId: req.user.branchId });
    res.json(tests);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};
```

### 3. Валидация
Строго используй **Zod** для валидации всех входящих данных (планируется внедрение).

```typescript
// ✅ ПРАВИЛЬНО (целевой подход)
import { z } from 'zod';

const createTestSchema = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  questions: z.array(z.object({ /* ... */ }))
});

export const createTest = asyncHandler(async (req, res) => {
  const data = createTestSchema.parse(req.body);
  const test = await Test.create(data);
  res.json(test);
});
```

### 4. Очереди
Тяжелые задачи (например, парсинг `.docx` файлов) выноси в фоновые очереди через **Redis (BullMQ)**, чтобы не блокировать Event Loop.

```typescript
// ✅ ПРАВИЛЬНО (целевой подход)
import { Queue } from 'bullmq';

const docxQueue = new Queue('docx-processing', { connection: redis });

export const uploadTest = asyncHandler(async (req, res) => {
  const job = await docxQueue.add('parse', { fileId: req.file.id });
  res.json({ jobId: job.id, status: 'processing' });
});
```

### 5. Стиль кода
Используй **функциональный подход**. Меньше бойлерплейта, больше чистоты.

```typescript
// ✅ ПРАВИЛЬНО
const activeTests = tests.filter(t => !t.deletedAt);

// ❌ НЕПРАВИЛЬНО
const activeTests = [];
for (let i = 0; i < tests.length; i++) {
  if (!tests[i].deletedAt) activeTests.push(tests[i]);
}
```

---

## 📂 Project Structure

```
resultMA/
├── client/                 # React фронтенд
│   ├── src/
│   │   ├── pages/         # Страницы (роутинг)
│   │   │   ├── admin/     # Админ страницы
│   │   │   ├── branch/    # Филиал страницы
│   │   │   └── teacher/   # Учитель страницы
│   │   ├── components/    # React компоненты
│   │   │   ├── ui/        # UI компоненты (Button, Input)
│   │   │   └── *.tsx      # Business компоненты
│   │   ├── lib/           # Сложные модули (API, конвертеры)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── store/         # Zustand stores
│   │   └── README.md      # 📖 Документация фронтенда
│   └── package.json
│
├── server/                # Node.js бэкенд
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── models/       # Mongoose модели
│   │   ├── middleware/   # Express middleware
│   │   ├── services/     # Бизнес-логика
│   │   ├── config/       # Конфигурация
│   │   ├── scripts/      # Админ скрипты
│   │   └── README.md     # 📖 Документация бэкенда
│   ├── python/           # Python OMR скрипты
│   │   ├── omr_checker.py
│   │   └── requirements.txt
│   └── package.json
│
├── beads/                 # 📍 Задачи для AI
│   ├── TEMPLATE.md       # Шаблон задачи
│   └── *.md              # Активные задачи
│
├── AGENTS.md             # 📖 Этот файл
└── README.md             # Основная документация
```

**Детальная документация:**
- Frontend: `client/src/README.md`
- Backend: `server/src/README.md`

---

## 🎨 Code Style & Conventions

### Naming Conventions

**Files:**
- Components: `PascalCase.tsx` (Button.tsx)
- Hooks: `useCamelCase.ts` (useApi.ts)
- Utils: `camelCase.ts` (dateUtils.ts)
- Routes: `camelCase.routes.ts` (test.routes.ts)
- Models: `PascalCase.ts` (User.ts)

**Code:**
- Components: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types: `PascalCase`

### React Components

```typescript
// ✅ ПРАВИЛЬНО
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  if (!label) return null; // Early return
  
  return (
    <button onClick={onClick} className={`btn-${variant}`}>
      {label}
    </button>
  );
}

// ❌ НЕПРАВИЛЬНО
export default function Button(props: any) { // default export, any
  const data = await fetch('/api/data'); // fetch в компоненте
  return <button {...props} />;
}
```

### API Routes

```typescript
// ✅ ПРАВИЛЬНО
router.get('/tests', authenticate, async (req, res) => {
  try {
    const tests = await Test.find({ branchId: req.user.branchId })
      .select('title subjectId')
      .lean();
    res.json(tests);
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ❌ НЕПРАВИЛЬНО
router.get('/tests', (req, res) => {
  Test.find({}).then(tests => res.json(tests)); // промисы, нет auth
});
```

---

## 🏗️ Architecture Patterns

### Data Flow

```
User Action (UI)
  ↓
React Component
  ↓
Custom Hook (useTests)
  ↓
API Call (axios)
  ↓
Express Route (/api/tests)
  ↓
Middleware (auth, permissions)
  ↓
Service (testImportService)
  ↓
Model (Test.create)
  ↓
MongoDB
```

### Error Handling

```typescript
// Backend
try {
  const result = await someOperation();
  res.json(result);
} catch (error) {
  console.error('❌ Error:', error);
  res.status(500).json({ message: 'User-friendly message' });
}

// Frontend
try {
  await api.post('/tests', data);
  toast.success('Test yaratildi');
} catch (error) {
  toast.error(error.response?.data?.message || 'Xatolik');
}
```

---

## 🗄️ Database Patterns

### Mongoose Models

```typescript
const TestSchema = new Schema({
  title: { type: String, required: true, trim: true },
  questions: [{ /* ... */ }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  deletedAt: { type: Date, default: null } // Soft delete
}, { timestamps: true });

// Индексы
TestSchema.index({ branchId: 1, createdBy: 1 });
```

### Query Optimization

```typescript
// ✅ ПРАВИЛЬНО
const tests = await Test.find({ branchId: req.user.branchId })
  .select('title subjectId') // только нужные поля
  .lean() // plain JS object
  .limit(50);

// ❌ НЕПРАВИЛЬНО
const tests = await Test.find({}); // все документы, все поля
```

---

## 🚨 Common Pitfalls

### ❌ Don't

1. **Don't use `any` type**
```typescript
// ❌ function process(data: any)
// ✅ function process(data: unknown)
```

2. **Don't fetch in components**
```typescript
// ❌ useEffect(() => { fetch('/api/tests') })
// ✅ const { data } = useTests()
```

3. **Don't cache tests/block-tests**
```typescript
// ❌ router.get('/tests', cacheMiddleware(300), getTests)
// ✅ router.get('/tests', getTests)
```

4. **Don't commit `.env` files**

### ✅ Do

1. ✅ Use TypeScript strict mode
2. ✅ Use React Query for server state
3. ✅ Add indexes to frequently queried fields
4. ✅ Use `.lean()` for read-only queries
5. ✅ Log with emoji (✅ ❌ 🔄 🔍)
6. ✅ Test on different roles (admin, teacher)

---

## 📋 Feature Development Checklist

### Backend
- [ ] Создать Mongoose модель
- [ ] Добавить индексы
- [ ] Создать API routes
- [ ] Добавить middleware (auth, permissions)
- [ ] Обработать ошибки (try/catch)
- [ ] Добавить логирование

### Frontend
- [ ] Создать страницу
- [ ] Создать компоненты
- [ ] Создать custom hook для API
- [ ] Обработать loading/error states
- [ ] Добавить toast уведомления

### Documentation
- [ ] Создать bead в `beads/`
- [ ] Обновить `AGENTS.md` если нужно

### Testing
- [ ] Проверить в DevTools
- [ ] Протестировать edge cases

---

## 🎯 Existing Features

### ✅ Completed
- [x] Authentication (JWT, role-based)
- [x] Tests CRUD
- [x] Test Import (Word/PDF/Image → LaTeX)
- [x] Block Tests (варианты A/B/C/D)
- [x] Students Management
- [x] Assignments
- [x] Test Results
- [x] Public Profiles (QR codes)
- [x] Rich Text Editor (TipTap + LaTeX)
- [x] OMR Checker (Python OpenCV)

### 🔄 In Progress
- [ ] Analytics Dashboard
- [ ] Notifications

---

## 🔧 Useful Commands

```bash
# Development
cd client && npm run dev  # http://localhost:5173
cd server && npm run dev  # http://localhost:5000

# Database
mongosh "mongodb://localhost:27017/resultma"

# Scripts
npm run script:createAdmin
npm run script:seedData
npm run setup-test
```

---

## 🤖 AI Assistant Guidelines

### ПРАВИЛА ОБЩЕНИЯ (КРИТИЧНО!)

**AI ВСЕГДА общается на РУССКОМ языке.**

- **С пользователем:** Русский (кратко, по делу, без воды)
- **В коде:** Английский (переменные, функции, комментарии)
- **В UI:** Узбекский латиница (кнопки, лейблы)
- **В логах:** Английский

### Стиль работы

**ПОНИМАЙ С ПОЛУСЛОВА:**
- Если задача очевидна → делай сразу
- Если есть 2-3 варианта → спроси коротко (1 предложение)
- Если совсем непонятно → задай 1-2 уточняющих вопроса

**МИНИМУМ ТЕКСТА:**
- Не пиши длинные объяснения
- Не повторяй очевидное
- Не создавай лишние .md файлы
- Код > слова

### Рабочий процесс

#### 1. Быстрый анализ (мысленно, не пиши)
- Что нужно сделать?
- Какие файлы затронуты?
- Есть ли неясности?

#### 2. Уточни ТОЛЬКО если реально непонятно
- Не спрашивай очевидное
- Максимум 1-2 коротких вопроса

#### 3. Делай код
- Минимум необходимого
- Без лишних абстракций
- Без over-engineering

#### 4. Коротко сообщи результат
- 1-2 предложения
- Список измененных файлов

---

## 🧠 Управление памятью и задачами (Beads)

В этом проекте мы используем **beads** для отслеживания задач вместо markdown-файлов.

### Правила работы с beads

1. **ПЕРЕД началом работы** всегда проверяй текущие задачи:
   ```bash
   bd ready --json
   ```

2. **Если находишь баг или подзадачу** по ходу написания кода:
   - НЕ пиши ее в TODO-список
   - Сразу создавай тикет через CLI:
     ```bash
     bd issue create
     ```
   - Связывай зависимости между задачами

3. **Обновляй статусы задач** по мере написания кода:
   - `status: in_progress` - когда начинаешь работу
   - `status: closed` - когда завершаешь

### Структура beads/

```
beads/
├── TEMPLATE.md       # Шаблон задачи (legacy, для справки)
└── *.md              # Активные задачи (legacy)
```

**Примечание:** Постепенно переходим с markdown-файлов на CLI-управление через `bd`.

---

## 📝 Beads System (Legacy)

**Bead = атомарная задача с четким поведением**

### Создание нового bead

Когда пользователь дает НОВУЮ задачу, создай `beads/XX-название.md`:

```markdown
# 🎯 ЗАДАНИЕ ДЛЯ AI: Название

## 📊 СТАТУС: 🔄 В ПРОЦЕССЕ

**Дата создания:** 2025-02-XX

---

## 🎯 ОПИСАНИЕ ЗАДАЧИ

[Что нужно сделать]

---

## 📋 ПЛАН ДЕЙСТВИЙ

### ШАГ 1: [Название]
[Что делать]

---

## ✅ КРИТЕРИИ ВЫПОЛНЕНИЯ

- [ ] Пункт 1
- [ ] Пункт 2

---

## 📁 ФАЙЛЫ ДЛЯ ИЗМЕНЕНИЯ

- `путь/к/файлу.ts` - описание
```

### Обновление статуса

Когда задача выполнена:

```markdown
## 📊 СТАТУС: ✅ ВЫПОЛНЕНО

**Дата завершения:** 2025-02-XX
```

**Примечание:** Это legacy-подход. В будущем используй `bd issue update` для обновления статусов.

---

## ✅ ЧТО ДЕЛАТЬ

1. ✅ Общаться на РУССКОМ
2. ✅ Понимать с полуслова
3. ✅ Спрашивать только если реально непонятно
4. ✅ Писать минимум кода (без мусора)
5. ✅ Следовать паттернам проекта
6. ✅ Логировать с emoji (✅ ❌ 🔄 🔍)
7. ✅ Обновлять beads только для больших задач

---

## ❌ ЧТО НЕ ДЕЛАТЬ

1. ❌ Писать длинные объяснения
2. ❌ Создавать лишние .md файлы
3. ❌ Спрашивать очевидное
4. ❌ Over-engineering
5. ❌ Использовать `any` type
6. ❌ Fetch в компонентах
7. ❌ Default export
8. ❌ Коммитить `.env`

---

## 🎯 ТЕКУЩАЯ ЗАДАЧА

Нет активных задач. Жду новых поручений.

**Последние выполненные:**
- ✅ Chemistry Parser Enhancement - 2026-02-18 (Kimyo parserni to'liq senior darajada yozish)
- ✅ Fix Q6 Missing - 2026-02-18 ("aniqlang" so'zini qo'shish)
- ✅ Subject-Specific Parsers - 2026-02-18 (Har bir fan uchun alohida parser)
- ✅ Remove Landing Page - 2026-02-13
- ✅ Remove Admin Panels - 2026-02-13


---

## 📚 Additional Resources

### Documentation
- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com)
- [Mongoose Docs](https://mongoosejs.com)
- [MongoDB Aggregation](https://www.mongodb.com/docs/manual/aggregation/)
- [Zod Documentation](https://zod.dev)
- [BullMQ Guide](https://docs.bullmq.io)

### Internal Docs
- `client/src/README.md` - Frontend структура
- `server/src/README.md` - Backend структура
- `beads/TEMPLATE.md` - Шаблон задачи (legacy)

---

## 📝 Changelog

### v4.0.0 (2026-02-13)
- ✅ Добавлен раздел "Архитектурные правила (Core Directives)"
- ✅ MongoDB Aggregation Framework как стандарт для аналитики
- ✅ Глобальный error handler вместо try/catch в контроллерах
- ✅ Zod для валидации (планируется)
- ✅ Redis + BullMQ для фоновых задач (планируется)
- ✅ Функциональный подход к коду
- ✅ Добавлен раздел "Управление памятью и задачами (Beads)"
- ✅ Интеграция с CLI-инструментом `bd`

### v3.0.0 (2026-02-13)
- ✅ Переключен на русский язык общения
- ✅ Убрана вода, добавлена лаконичность
- ✅ "Понимай с полуслова" режим
- ✅ Минимум вопросов, максимум действий

### v2.1.0 (2026-02-12)
- ✅ Til sozlamalari o'zbek tiliga o'zgartirildi
- ✅ AI assistent endi o'zbek tilida javob beradi

### v2.0.0 (2025-02-12)
- ✅ Переработан формат по шаблону E-commerce
- ✅ Добавлено правило: ВСЕГДА общаться на русском
- ✅ Улучшена структура и читаемость
- ✅ Добавлены примеры кода и best practices
- ✅ Добавлен Feature Development Checklist
- ✅ Добавлены Architecture Patterns
- ✅ Добавлены Database Patterns
- ✅ Добавлены Common Pitfalls

### v1.0.0 (2025-01-XX)
- ✅ Первая версия AGENTS.md
- ✅ Базовые правила работы
- ✅ Beads система

---

**Последнее обновление:** 2026-02-13  
**Версия:** 4.0.0  
**Автор:** AI Assistant (Claude Sonnet 4.5)
