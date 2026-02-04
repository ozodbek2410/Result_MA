# Проверка и исправление вариантов

## Проблема
Варианты студентов содержат вопросы по **всем предметам** блок-теста, а не только по тем, которые выбрал студент в конфигурации.

## Пример:
- Студент выбрал: Биология (10 вопросов), Математика (10 вопросов), Tarix (5 вопросов) = **25 вопросов**
- Но в варианте: 30 вопросов (включая предметы, которые студент не выбрал)

## Решение

### 1. Проверить варианты в базе данных

Подключитесь к MongoDB и выполните:

\`\`\`javascript
// Найти вариант по QR-коду
db.studentvariants.findOne({ variantCode: "00A2F6D0" })

// Проверить количество вопросов
db.studentvariants.aggregate([
  { $match: { variantCode: "00A2F6D0" } },
  { $project: { 
      variantCode: 1,
      questionCount: { $size: "$shuffledQuestions" }
  }}
])

// Проверить конфигурацию студента
db.studenttestconfigs.findOne({ studentId: ObjectId("...") })
\`\`\`

### 2. Пересоздать варианты

**ВАЖНО:** Код создания вариантов уже исправлен и использует `StudentTestConfig`.

Чтобы пересоздать варианты:

1. Откройте интерфейс блок-теста
2. Удалите старые варианты
3. Создайте новые варианты

Или через API:

\`\`\`bash
# Удалить старые варианты
DELETE /api/block-tests/:blockTestId/variants

# Создать новые варианты
POST /api/block-tests/:blockTestId/generate-variants
{
  "studentIds": ["studentId1", "studentId2", ...]
}
\`\`\`

### 3. Проверить что варианты созданы правильно

После пересоздания проверьте:

\`\`\`javascript
// Проверить что количество вопросов соответствует конфигурации
db.studentvariants.aggregate([
  {
    $lookup: {
      from: "studenttestconfigs",
      localField: "studentId",
      foreignField: "studentId",
      as: "config"
    }
  },
  {
    $project: {
      variantCode: 1,
      questionsInVariant: { $size: "$shuffledQuestions" },
      totalQuestionsInConfig: { $arrayElemAt: ["$config.totalQuestions", 0] }
    }
  }
])
\`\`\`

## Код создания вариантов (уже исправлен)

Файл: `server/src/routes/blockTest.routes.ts`

Логика:
1. Получает `StudentTestConfig` для каждого студента
2. Проходит только по предметам из конфигурации
3. Берет только нужное количество вопросов для каждого предмета
4. Сохраняет в `shuffledQuestions`

\`\`\`typescript
for (const subjectConfig of studentConfig.subjects) {
  const subjectId = (subjectConfig.subjectId._id || subjectConfig.subjectId).toString();
  const questionCount = subjectConfig.questionCount;
  
  // Находим этот предмет в блок-тесте
  const subjectTest = blockTest.subjectTests.find(...);
  
  // Берем только нужное количество вопросов
  const questionsToTake = Math.min(questionCount, subjectTest.questions.length);
  
  // Shuffle и добавляем в shuffledQuestions
  const subjectQuestions = shuffleArray([...subjectTest.questions]).slice(0, questionsToTake);
  ...
}
\`\`\`

## Важно!

⚠️ **Старые варианты НЕ будут работать правильно!**  
⚠️ **Нужно пересоздать варианты после исправления кода**  
⚠️ **Проверьте что у всех студентов есть StudentTestConfig**
