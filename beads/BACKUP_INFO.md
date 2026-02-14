# 🗑️ Удаленные файлы - Backup Info

## ШАГ 6: Удаление старых страниц

**Дата:** 2026-02-13

---

## Файлы для удаления

### 1. ImportTestPage.tsx
**Путь:** `client/src/pages/teacher/ImportTestPage.tsx`  
**Размер:** ~600 строк  
**Заменен на:** `client/src/pages/teacher/Tests/TestImportPage.tsx`

**Причина удаления:**
- Дублирует функционал новой unified страницы
- Только для Regular тестов
- Новая страница поддерживает оба типа

### 2. ImportBlockTestPage.tsx (опционально)
**Путь:** `client/src/pages/teacher/ImportBlockTestPage.tsx`  
**Размер:** ~400 строк  
**Заменен на:** `client/src/pages/teacher/Tests/TestImportPage.tsx`

**Причина удаления:**
- Дублирует функционал новой unified страницы
- Только для Block тестов
- Новая страница поддерживает оба типа

**Примечание:** Можно оставить пока, так как `/block-tests/import` все еще использует эту страницу

---

## Роуты для удаления

### В TeacherLayout.tsx

**Удалить:**
```typescript
<Route path="/tests/import-old" element={<ImportTestPage />} />
```

**Опционально удалить:**
```typescript
<Route path="/block-tests/import-old" element={<ImportBlockTestPage />} />
```

**Обновить (если удаляем ImportBlockTestPage):**
```typescript
// Было:
<Route path="/block-tests/import" element={<ImportBlockTestPage />} />

// Станет:
<Route path="/block-tests/import" element={<UnifiedTestImportPage />} />
```

---

## Импорты для удаления

### В TeacherLayout.tsx

**Удалить:**
```typescript
const ImportTestPage = lazy(() => import('../pages/teacher/ImportTestPage'));
```

**Опционально удалить:**
```typescript
const ImportBlockTestPage = lazy(() => import('../pages/teacher/ImportBlockTestPage'));
```

---

## Временные файлы для удаления

### TestTypeSwitchDemo.tsx
**Путь:** `client/src/pages/teacher/Tests/TestTypeSwitchDemo.tsx`  
**Размер:** ~150 строк  
**Причина:** Это была demo страница для тестирования компонента

---

## Как восстановить (если нужно)

### Через Git
```bash
git checkout HEAD -- client/src/pages/teacher/ImportTestPage.tsx
git checkout HEAD -- client/src/pages/teacher/ImportBlockTestPage.tsx
```

### Вручную
Файлы можно найти в истории Git коммитов до этого изменения.

---

## Проверка перед удалением

- [ ] Новая страница протестирована
- [ ] Все функции работают
- [ ] Нет критических багов
- [ ] Создан git commit перед удалением
- [ ] Пользователь дал подтверждение

---

**ВАЖНО:** Перед удалением обязательно сделать git commit!

```bash
git add .
git commit -m "feat: add unified test import page (before cleanup)"
```
