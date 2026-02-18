# 🏠 Localhost Setup (Windows)

## 🎯 MAQSAD

Word export system ni localhost da test qilish.

---

## 📋 KERAKLI DASTURLAR

### 1. Redis (Windows)

**Option A: Memurai (Tavsiya - Oson)**

1. Download: https://www.memurai.com/get-memurai
2. Install (Next, Next, Finish)
3. Avtomatik ishga tushadi ✅

**Option B: WSL2 + Redis**

```powershell
# WSL2 o'rnatish
wsl --install

# Ubuntu ichida
sudo apt update
sudo apt install redis-server
redis-server
```

**Test:**
```powershell
# Memurai bilan
redis-cli ping
# Output: PONG ✅
```

---

### 2. Pandoc

**Download va Install:**

1. https://pandoc.org/installing.html
2. Windows installer yuklab oling
3. Install qiling
4. Restart terminal

**Test:**
```powershell
pandoc --version
# Output: pandoc 3.x.x ✅
```

---

### 3. MinIO (Optional - S3 uchun)

**Option A: MinIO ishlatmaslik (Oddiy test uchun)**

Agar faqat test qilmoqchi bo'lsangiz, MinIO shart emas. Eski sync versiya ishlaydi.

**Option B: MinIO o'rnatish (To'liq test uchun)**

```powershell
# Download
# https://min.io/download#/windows

# Run
.\minio.exe server C:\minio-data --console-address ":9001"

# Browser: http://localhost:9001
# Login: minioadmin / minioadmin
```

---

## 🚀 QUICK START (Eng Oddiy)

### 1. Dependencies O'rnatish

```powershell
cd server
npm install
```

### 2. Environment Sozlash

`.env` faylni tahrirlang:

```env
# Existing
PORT=5000
MONGODB_URI=mongodb://localhost:27017/resultma
JWT_SECRET=your_secret

# NEW - Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# NEW - MinIO (agar ishlatmasangiz, bu qismni o'tkazing)
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY=minioadmin
# AWS_SECRET_KEY=minioadmin
# S3_BUCKET=resultma-exports
# S3_ENDPOINT=http://localhost:9000
# USE_MINIO=true

# NEW - Worker
WORKER_CONCURRENCY=5
WORKER_MAX_JOBS_PER_MINUTE=50
```

### 3. Build

```powershell
npm run build
```

### 4. Ishga Tushirish

**Terminal 1 (API Server):**
```powershell
cd server
npm run dev
```

**Terminal 2 (Worker):**
```powershell
cd server
npm run worker
```

**Terminal 3 (Frontend):**
```powershell
cd client
npm run dev
```

### 5. Test Qilish

1. Browser: http://localhost:5173
2. Login qiling
3. Test yarating
4. O'quvchilar tanlang
5. "Word yuklash" tugmasini bosing
6. Progress bar ko'rinishi kerak
7. Fayl yuklab olinishi kerak

---

## 🔍 TEKSHIRISH

### Redis Ishlayaptimi?

```powershell
redis-cli ping
# Output: PONG ✅
```

### Worker Ishlayaptimi?

Terminal 2 da ko'rishingiz kerak:
```
🚀 Starting BullMQ Worker...
📦 Process ID: 12345
✅ MongoDB connected
✅ Worker started successfully
⏳ Waiting for jobs...
```

### API Ishlayaptimi?

```powershell
curl http://localhost:5000/health
# yoki browser da ochish
```

---

## 🎬 DEMO VIDEO (Step-by-step)

### Step 1: Redis Ishga Tushirish

```powershell
# Agar Memurai o'rnatgan bo'lsangiz, avtomatik ishga tushadi
# Test:
redis-cli ping
```

### Step 2: MongoDB Ishga Tushirish

```powershell
# Agar MongoDB service sifatida o'rnatilgan bo'lsa, avtomatik ishlamoqda
# Test:
mongosh
# > show dbs
```

### Step 3: Server Dependencies

```powershell
cd C:\Users\YourName\resultMA\server
npm install
```

### Step 4: Build

```powershell
npm run build
```

### Step 5: 3 ta Terminal Ochish

**Terminal 1:**
```powershell
cd C:\Users\YourName\resultMA\server
npm run dev
```

Kutilayotgan output:
```
✅ MongoDB connected
✅ Server running on port 5000
```

**Terminal 2:**
```powershell
cd C:\Users\YourName\resultMA\server
npm run worker
```

Kutilayotgan output:
```
🚀 Starting BullMQ Worker...
✅ MongoDB connected
✅ Worker started successfully
⏳ Waiting for jobs...
```

**Terminal 3:**
```powershell
cd C:\Users\YourName\resultMA\client
npm run dev
```

Kutilayotgan output:
```
  VITE v5.x.x  ready in 500 ms
  ➜  Local:   http://localhost:5173/
```

### Step 6: Test

1. Browser: http://localhost:5173
2. Login (teacher account)
3. Tests → Create Test
4. Add questions with LaTeX formulas
5. Assign to students
6. Go to Print page
7. Select students
8. Click "Word yuklash"
9. Watch progress bar
10. File downloads! ✅

---

## 🐛 MUAMMOLAR VA YECHIMLAR

### ❌ "Redis connection refused"

**Muammo:** Redis ishlamayapti

**Yechim:**
```powershell
# Memurai ni restart qiling
# Services → Memurai → Restart

# Yoki WSL2 da:
wsl
redis-server
```

---

### ❌ "Worker not processing jobs"

**Muammo:** Worker ishlamayapti yoki Redis ga ulanmayapti

**Yechim:**
```powershell
# Terminal 2 ni tekshiring
# Xatolik bormi?

# Redis test
redis-cli ping

# Worker restart
# Ctrl+C
npm run worker
```

---

### ❌ "Pandoc not found"

**Muammo:** Pandoc o'rnatilmagan yoki PATH da yo'q

**Yechim:**
```powershell
# Pandoc o'rnatish
# https://pandoc.org/installing.html

# Terminal restart qiling
# Test:
pandoc --version
```

---

### ❌ "S3 upload failed"

**Muammo:** MinIO ishlamayapti yoki sozlanmagan

**Yechim 1 (MinIO ishlatmaslik):**

Frontend da eski sync versiyaga fallback bo'ladi avtomatik.

**Yechim 2 (MinIO ishlatish):**
```powershell
# MinIO ishga tushirish
.\minio.exe server C:\minio-data --console-address ":9001"

# Browser: http://localhost:9001
# Bucket yaratish: resultma-exports
```

---

### ❌ "Port 5000 already in use"

**Muammo:** Port band

**Yechim:**
```powershell
# Portni o'zgartirish (.env)
PORT=5001

# Yoki band processni to'xtatish
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

---

## 📊 KUTILAYOTGAN NATIJA

### Terminal 1 (API):
```
✅ MongoDB connected
✅ Server running on port 5000
✅ [API] Job test-123-1234567890 queued for test 699447bf72cb8a3ebcc8c3f4 (5 students)
```

### Terminal 2 (Worker):
```
🔄 [Worker 12345] Processing job test-123-1234567890 for test 699447bf72cb8a3ebcc8c3f4
📊 [Worker 12345] Students: 5, Settings: {...}
✅ [Worker 12345] Test loaded: Matematika Test
✅ [Worker 12345] Loaded 5 variants
✅ [Worker 12345] Test data prepared: 5 students
📄 [Worker 12345] Generating Word with Pandoc...
✅ [Worker 12345] Word generated: 245.67 KB
✅ [Worker 12345] Job test-123-1234567890 completed successfully
```

### Browser:
```
Progress bar: 0% → 10% → 30% → 50% → 70% → 85% → 100%
Toast: "Word tayyor!"
File downloads: test-matematika-1234567890.docx
```

---

## 🎯 MINIMAL SETUP (Faqat Test Uchun)

Agar faqat ishini ko'rmoqchi bo'lsangiz:

### 1. Redis O'rnatish

- Memurai: https://www.memurai.com/get-memurai
- Install → Next → Finish
- Avtomatik ishga tushadi

### 2. Pandoc O'rnatish

- https://pandoc.org/installing.html
- Windows installer
- Install → Restart terminal

### 3. Dependencies

```powershell
cd server
npm install
```

### 4. .env Sozlash

```env
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
WORKER_CONCURRENCY=5
```

### 5. Ishga Tushirish

```powershell
# Terminal 1
npm run dev

# Terminal 2
npm run worker

# Terminal 3
cd ../client
npm run dev
```

### 6. Test

http://localhost:5173 → Word yuklash

---

## ✅ SUCCESS CHECKLIST

- [ ] Redis o'rnatildi (Memurai)
- [ ] Pandoc o'rnatildi
- [ ] `npm install` bajarildi
- [ ] `.env` sozlandi
- [ ] Terminal 1: API ishlamoqda
- [ ] Terminal 2: Worker ishlamoqda
- [ ] Terminal 3: Frontend ishlamoqda
- [ ] Redis test: `redis-cli ping` → PONG
- [ ] Pandoc test: `pandoc --version` → 3.x.x
- [ ] Browser: http://localhost:5173 ochiladi
- [ ] Word yuklash tugmasi ishlaydi
- [ ] Progress bar ko'rinadi
- [ ] Fayl yuklab olinadi

---

## 🎓 KEYINGI QADAM

Agar localhost da ishlasa:

1. ✅ VPS ga deploy qilish
2. ✅ PM2 bilan production setup
3. ✅ Nginx reverse proxy
4. ✅ SSL certificate
5. ✅ Monitoring

---

## 📞 YORDAM

**Muammo bo'lsa:**

1. Terminal 2 (Worker) loglarini ko'ring
2. Browser Console (F12) ni tekshiring
3. `redis-cli ping` test qiling
4. `pandoc --version` test qiling

**Umumiy xatolar:**
- Redis ishlamayapti → Memurai restart
- Pandoc topilmadi → Terminal restart
- Port band → `.env` da PORT o'zgartiring
- Worker ishlamayapti → Terminal 2 ni tekshiring

---

**Status:** ✅ READY FOR LOCALHOST TESTING  
**Time:** ~10 daqiqa setup  
**Next:** Test qiling va natijani ko'ring!
