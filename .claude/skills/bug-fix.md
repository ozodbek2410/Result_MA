# Xatoni Topish va Tuzatish

## Qachon ishlatilsin
"xato", "bug", "ishlamayapti", "error", "crash", "tuzat", "fix", "noto'g'ri"

## Qadamlar
1. **Xato turini aniqlash**: Frontend (React) yoki Backend (Express/Mongoose)?
2. **Xato joyini topish**:
   - Frontend: Browser console, Network tab, komponent kodi
   - Backend: Server log (`logger`), route handler, service/model
3. **Root cause**: Xato qayerdan kelyapti? (API, DB query, state, props)
4. **Tuzatish**: Minimal o'zgartirish bilan tuzat
5. **Tekshirish**: Xato qaytarilmasligini tasdiqlash

## Tez diagnostika

### "Cannot read property of undefined"
→ Optional chaining (`?.`) qo'sh yoki null check qil

### "404 Not Found" (API)
→ Route to'g'ri register qilinganmi? `server/src/index.ts` tekshir

### "401 Unauthorized"
→ Token bormi? `authenticate` middleware qo'shilganmi?

### "Cast to ObjectId failed"
→ ID format to'g'rimi? `mongoose.Types.ObjectId.isValid(id)` bilan tekshir

### React "Too many re-renders"
→ useEffect dependency array tekshir, setState loop yo'qmi?

### "CORS error"
→ `server/src/index.ts` da `cors()` middleware bormi?

## Checklist
- [ ] Xato aniq reproduce qilinadi
- [ ] Root cause topildi
- [ ] Fix minimal va faqat kerakli joyni o'zgartiradi
- [ ] Boshqa joylar buzilmadi

## TOKEN TEJASH
- Faqat xato va fix ko'rsat, butun faylni chiqarma
- Diagnostika natijasini 1-2 qatorda ayt
