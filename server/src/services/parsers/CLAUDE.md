# parsers/ — Kontekst

## Vazifasi
DOCX fayllardan test savollarini parse qilish. Har bir fan uchun maxsus parser, barchasi `BaseParser` dan meros oladi.

## Qoidalar
- Yangi parser: `BaseParser` dan extend qil, `parse()` metodini implement qil
- `ParserFactory.ts` ga yangi fanni qo'shishni UNUTMA
- `ParsedQuestion` interfeysi: `{ text, variants, correctAnswer, points, media? }`
- Rasm: `extractedImages` Map'ga saqlash, URL qaytarish
- Jadval: `TableExtractor` + `TableRenderer` orqali HTML jadvalga aylantirish
- Variant format: `{ letter: 'A'|'B'|'C'|'D', text: string }`
- Test: `__tests__/` papkada yoz

## Namuna
```typescript
// Yangi parser yaratish
export class HistoryParser extends BaseParser {
  async parse(filePath: string): Promise<ParsedQuestion[]> {
    const markdown = await this.docxToMarkdown(filePath);
    const { cleanText } = this.preCleanText(markdown);
    const questions = this.extractQuestions(cleanText);
    return questions;
  }
}
// ParserFactory.ts ga qo'shish:
// if (normalizedSubject.includes('tarix') || normalizedSubject.includes('history')) {
//   return new HistoryParser();
// }
```
