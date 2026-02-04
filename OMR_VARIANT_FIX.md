# Исправление: Данные берутся только из варианта студента

## Проблема 1: Множественные источники данных
Система брала данные из нескольких источников:
1. StudentVariant (вариант студента)
2. Test/BlockTest (оригинальный тест)
3. StudentTestConfig (конфигурация студента)

Это приводило к:
- Неправильному количеству вопросов
- Несоответствию правильных ответов
- Сложной логике с фильтрацией

## Проблема 2: Лишние вопросы в варианте
При создании варианта в `shuffledQuestions` попадали вопросы по **ВСЕМ предметам** блок-теста, а не только по тем, которые выбрал студент.

**Пример:**
- Студент выбрал: Biologiya (10 вопросов), Matematika (10 вопросов), Tarix (5 вопросов) = 25 вопросов
- В варианте было: Biologiya (10), Matematika (10), Tarix (5), Fizika (10), Kimyo (10) = 45 вопросов
- На листе написано "25 ta savol", но в варианте 45 вопросов!

## Решение

### 1. Исправлена генерация вариантов (blockTest.routes.ts)

**Было:**
```typescript
for (const subjectTest of blockTest.subjectTests) {
  // Брало ВСЕ предметы из блок-теста
  shuffledQuestions.push(...subjectTest.questions);
}
```

**Стало:**
```typescript
// Получаем конфигурацию студента
const studentConfig = await StudentTestConfig.findOne({ studentId });

// Берем ТОЛЬКО выбранные предметы
for (const subjectConfig of studentConfig.subjects) {
  const questionCount = subjectConfig.questionCount;
  // Берем только нужное количество вопросов
  const questions = subjectTest.questions.slice(0, questionCount);
  shuffledQuestions.push(...questions);
}
```

### 2. Упрощена логика чтения варианта (omr.routes.ts)

**Было:**
- Читал вариант
- Потом шел в Test/BlockTest
- Применял фильтрацию по StudentTestConfig
- Сложная логика с проверками

**Стало:**
```typescript
// Только из варианта!
variantInfo.shuffledQuestions.forEach((question, index) => {
  correctAnswers[index + 1] = question.correctAnswer;
});
```

### Что изменилось:

1. **При создании варианта** - берутся только предметы из StudentTestConfig
2. **При сканировании** - все данные из варианта, без дополнительных запросов
3. **Количество вопросов** = `variantInfo.shuffledQuestions.length`
4. **Правильные ответы** = из `variantInfo.shuffledQuestions[i].correctAnswer`

### Преимущества:

✅ Вариант содержит только нужные вопросы  
✅ Простая логика - один источник данных  
✅ Нет несоответствий между источниками  
✅ Быстрее работает (меньше запросов к БД)  
✅ Легче поддерживать и отлаживать  

### Важно:

⚠️ **Нужно пересоздать все старые варианты!**  
⚠️ Старые варианты содержат лишние вопросы  
⚠️ Студенты без StudentTestConfig будут пропущены при генерации  

## Файлы изменены:
- `server/src/routes/blockTest.routes.ts` - исправлена генерация вариантов (фильтрация по StudentTestConfig)
- `server/src/routes/omr.routes.ts` - упрощена логика получения данных из QR-кода

## Тестирование:
1. Удалите старые варианты для блок-теста
2. Создайте новые варианты (они будут содержать только выбранные предметы)
3. Отсканируйте лист ответов с QR-кодом
4. Проверьте что количество вопросов соответствует конфигурации студента
