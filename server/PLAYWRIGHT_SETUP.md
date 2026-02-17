# Установка Playwright для PDF генерации

## Быстрая установка

```bash
cd server
npx playwright install chromium
```

## Если возникают проблемы

### Windows:
```bash
npx playwright install chromium --with-deps
```

### Linux/Docker:
```bash
npx playwright install-deps chromium
npx playwright install chromium
```

## Проверка установки

```bash
npx playwright --version
```

## Размер

- Chromium: ~150-200 MB
- Устанавливается один раз
- Переиспользуется между запросами

## Альтернатива

Если не хочется устанавливать Playwright, можно использовать старый метод (без формул):
- Закомментировать импорт `PDFGeneratorService`
- Использовать `PDFExportService` (pdfkit)
