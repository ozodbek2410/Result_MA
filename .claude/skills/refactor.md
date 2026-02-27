# Kodni Refactor Qilish

## Qachon ishlatilsin
"refactor", "qayta yoz", "optimizatsiya", "tozala", "tuzilishini o'zgartir", "code smell"

## Qadamlar
1. **Hozirgi kodni o'qi** — nima qilayotganini tushun
2. **Muammoni aniqlash** — nima noto'g'ri? (takrorlanish, murakkablik, noto'g'ri abstraksiya)
3. **Reja**: Qanday o'zgartirish kerak? Minimal o'zgartirish bilan
4. **Refactor**: Faqat kerakli joyni o'zgartir
5. **Tekshir**: Import'lar buzilmadimi? Boshqa fayllar ta'sirlanmadimi?

## Checklist

### Umumiy
- [ ] Funksionallik o'zgarmadi (faqat tuzilish yaxshilandi)
- [ ] Import'lar yangilandi
- [ ] TypeScript xatolik yo'q

### React komponent
- [ ] Props interface aniq
- [ ] Keraksiz re-render yo'q (useMemo, useCallback kerak joyda)
- [ ] State minimal (derived state yo'q)

### Backend service
- [ ] Error handling bor
- [ ] Logger ishlatilgan (console.log emas)
- [ ] Async/await to'g'ri ishlatilgan

### Mongoose model
- [ ] Index'lar qo'shilgan (tez-tez query qilinadigan field'lar)
- [ ] ref'lar to'g'ri

## TOKEN TEJASH
- Faqat o'zgargan qismlarni diff ko'rsat
- Butun faylni qayta chiqarma
- "Nima o'zgardi" — 1-2 qator bilan ayt
