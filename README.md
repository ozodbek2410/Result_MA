# Ta'lim Boshqaruv Tizimi

O'quv markazlari uchun to'liq boshqaruv tizimi - filiallar, guruhlar, o'quvchilar, testlar va natijalarni boshqarish.

## ✨ Professional UX/UI Dizayn

Loyiha zamonaviy va professional UX/UI dizayn tamoyillari asosida yaratilgan:

### 🎨 Dizayn Tizimi
- **Zamonaviy Ranglar** - Gradient va depth effektlar
- **Micro-interactions** - Silliq animatsiyalar va hover effektlar
- **Typography** - Inter font family, optimal o'qilishi
- **Shadows & Depth** - Professional 3D effektlar
- **📱 Responsive Design** - Barcha ekranlar uchun optimallashtirilgan

### 🚀 Yangi Komponentlar
- **Skeleton Loaders** - Loading states uchun
- **Enhanced Alerts** - Professional bildirishnomalar
- **Loading States** - Turli xil loading indikatorlar
- **Page Headers** - Statistika bilan header komponentlar
- **Professional Cards** - Hover va animatsiya effektlar

### 🎯 UX Yaxshilanishlar
- Silliq sahifa o'tishlari
- Micro-animations barcha interaktiv elementlarda
- Professional scrollbar dizayni
- Focus states accessibility uchun
- Gradient backgrounds animatsiyalar bilan
- Glass morphism effektlar

## 📱 Responsive Design

Loyiha to'liq responsive va barcha qurilmalarda mukammal ishlaydi:

### Qo'llab-quvvatlanadigan qurilmalar
- 📱 Mobil telefonlar (375px+)
- 📱 Planshetlar (768px+)
- 💻 Noutbuklar (1024px+)
- 🖥️ Desktop (1280px+)

### Asosiy xususiyatlar
- ✅ Mobile-first yondashuv
- ✅ Touch-friendly elementlar (44px minimum)
- ✅ Adaptiv jadvallar (mobilda kartochka ko'rinishi)
- ✅ Responsive modal oynalar
- ✅ Mobil navigatsiya
- ✅ Optimallashtirilgan formalar

### Hujjatlar
- 📖 [To'liq qo'llanma](client/RESPONSIVE_GUIDE.md)
- 💻 [Kod namunalari](client/RESPONSIVE_EXAMPLES.tsx)
- ⚡ [Tezkor qo'llanma](client/RESPONSIVE_CHEATSHEET.md)

## Xususiyatlar

### Umumiy
- 🏢 Ko'p filial tizimi
- 👥 3 xil rol: SUPER_ADMIN, FIL_ADMIN, TEACHER
- 📚 Fanlar va yo'nalishlar boshqaruvi
- 🔒 JWT autentifikatsiya

### SUPER_ADMIN
- Filiallarni boshqarish
- Fanlar va yo'nalishlarni sozlash
- Foydalanuvchilar va rollar

### FIL_ADMIN
- Guruhlar yaratish va boshqarish
- O'quvchilarni qo'shish (yo'nalish va fanlar tanlash)
- O'qituvchilarni boshqarish
- Statistika

### TEACHER
- O'z guruhlarini ko'rish
- Testlar yaratish (qo'lda yoki fayl yuklash)
- Matematik formulalar (KaTeX)
- QR kod bilan javob varaqalari
- **🆕 Skaner orqali natijalarni kiritish** - yangi OMR tizimi
- Blok testlar

### O'quvchi profili
- Ochiq profil (login siz)
- Testlar tarixi va statistika
- O'rtacha natija

## Texnologiyalar

### Backend
- Node.js + Express + TypeScript
- MongoDB + Mongoose
- JWT autentifikatsiya
- Multer (fayl yuklash)
- QRCode generatsiya

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- KaTeX (matematik formulalar)
- Axios

## O'rnatish

### 1. Loyihani klonlash
\`\`\`bash
git clone <repository-url>
cd education-management-system
\`\`\`

### 2. Dependencies o'rnatish
```bash
npm run install:all
```

### 3. MongoDB o'rnatish
MongoDB o'rnatilgan bo'lishi kerak. Agar yo'q bo'lsa:
- Windows: https://www.mongodb.com/try/download/community
- Mac: \`brew install mongodb-community\`
- Linux: \`sudo apt install mongodb\`

MongoDB ishga tushirish:
\`\`\`bash
mongod
\`\`\`

### 4. Environment o'rnatish
```bash
cd server
cp .env.example .env
```

.env faylini tahrirlang:
\`\`\`
PORT=5000
MONGODB_URI=mongodb://localhost:27017/education_system
JWT_SECRET=your_secret_key_here
\`\`\`

### 5. Dastlabki ma'lumotlarni yaratish

**MUHIM:** Birinchi marta ishga tushirishdan oldin admin foydalanuvchi va asosiy ma'lumotlarni yarating:

```bash
cd server
npm run seed
```

Bu quyidagilarni yaratadi:
- ✅ Admin foydalanuvchi (username: \`admin\`, password: \`admin123\`)
- ✅ Asosiy fanlar (Matematika, Ona tili, Tarix va boshqalar)
- ✅ Demo filial

### 6. Ishga tushirish

Development rejimda (backend va frontend birga):
\`\`\`bash
npm run dev
\`\`\`

Yoki alohida:
```bash
# Server
npm run dev:server

# Client (boshqa terminalda)
npm run dev:client
```

Frontend: http://localhost:3000
Backend: http://localhost:5000

### 7. Tizimga kirish

Brauzerda http://localhost:3000 ochib, quyidagi ma'lumotlar bilan kiring:

\`\`\`
Username: admin
Password: admin123
\`\`\`

⚠️ **Xavfsizlik:** Birinchi kirishdan keyin parolni o'zgartiring!

## Fayl yuklash

Barcha fayllar `server/uploads` papkasiga saqlanadi. S3 yoki MinIO ishlatilmaydi.

Qo'llab-quvvatlanadigan formatlar:
- PDF (.pdf)
- Word (.doc, .docx)
- Excel (.xls, .xlsx)
- Rasmlar (.jpg, .png, .webp)

## API Endpoints

### Auth
- POST /api/auth/login

### Branches (SUPER_ADMIN)
- GET /api/branches
- POST /api/branches
- PUT /api/branches/:id
- DELETE /api/branches/:id

### Subjects (SUPER_ADMIN)
- GET /api/subjects
- POST /api/subjects
- PUT /api/subjects/:id

### Directions (SUPER_ADMIN)
- GET /api/directions
- POST /api/directions
- PUT /api/directions/:id

### Groups
- GET /api/groups
- POST /api/groups

### Students
- GET /api/students
- POST /api/students

### Teachers
- POST /api/teachers

### Tests
- GET /api/tests
- POST /api/tests
- POST /api/tests/:id/generate-variants

### Block Tests
- GET /api/block-tests
- POST /api/block-tests

### OMR Scanner (Новая секция)
- POST /api/omr/upload - Загрузка изображения ответного листа
- POST /api/omr/save-results - Сохранение результатов сканирования
- GET /api/omr/results/:assignmentId - Получение результатов

### Uploads
- POST /api/uploads

### Public
- GET /api/public/profile/:token

## Loyiha strukturasi

\`\`\`
education-management-system/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   ├── models/
│   │   │   ├── Branch.ts
│   │   │   ├── Subject.ts
│   │   │   ├── Direction.ts
│   │   │   ├── User.ts
│   │   │   ├── Teacher.ts
│   │   │   ├── Group.ts
│   │   │   ├── Student.ts
│   │   │   ├── StudentGroup.ts
│   │   │   ├── Test.ts
│   │   │   ├── StudentVariant.ts
│   │   │   ├── TestResult.ts
│   │   │   ├── BlockTest.ts
│   │   │   └── Upload.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── branch.routes.ts
│   │   │   ├── subject.routes.ts
│   │   │   ├── direction.routes.ts
│   │   │   ├── user.routes.ts
│   │   │   ├── teacher.routes.ts
│   │   │   ├── group.routes.ts
│   │   │   ├── student.routes.ts
│   │   │   ├── test.routes.ts
│   │   │   ├── blockTest.routes.ts
│   │   │   ├── upload.routes.ts
│   │   │   └── public.routes.ts
│   │   └── index.ts
│   ├── uploads/ (yaratiladi)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ui/
│   │   ├── layouts/
│   │   │   ├── SuperAdminLayout.tsx
│   │   │   ├── BranchAdminLayout.tsx
│   │   │   └── TeacherLayout.tsx
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── branch/
│   │   │   ├── teacher/
│   │   │   ├── LoginPage.tsx
│   │   │   └── PublicProfile.tsx
│   │   ├── store/
│   │   │   └── authStore.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── utils.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
└── package.json
\`\`\`

## Keyingi qadamlar

1. ✅ Asosiy struktura va modellar
2. ✅ Auth va rollar tizimi
3. ✅ CRUD operatsiyalar
4. ✅ Fayl yuklash
5. 🔄 Test editor (formulalar, rasmlar)
6. 🔄 Blok testlar
7. 🔄 Statistika va hisobotlar
8. 🔄 PDF generatsiya (javob varaqalari)

## Muammolar va yechimlar

### MongoDB ulanmayapti
- MongoDB ishga tushganini tekshiring: \`mongod\`
- .env faylida to'g'ri URI borligini tekshiring

### Port band
- Backend yoki frontend porti band bo'lsa, .env va vite.config.ts da portni o'zgartiring

### Fayl yuklanmayapti
- `server/uploads` papkasi mavjudligini tekshiring
- Fayl hajmi 50MB dan oshmaganini tekshiring

## Litsenziya

MIT

### O'rnatish

```bash
pip install opencv-python numpy pyzbar
```

### Ishlatish

1. Titul varaqa yaratish: `/teacher/titul-generator`
2. Varaqani to'ldirish (qora qalam)
3. Skanerlash:
   - Real-time: Kamera oldiga qo'ying
   - Fayl yuklash: Rasmni yuklang

### Natija

```json
{
  "success": true,
  "qrData": { "studentId": "...", "testId": "..." },
  "omrData": {
    "variant": "A",
    "answers": { "1": "B", "2": "A", ... },
    "confidence": 92
  }
}
```

To'liq qo'llanma: `PYTHON_OMR_SETUP.md`


## 📸 OMR Checker - Python OCR bilan Javob Tekshirish

### Yangi yondashuv!

Eski skaner tizimi to'liq olib tashlandi va o'rniga Python OpenCV yordamida javoblarni tekshirish tizimi qo'shildi.

### Asosiy farq

**Eski tizim:**
- ❌ Murakkab OCR va QR-kod skanerlash
- ❌ Brauzerda sekin ishlash
- ❌ Ko'p xatoliklar

**Yangi tizim:**
- ✅ **Sodda va tez** - Python OpenCV
- ✅ **Bo'sh aylanalar = to'g'ri javob** (yashil)
- ✅ **Bo'yalgan aylanalar = noto'g'ri javob** (qizil)
- ✅ **QR-kod** - To'g'ri javoblar avtomatik o'qiladi
- ✅ **Yuqori aniqlik** - Hough Circle Transform algoritmi

### Qanday ishlaydi?

1. **Rasmni yuklash** - Test javob varag'i rasmini yuklang
2. **QR-kod o'qish** - Agar rasmda QR-kod bo'lsa, to'g'ri javoblar avtomatik o'qiladi
3. **Qo'lda kiriting** - Yoki to'g'ri javoblarni JSON formatida kiriting: `["A","B","C","D",...]`
4. **Tekshirish** - Python skript avtomatik tekshiradi
5. **Natija** - To'g'ri/noto'g'ri javoblar, ball, annotated image

### QR-kod formati

QR-kodda to'g'ri javoblar JSON formatida bo'lishi kerak:

```json
{
  "correctAnswers": ["A", "B", "C", "D", "A", "B", ...]
}
```

Yoki sodda array:

```json
["A", "B", "C", "D", "A", "B", ...]
```

### Foydalanish

```
1. Menyu → Javob Tekshirish
2. Javob varaqasining rasmini yuklang
3. Savollar sonini kiriting
4. To'g'ri javoblarni kiriting (yoki QR-koddan o'qiladi)
5. "Tekshirish" tugmasini bosing
6. Natijalarni ko'ring
```

### Python o'rnatish

```bash
cd server/python
pip install -r requirements.txt
```

### Rasm talablari

- ✅ Aylanalar aniq ko'rinadi
- ✅ Yaxshi yoritilgan
- ✅ Soya va yorug'lik aksi yo'q
- ✅ Bo'sh aylanalar = to'g'ri javob
- ✅ Bo'yalgan aylanalar = noto'g'ri javob
- ✅ QR-kod (ixtiyoriy) - to'g'ri javoblar uchun

### Texnologiyalar

- **Python** - Backend
- **OpenCV** - Rasm qayta ishlash
- **pyzbar** - QR-kod o'qish
- **Hough Circle Transform** - Aylanalarni topish
- **NumPy** - Matematik hisoblashlar

### API Endpoints

```http
POST /api/omr/check-answers
  - image: File
  - correctAnswers: JSON array (ixtiyoriy, QR-koddan o'qiladi)

DELETE /api/omr/image/:filename
```

### Fayl strukturasi

```
server/
├── python/
│   ├── omr_checker.py              # Python skript
│   ├── requirements.txt            # Dependencies
│   └── README.md                   # Python qo'llanma
├── src/routes/
│   └── omr.routes.ts               # API endpoints
└── uploads/omr/                    # Yuklangan rasmlar

client/src/
└── pages/teacher/
    └── OMRCheckerPage.tsx          # Frontend sahifa
```

### Natija formati

```json
{
  "success": true,
  "correct": 25,
  "incorrect": 5,
  "total": 30,
  "score": 83.33,
  "results": [
    {
      "question": 1,
      "student_answer": "A",
      "correct_answer": "A",
      "is_correct": true
    }
  ],
  "annotated_image": "checked_image.jpg",
  "qr_data": {
    "found": true,
    "answers_count": 30
  }
}
```

### Kelajakda

- [ ] Bir vaqtda ko'p varaqalarni tekshirish
- [ ] Avtomatik perspektiva tuzatish
- [ ] Turli formatdagi varaqalar
- [ ] Mobil ilova
- [ ] Student ma'lumotlarini QR-koddan o'qish

---

**Muvaffaqiyatli tekshirish!** 🎉

## 🚀 VPS'ga Deploy Qilish

### Python O'rnatish

VPS'da OMR tizimi ishlashi uchun Python va kutubxonalar kerak:

```bash
# Tezkor o'rnatish
sudo apt update
sudo apt install python3 python3-pip -y
pip3 install opencv-python-headless numpy pyzbar pillow
```

📖 **To'liq qo'llanma:** `PYTHON_VPS_INSTALL.md`

### Deploy Qilish

```bash
# Local kompyuterdan
./deploy.sh
```

Deploy script avtomatik:
- ✅ Python va kutubxonalarni o'rnatadi
- ✅ Papkalarni yaratadi
- ✅ Python scriptlarni nusxalaydi
- ✅ PM2 bilan server'ni ishga tushiradi
- ✅ Nginx va SSL sozlaydi

### Muammolarni Hal Qilish

Agar `/api/omr/check-answers` 500 xatolik bersa:

```bash
# VPS'da diagnostika
cd /var/www/mathacademy
bash check-vps-setup.sh
```

📖 **Qo'llanmalar:**
- `VPS_QUICK_FIX.md` - Tezkor yechimlar (5 daqiqa)
- `VPS_TROUBLESHOOTING.md` - To'liq troubleshooting
- `VPS_COMMANDS.md` - Foydali buyruqlar
- `PYTHON_VPS_INSTALL.md` - Python o'rnatish

### Tez-tez Ishlatiladigan Buyruqlar

```bash
# Loglarni ko'rish
pm2 logs mathacademy-server

# Server'ni qayta ishga tushirish
pm2 restart mathacademy-server

# Python tekshirish
python3 -c "import cv2, numpy; print('OK')"
```

---

**Muvaffaqiyatli tekshirish!** 🎉
