# EvalBee — To'liq Texnik Tahlil

## 1. Umumiy ma'lumot

- **Nomi**: EvalBee (OMR sheet scanner)
- **Ishlab chiqaruvchi**: Ekodroid Labs (Hindiston)
- **Platformalar**: Android (Google Play), iOS (App Store)
- **Yuklab olishlar**: 500,000+ (Google Play)
- **Versiya**: 5.7.4 (2026-yil mart)
- **Narx**: Bepul (Enterprise plan — in-app purchase)
- **Texnologiya**: Mobil telefon kamerasi orqali OMR (Optical Mark Recognition)
- **Maqsad**: O'qituvchilarga MCQ imtihonlarini yaratish, skanerlash va baholashni avtomatlashtirish

## 2. Asosiy xususiyatlar

- 300+ savolga qadar shablon yaratish
- Real-time kamera skanerlash (alohida skaner kerak EMAS)
- Turli xil savol turlari (4/5 variant, True/False, Matrix, Numerical, Subjective)
- JEE, NEET, SAT, AIMCET kabi standart imtihon shablonlari
- Excel, Email, SMS, WhatsApp orqali natija tarqatish
- Offline ishlash imkoniyati
- Davomat boshqaruvi (v5.6.1+)

## 3. Qo'llab-quvvatlanadigan savol turlari

| Turi | Tavsif |
|------|--------|
| 4 variant | A, B, C, D |
| 5 variant | A, B, C, D, E |
| True/False | Ha/Yo'q |
| Matrix | JEE formatida matritsali javoblar |
| Numerical | Raqamli javoblar |
| Subjective | Subyektiv savollar (v5.6.2+) |

## 4. Ish jarayoni (Workflow)

```
1. O'quvchilar ro'yxatini yuklash (Excel yoki qo'lda kiritish)
2. Imtihon shablonini yaratish (savol soni, variant turi tanlash)
3. Javob varaqasi PDF generatsiya qilish → chop etish
4. To'g'ri javoblarni kiritish (Answer Key)
5. Telefon kamerasi bilan to'ldirilgan varaqalarni skanerlash (real-time)
6. Natijalarni ko'rish → Excel/Email/SMS/WhatsApp orqali tarqatish
```

## 5. Javob varaqasi (Answer Sheet) formati

### 5.1 Tarkibiy qismlar
- **4 burchakda qora indeks nuqtalari** (alignment markers) — eng muhim element
- **Bubble grid** — har bir savol uchun A/B/C/D (yoki A-E) doiralar
- O'quvchi ismi/ID yozish joyi
- Fan nomi va sana

### 5.2 Dizayn qoidalari
- Doira chiziqlari **ingichka** bo'lishi kerak — qalin bo'lsa skaner xato o'qiydi
- Faqat **2 rang** ishlatiladi: qora (majburiy, asosiy) + pushti/sariq/to'q sariq (ikkilamchi)
- **Yashil va ko'k ranglar TAQIQLANGAN** — kamera ular bilan muammo qiladi
- PDF formatida ilova ichida generatsiya qilinadi
- Rasm sifatida ham yuklab olish mumkin

### 5.3 Grid joylashuvi
- Savollar vertikal tartibda (yuqoridan pastga)
- Variantlar gorizontal tartibda (chapdan o'ngga: A, B, C, D)
- Har bir savol uchun alohida qator
- Katta imtihonlarda 2-3 ustunli grid

## 6. Skanerlash texnologiyasi

### 6.1 Umumiy yondashuv
EvalBee closed-source ilova, lekin OMR skanerlash **standart OpenCV algoritmlari** asosida ishlaydi:

### 6.2 Skanerlash bosqichlari

#### Qadam 1: Rasm olish
- Telefon kamerasi → rasm (odatda 3000×4000px)
- Real-time rejimda uzluksiz kadr olish

#### Qadam 2: Hujjat aniqlash (Document Detection)
```
Grayscale → Gaussian Blur (5×5) → Canny Edge Detection (75, 200)
→ findContours() → eng katta 4-burchakli kontur = hujjat
```

#### Qadam 3: Perspektiv tuzatish (Perspective Transform)
```
4 burchak marker topiladi → getPerspectiveTransform()
→ warpPerspective() → top-down bird's-eye ko'rinish
```

#### Qadam 4: Binary Thresholding
```
Otsu's method → avtomatik optimal threshold
→ Inversiya (to'ldirilgan joylar oq, fon qora)
```

#### Qadam 5: Bubble aniqlash (Bubble Detection)
```
Konturlar topish → filtr:
  - O'lcham: minimum 20×20 piksel
  - Aspect ratio: 0.9-1.1 (kvadratga yaqin = doira)
  - Circularity check
```

#### Qadam 6: To'ldirilganlik aniqlash
```
Har bir bubble uchun:
  1. Binary mask yaratish (cv2.drawContours → filled)
  2. Mask bilan AND operatsiya
  3. cv2.countNonZero() — qora piksellar soni
  4. Eng ko'p qora piksel = tanlangan javob
```

#### Qadam 7: Baholash
```
Aniqlangan javob vs Answer Key → to'g'ri/noto'g'ri
→ Ball hisoblash → Natija
```

### 6.3 Asosiy OpenCV funksiyalari
| Funksiya | Maqsad |
|----------|--------|
| `cv2.cvtColor()` | Rangni o'zgartirish (BGR → Gray) |
| `cv2.GaussianBlur()` | Shovqinni kamaytirish |
| `cv2.Canny()` | Qirralarni aniqlash |
| `cv2.findContours()` | Konturlarni topish |
| `cv2.approxPolyDP()` | Konturni soddalshtirish (4 burchak) |
| `cv2.getPerspectiveTransform()` | Perspektiv matritsasi |
| `cv2.warpPerspective()` | Perspektiv tuzatish |
| `cv2.threshold()` + Otsu | Binary konvertatsiya |
| `cv2.countNonZero()` | To'ldirilganlik darajasi |
| `cv2.boundingRect()` | Kontur atrofida to'rtburchak |
| `cv2.drawContours()` | Mask yaratish |

### 6.4 Muammolar va yechimlar
| Muammo | Yechim |
|--------|--------|
| Burchakdan suratga olish | Perspektiv tuzatish (4-point transform) |
| Soya tushishi | Adaptive thresholding |
| Xira/loyqa rasm | Gaussian blur + Canny |
| Qalin doira chizig'i | Kontrastni sozlash |
| Bir nechta belgilash | Eng yuqori piksel soni = javob |
| Hech narsa belgilanmagan | Minimum threshold qo'yish |

## 7. Hisobot turlari

| Hisobot | Tavsif |
|---------|--------|
| Individual natija | Har bir o'quvchiga alohida ball va javoblar |
| Sinf statistikasi | Umumiy o'rtacha, eng yuqori/past ball |
| Excel export | Barcha ma'lumotlar .xlsx formatda |
| Email natija | O'quvchilarga individual natija email orqali |
| SMS natija | SMS orqali qisqa natija |
| WhatsApp | WhatsApp orqali natija (v5.7.1+) |

## 8. So'nggi yangilanishlar

| Versiya | Sana | O'zgarish |
|---------|------|-----------|
| 5.7.4 | 2026-mart | Bug fixes |
| 5.7.1 | 2026-yanvar | WhatsApp va SMS orqali hisobot |
| 5.6.5 | 2025-sentyabr | Email OTP login, davomat WhatsApp |
| 5.6.2 | 2025-iyun | Subjective savol turi |
| 5.6.1 | 2025 | Davomat boshqaruvi |

## 9. ResultMA vs EvalBee taqqoslash

| Xususiyat | EvalBee | ResultMA |
|-----------|---------|----------|
| **Platform** | Mobil ilova (Android/iOS) | Web + Server (Node.js + Python) |
| **Skanerlash** | Real-time kamera | Rasm yuklash → server (Python OpenCV) |
| **Savol yaratish** | Faqat answer key kiritish | DOCX import, AI parsing, TipTap editor |
| **Javob varaqasi** | Ilova ichida PDF generatsiya | Server da HTML→PDF (Puppeteer) |
| **Identifikatsiya** | 4 burchak qora marker | **QR kod** + 4 burchak marker |
| **Savol turlari** | 4/5/TF/Matrix/Numerical | 4 variant (A/B/C/D) |
| **Hisobot** | Excel, Email, SMS, WhatsApp | Web dashboard, PDF |
| **CRM** | Yo'q | CRM integratsiya (crm.mathacademy.uz) |
| **Blok test** | Yo'q | Multi-fan blok testlar |
| **Grid aniqlash** | 1 usul (standart) | 2 usul (detection + layout fallback) |
| **Qalam turi** | Qora qalam faqat | Ko'k + qora qalam |
| **Adaptive threshold** | Otsu (oddiy) | Per-row adaptive + 2-pass |
| **Offline** | Ha | Yo'q (server kerak) |
| **Narx** | Bepul/Enterprise | O'z server |

## 10. EvalBee afzalliklari (bizda yo'q)

1. **Real-time skanerlash** — kamera ochiq holda jonli skanerlash (bizda rasm yuklash kerak)
2. **SMS/WhatsApp** natija tarqatish (bizda faqat web dashboard)
3. **Offline ishlaydi** — internet kerak emas (bizda server kerak)
4. **Matrix/Numerical** savol turlari (bizda faqat 4 variant)
5. **500K+ foydalanuvchi** — battle-tested, ko'p xatolar tuzatilgan
6. **Mobil-first** — telefon uchun optimallashtirilgan UX

## 11. Bizning (ResultMA) afzalliklarimiz

1. **QR kod** — talabani avtomatik aniqlash (EvalBee da qo'lda tanlash kerak)
2. **DOCX import** — test fayldan to'g'ridan-to'g'ri import qilish
3. **AI parsing** — Groq orqali savollarni avtomatik ajratish (formula, rasm)
4. **Ko'k qalam** qo'llab-quvvatlash (EvalBee faqat qora)
5. **Multi-threshold** skanerlash (4 ta threshold parallel tekshirish)
6. **Blok testlar** — bir nechta fan bitta varaqada
7. **CRM integratsiya** — o'quvchi/o'qituvchi/guruh avtomatik sinxronizatsiya
8. **LaTeX formulalar** — KaTeX orqali matematik formulalar ko'rsatish
9. **Web dashboard** — batafsil statistika va grafik hisobotlar
10. **Multi-variant** — bir testdan 4 ta variant generatsiya

## 12. Manba havolalar

- [EvalBee rasmiy sayti](https://evalbee.com/)
- [Google Play](https://play.google.com/store/apps/details?id=com.ekodroid.omrevaluator)
- [App Store](https://apps.apple.com/us/app/evalbee/id1537594035)
- [NCERT EvalBee Presentation (PDF)](https://ciet.ncert.gov.in/storage/app/public/files/17/Presentation%20PDF/Evaluating%20OMR%20Sheets%20using%20Evalbee.pdf)
- [Scribd: How to Use EvalBee](https://www.scribd.com/document/662263161/These-are-the-Steps-in-using-the-EVALBEE)
- [Scribd: EvalBee Slides](https://www.scribd.com/presentation/508550469/evalbee-slides)
- [OMR Scanner Algorithm (PyImageSearch)](https://pyimagesearch.com/2016/10/03/bubble-sheet-multiple-choice-scanner-and-test-grader-using-omr-python-and-opencv/)
- [OMRChecker (GitHub)](https://github.com/Udayraj123/OMRChecker)
