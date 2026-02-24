# Yangi Fan Parseri Qo'shish

## Qachon ishlatilsin
"yangi fan parser", "parser qo'sh", "DOCX parser", "fan qo'sh", "subject parser"

## Qadamlar
1. `server/src/services/parsers/[Fan]Parser.ts` — BaseParser'dan extend
2. `server/src/services/parsers/ParserFactory.ts` — yangi fanni register
3. Test yozish (ixtiyoriy): `server/src/services/parsers/__tests__/`

## Shablon
```typescript
import { BaseParser, ParsedQuestion } from './BaseParser';

export class HistoryParser extends BaseParser {
  async parse(filePath: string): Promise<ParsedQuestion[]> {
    // 1. DOCX → Markdown
    const markdown = await this.docxToMarkdown(filePath);

    // 2. Matnni tozalash
    const { cleanText } = this.preCleanText(markdown);

    // 3. Savollarni ajratish
    const questions = this.extractQuestions(cleanText);

    // 4. Rasmlarni ulash (agar bor bo'lsa)
    return this.attachMedia(questions);
  }

  // Fan-spetsifik tozalash (ixtiyoriy override)
  protected preCleanText(text: string): { cleanText: string; mathBlocks: string[] } {
    const result = super.preCleanText(text);
    // Fan-spetsifik tozalash logikasi
    return result;
  }
}
```

### ParserFactory.ts ga qo'shish
```typescript
// createParser() metodi ichiga:
if (normalizedSubject.includes('tarix') || normalizedSubject.includes('history')) {
  return new HistoryParser();
}
```

## Checklist
- [ ] Parser BaseParser'dan extend qilingan
- [ ] `parse()` metodi implement qilingan
- [ ] ParserFactory.ts da register qilingan
- [ ] getSupportedSubjects() ga fan nomi qo'shilgan
- [ ] getParserInfo() da parser ma'lumotlari qo'shilgan

## TOKEN TEJASH
- Faqat yangi parser fayli va ParserFactory diff ko'rsat
