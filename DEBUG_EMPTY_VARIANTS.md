# 🔍 BO'SH VARIANTLAR DEBUG QILISH

## 📋 MUAMMO

Word export qilganda ba'zi variantlar bo'sh:

```
20. kasr ratsional son bo'lishi uchun x quyidagilarning qaysi biriga teng.
A) [bo'sh]
B) [bo'sh]
C) [bo'sh]
D) [bo'sh]
```

Lekin frontend da to'g'ri ko'rinadi.

---

## 🔍 DEBUG QILISH

### 1. Test ID ni Topish

Logdan:
```
GET /test/699447bf72cb8a3ebcc8c3f4
```

Test ID: `699447bf72cb8a3ebcc8c3f4`

### 2. Debug Script Ishga Tushirish

```bash
cd server
tsx src/scripts/debugVariants.ts 699447bf72cb8a3ebcc8c3f4
```

### 3. Natijani Tahlil Qilish

Script ko'rsatadi:
- Variant matn turi (string/object)
- Variant matn formati (JSON/plain)
- Variant matn qiymati
- Bo'sh yoki yo'qmi

---

## 🔧 MUMKIN BO'LGAN MUAMMOLAR

### 1. Variant Matni Bo'sh String

**Muammo:**
```json
{
  "letter": "A",
  "text": ""  // Bo'sh!
}
```

**Yechim:**
Frontend da variant kiritilmagan. Qayta tahrirlash kerak.

### 2. Variant Matni Noto'g'ri Format

**Muammo:**
```json
{
  "letter": "A",
  "text": {
    "type": "doc",
    "content": []  // Bo'sh content!
  }
}
```

**Yechim:**
TipTap editor bo'sh content yaratgan. Qayta kiritish kerak.

### 3. Variant Matni Yo'q

**Muammo:**
```json
{
  "letter": "A"
  // text property yo'q!
}
```

**Yechim:**
Database migration kerak yoki qayta kiritish.

### 4. Variant Array Bo'sh

**Muammo:**
```json
{
  "text": "Savol matni",
  "variants": []  // Bo'sh array!
}
```

**Yechim:**
Variantlar umuman kiritilmagan. Qayta yaratish kerak.

---

## 🔧 TUZATISH USULLARI

### Usul 1: Frontend da Qayta Kiritish

1. Test ni ochish
2. 20-savolni topish
3. Variantlarni qayta kiritish
4. Saqlash

### Usul 2: Database da To'g'ridan-to'g'ri Tuzatish

```javascript
// MongoDB shell
use resultma

db.tests.updateOne(
  { _id: ObjectId("699447bf72cb8a3ebcc8c3f4") },
  {
    $set: {
      "questions.19.variants": [
        { letter: "A", text: "variant A matni" },
        { letter: "B", text: "variant B matni" },
        { letter: "C", text: "variant C matni" },
        { letter: "D", text: "variant D matni" }
      ]
    }
  }
)
```

### Usul 3: Migration Script

```typescript
// server/src/scripts/fixEmptyVariants.ts
import mongoose from 'mongoose';
import Test from '../models/Test';

async function fixEmptyVariants() {
  await mongoose.connect(process.env.MONGODB_URI!);
  
  const tests = await Test.find({});
  
  for (const test of tests) {
    let modified = false;
    
    for (const question of test.questions) {
      const variants = question.variants || [];
      
      for (const variant of variants) {
        // Check if text is empty
        if (!variant.text || variant.text.trim().length === 0) {
          console.log(`⚠️ Empty variant found in test ${test._id}, question ${question.number}`);
          // Set placeholder
          variant.text = '[Variant matni kiritilmagan]';
          modified = true;
        }
      }
    }
    
    if (modified) {
      await test.save();
      console.log(`✅ Fixed test ${test._id}`);
    }
  }
  
  await mongoose.disconnect();
}

fixEmptyVariants();
```

---

## 📊 NATIJA

Debug script ishga tushgandan keyin:

```
QUESTION 20:
============================================================

📝 Question Text:
  Type: string
  Format: JSON string
  Parsed: {"type":"doc","content":[...]}

📋 Variants:

  A)
    Type: object
    Format: Object
    Has 'text' property: true
    Text type: string
    Text format: Plain string
    Text value: ""
    Text length: 0
    Text empty: YES ❌  ← MUAMMO BU YERDA!

  B)
    Type: object
    Format: Object
    Has 'text' property: true
    Text type: string
    Text format: Plain string
    Text value: ""
    Text length: 0
    Text empty: YES ❌

  C)
    Type: object
    Format: Object
    Has 'text' property: true
    Text type: string
    Text format: Plain string
    Text value: ""
    Text length: 0
    Text empty: YES ❌

  D)
    Type: object
    Format: Object
    Has 'text' property: true
    Text type: string
    Text format: Plain string
    Text value: ""
    Text length: 0
    Text empty: YES ❌

✓ Correct Answer: A
```

---

## ✅ XULOSA

**Muammo:** Variant matnlari bazada bo'sh string sifatida saqlangan.

**Yechim:**
1. Debug script ishga tushiring
2. Qaysi savollar muammoli ekanligini aniqlang
3. Frontend da qayta kiriting yoki migration script ishga tushiring

---

**Next Step:** Debug script ni ishga tushiring va natijani ko'ring!

```bash
cd server
tsx src/scripts/debugVariants.ts 699447bf72cb8a3ebcc8c3f4
```
