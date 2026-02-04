# Blok test OMR muammosini tuzatish

## Muammo
OMR skanerlashda QR-kod to'g'ri o'qiladi, lekin o'quvchining variantida 25 ta savol bo'lishi kerak bo'lsa ham, 30 ta savol ko'rsatiladi.

## Yechim

### 1-qadam: Serverni qayta ishga tushiring
```bash
cd server
npm run dev
```

### 2-qadam: Variantlarni yangilang (birini tanlang)

**A variant: Variantlarni qayta yaratish (TAVSIYA ETILADI)**
1. Blok test sahifasini oching
2. Eski variantlarni o'chiring
3. Yangi variantlarni yarating
4. Tayyor! Yangi variantlar to'g'ri ishlaydi

**B variant: Skript yordamida yangilash**
```bash
cd server
npx ts-node src/scripts/updateBlockTestVariants.ts
```

### 3-qadam: Tekshiring
1. QR-kodli OMR varag'ini skanerlang
2. To'g'ri miqdorda savollar ko'rsatilishini tekshiring (30 emas, 25 ta)
3. Server loglarini tekshiring - quyidagi xabar bo'lishi kerak:
   ```
   ✅ Вопросы содержат subjectId, фильтруем по конфигурации
   ✅ Jami 25 ta to'g'ri javob (filtered shuffled)
   ```

## Nima tuzatildi
- Variant yaratishda har bir savolga `subjectId` qo'shildi
- OMR skanerlashda savollar o'quvchining konfiguratsiyasi bo'yicha filtrlandi
- Umumiy savollar soni to'g'ri hisoblanadi

## Agar ishlamasa
1. Variantlar qayta yaratilganini yoki skript bilan yangilanganini tekshiring
2. Server loglarida xatolar borligini tekshiring
3. O'quvchida konfiguratsiya (`StudentTestConfig`) borligini tekshiring

## Qo'shimcha ma'lumot
- Yangi variantlar avtomatik ravishda to'g'ri ishlaydi
- Eski variantlar uchun qayta yaratish yoki skript ishlatish kerak
- Skript barcha eski variantlarni avtomatik yangilaydi

## Texnik tafsilotlar
Agar siz dasturchi bo'lsangiz, batafsil ma'lumot uchun `FIX_BLOCK_TEST_OMR.md` faylini o'qing.
