# Решение проблемы: Лишние вопросы в вариантах студентов

## Проблема

При сканировании OMR листа ответов система показывает **больше вопросов**, чем должно быть у студента.

### Пример:
- На листе написано: **"25 ta savol"** (25 вопросов)
- Студент выбрал: Биология (10), Математика (10), Tarix (5) = **25 вопросов**
- Но система показывает: **28, 29, 30** вопросы

### Причина:
Варианты были созданы **до исправления кода** или когда у студента **не было конфигурации** (StudentTestConfig).

Старый код добавлял в `shuffledQuestions` вопросы по **всем предметам** блок-теста, а не только по выбранным студентом.

---

## Решение

### 1. Код уже исправлен ✅

**Файл:** `server/src/routes/blockTest.routes.ts`

Код создания вариантов теперь:
1. Получает `StudentTestConfig` для каждого студента
2. Проходит **только** по предметам из конфигурации
3. Берет **только** нужное количество вопросов

```typescript
// ПРАВИЛЬНЫЙ КОД (уже в системе)
for (const subjectConfig of studentConfig.subjects) {
  const subjectId = (subjectConfig.subjectId._id || subjectConfig.subjectId).toString();
  const questionCount = subjectConfig.questionCount;
  
  // Находим предмет в блок-тесте
  const subjectTest = blockTest.subjectTests.find(...);
  
  // Берем ТОЛЬКО нужное количество вопросов
  const questionsToTake = Math.min(questionCount, subjectTest.questions.length);
  
  const subjectQuestions = shuffleArray([...subjectTest.questions])
    .slice(0, questionsToTake); // ← ВАЖНО!
  
  for (const question of subjectQuestions) {
    shuffledQuestions.push(shuffleVariants(question));
  }
}
```

### 2. Добавлена проверка при сканировании ✅

**Файл:** `server/src/routes/omr.routes.ts`

Теперь при сканировании система проверяет:
- Количество вопросов в варианте
- Количество вопросов в конфигурации студента
- Если не совпадают → выводит предупреждение в лог

```
⚠️⚠️⚠️ ВНИМАНИЕ! Количество вопросов не совпадает!
⚠️ В варианте: 30 вопросов
⚠️ В конфигурации студента: 25 вопросов
⚠️ РЕКОМЕНДАЦИЯ: Пересоздайте варианты для этого блок-теста!
```

### 3. Нужно пересоздать варианты ⚠️

**ВАЖНО:** Старые варианты НЕ будут работать правильно!

#### Через интерфейс:
1. Откройте блок-тест
2. Удалите старые варианты
3. Создайте новые варианты

#### Через API:
```bash
# 1. Удалить старые варианты (если есть такой эндпоинт)
DELETE /api/block-tests/:blockTestId/variants

# 2. Создать новые варианты
POST /api/block-tests/:blockTestId/generate-variants
{
  "studentIds": ["id1", "id2", ...]
}
```

---

## Проверка

### 1. Проверить конфигурацию студента

```javascript
// MongoDB
db.studenttestconfigs.findOne({ 
  studentId: ObjectId("...") 
})

// Должно показать:
{
  subjects: [
    { subjectId: ..., questionCount: 10 },
    { subjectId: ..., questionCount: 10 },
    { subjectId: ..., questionCount: 5 }
  ],
  totalQuestions: 25
}
```

### 2. Проверить вариант

```javascript
// MongoDB
db.studentvariants.findOne({ 
  variantCode: "00A2F6D0" 
})

// Проверить:
{
  shuffledQuestions: [ ... ], // Должно быть 25 элементов, не 30!
}

// Подсчитать:
db.studentvariants.aggregate([
  { $match: { variantCode: "00A2F6D0" } },
  { $project: { 
      questionCount: { $size: "$shuffledQuestions" }
  }}
])
```

### 3. Проверить при сканировании

После пересоздания вариантов:
1. Отсканируйте лист ответов
2. Проверьте логи сервера
3. Не должно быть предупреждений о несовпадении количества вопросов

---

## Важные моменты

✅ **Код создания вариантов исправлен** - использует StudentTestConfig  
✅ **Код сканирования упрощен** - берет данные только из варианта  
✅ **Добавлена проверка** - предупреждает о несовпадении  

⚠️ **Старые варианты не работают** - нужно пересоздать  
⚠️ **У всех студентов должен быть StudentTestConfig** - иначе вариант не создастся  
⚠️ **После пересоздания проверьте** - количество вопросов должно совпадать  

---

## Файлы изменены

1. `server/src/routes/omr.routes.ts` - упрощена логика, добавлена проверка
2. `server/src/routes/blockTest.routes.ts` - уже был исправлен ранее

## Документация

- `CHECK_VARIANTS.md` - инструкция по проверке вариантов
- `OMR_VARIANT_FIX.md` - описание исправления логики OMR
- `VARIANT_PROBLEM_SOLUTION.md` - этот файл
