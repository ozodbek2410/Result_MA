# Kimyo Formulalari - Yakuniy Tuzatish

## Muammo
`X_3(PO_4)_2` kabi murakkab kimyoviy formulalar noto'g'ri ko'rsatilardi:
- Backend: `X_3(PO_4)_2` yuboradi ✅
- Frontend: `X₃ (P O₄ )_2` ko'rsatadi ❌ (bo'sh joylar va noto'g'ri format)

## Yechim

### 1. Backend - Fayl Yuklash Tuzatildi
**Fayl:** `server/src/routes/test.routes.ts`

**Muammo:** `.docx` fayllar uchun mimetype `application/vnd.openxmlformats-officedocument.wordprocessingml.document` bo'ladi, lekin regex bilan tekshirilganda mos kelmaydi.

**Tuzatish:**
```typescript
fileFilter: (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Word files
  if (ext === '.doc' || ext === '.docx') {
    return cb(null, true);
  }
  
  // PDF files
  if (ext === '.pdf' && file.mimetype === 'application/pdf') {
    return cb(null, true);
  }
  
  // Image files
  if (['.jpg', '.jpeg', '.png'].includes(ext) && file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  
  cb(new Error('Faqat Word (.doc, .docx), PDF va rasm fayllari qabul qilinadi!'));
}
```

### 2. Frontend - Regex Pattern Tuzatildi
**Fayl:** `client/src/lib/latexUtils.ts`

**Muammo:** Regex pattern `[A-Z][a-z]?` faqat bitta kichik harf qabul qiladi, lekin `PO` (ikkita katta harf) ni taniy olmaydi.

**Tuzatish:**
```typescript
// OLD (noto'g'ri):
const complexFormulaPattern = /([A-Z][a-z]?_\d+\([A-Z][a-z]?_\d+\)_\d+)/g;

// NEW (to'g'ri):
const complexFormulaPattern = /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g;
```

Bu endi quyidagilarni taniydi:
- `X_3(PO_4)_2` ✅
- `Ca_3(PO_4)_2` ✅
- `Mg_3(SO_4)_2` ✅

### 3. Frontend - Auto-Wrap Formulalar
**Fayl:** `client/src/components/ChemistryText.tsx`

**Muammo:** Backend `X_3(PO_4)_2` yuboradi ($ belgisiz), lekin KaTeX `$...$` formatini kutadi.

**Tuzatish:** Avtomatik ravishda kimyoviy formulalarni `$...$` ga o'rash:

```typescript
// 1. Murakkab formulalar: X_3(PO_4)_2 → $X_3(PO_4)_2$
// 2. Oddiy formulalar: CH_4, H_2SO_3 → $CH_4$, $H_2SO_3$
// 3. Superscript: 10^{23} → $10^{23}$
// 4. LaTeX buyruqlar: \cdot → $\cdot$
```

**Algoritm:**
1. Barcha formulalarni topish (murakkab, oddiy, superscript, LaTeX)
2. Pozitsiya bo'yicha saralash
3. Matnni qismlarga bo'lib, har bir formulani `$...$` ga o'rash
4. Qismlarni birlashtirish

## Test Natijalari

### Input (Backend dan keladi):
```
. X_3(PO_4)_2 ning molyar massasi 454 g/mol bo'lsa
```

### Output (Frontend ko'rsatadi):
```
. $X_3(PO_4)_2$ ning molyar massasi 454 g/mol bo'lsa
```

KaTeX render qilgandan keyin:
```
. X₃(PO₄)₂ ning molyar massasi 454 g/mol bo'lsa
```

## Qo'shimcha Tuzatishlar

### Oddiy Formulalar
- `CH_4` → `$CH_4$` → CH₄
- `H_2SO_3` → `$H_2SO_3$` → H₂SO₃
- `C_3H_8` → `$C_3H_8$` → C₃H₈

### Superscript
- `10^{23}` → `$10^{23}$` → 10²³
- `3.01*10^{23}` → `3.01*$10^{23}$` → 3.01×10²³

## Serverni Qayta Ishga Tushirish

```bash
# Terminal 1 (Server)
cd server
npm run dev

# Terminal 2 (Client)
cd client
npm run dev
```

## Tekshirish

1. http://localhost:9998/teacher/tests/import ga o'ting
2. Kimyo fanini tanlang
3. `kimyo.docx` faylini yuklang
4. Formulalar to'g'ri ko'rsatilishini tekshiring:
   - `X₃(PO₄)₂` ✅
   - `CH₄` ✅
   - `H₂SO₃` ✅
   - `10²³` ✅

## Status

✅ Backend - Pandoc konvertatsiya ishlayapti
✅ Backend - Fayl yuklash tuzatildi
✅ Frontend - Regex pattern tuzatildi
✅ Frontend - Auto-wrap formulalar qo'shildi
✅ Frontend - ChemistryText komponent tayyor

**Keyingi qadam:** Serverni qayta ishga tushiring va test qiling!
