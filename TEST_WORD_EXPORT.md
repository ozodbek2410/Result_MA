# 🧪 Word Export System - Test Plan

## ✅ IMPLEMENTATSIYA YAKUNLANDI

### Qo'shilgan Fayllar:

1. **Backend:**
   - `server/src/services/queue/wordExportQueue.ts` - BullMQ queue va worker
   - `server/src/services/s3Service.ts` - S3/MinIO file storage
   - `server/src/worker.ts` - Worker entry point
   - `server/src/routes/test.routes.ts` - Yangi async endpoints
   - `server/src/routes/blockTest.routes.ts` - Yangi async endpoints

2. **Frontend:**
   - `client/src/pages/teacher/TestPrintPage.tsx` - Async export + progress

3. **Infrastructure:**
   - `docker-compose.yml` - Full stack (MongoDB, Redis, MinIO, API, Workers)
   - `server/Dockerfile` - Production-ready container
   - `WORD_EXPORT_SETUP.md` - Setup documentation

4. **Dependencies:**
   - `server/package.json` - BullMQ, AWS SDK qo'shildi

---

## 🚀 KEYINGI QADAMLAR

### 1. Dependencies O'rnatish

```bash
cd server
npm install
```

### 2. Infrastructure Ishga Tushirish

```bash
# Docker orqali (tavsiya)
docker-compose up -d mongodb redis minio minio-init

# Yoki manual:
# - MongoDB: mongod
# - Redis: redis-server
# - MinIO: minio server /data
```

### 3. Environment Sozlash

```bash
# server/.env ga qo'shing:
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

AWS_REGION=us-east-1
AWS_ACCESS_KEY=minioadmin
AWS_SECRET_KEY=minioadmin123
S3_BUCKET=resultma-exports
S3_ENDPOINT=http://localhost:9000
USE_MINIO=true

WORKER_CONCURRENCY=10
WORKER_MAX_JOBS_PER_MINUTE=100
```

### 4. Test Qilish

Terminal 1 (API):
```bash
cd server
npm run dev
```

Terminal 2 (Worker):
```bash
cd server
npm run worker
```

Terminal 3 (Frontend):
```bash
cd client
npm run dev
```

### 5. Tekshirish

1. http://localhost:5173 ga kiring
2. Test yarating
3. O'quvchilar tanlang
4. "Word yuklash" tugmasini bosing
5. Progress bar ko'rinishi kerak
6. Fayl yuklab olinishi kerak

---

## 📊 KUTILAYOTGAN NATIJALAR

### Development (1 worker):
- 10 o'quvchi: ~5 soniya
- 50 o'quvchi: ~15 soniya
- 100 o'quvchi: ~30 soniya

### Production (3 workers):
- 10 o'quvchi: ~3 soniya
- 50 o'quvchi: ~8 soniya
- 100 o'quvchi: ~12 soniya

---

## 🔍 DEBUG

### Worker ishlamasa:

```bash
# Redis tekshirish
redis-cli ping

# Worker loglarini ko'rish
docker-compose logs -f worker

# Worker restart
docker-compose restart worker
```

### MinIO ishlamasa:

```bash
# MinIO console
http://localhost:9001
# Login: minioadmin / minioadmin123

# Bucket tekshirish
docker exec -it resultma-minio mc ls myminio
```

### Pandoc ishlamasa:

```bash
# Pandoc o'rnatish
# Ubuntu: sudo apt-get install pandoc
# macOS: brew install pandoc
# Windows: choco install pandoc

# Test
pandoc --version
```

---

## ✅ SUCCESS CRITERIA

- [ ] Dependencies o'rnatildi
- [ ] Redis ishlamoqda
- [ ] MinIO ishlamoqda
- [ ] Worker ishlamoqda
- [ ] API async endpoint ishlaydi
- [ ] Frontend progress ko'rsatadi
- [ ] Word fayl yuklab olinadi
- [ ] LaTeX formulalar to'g'ri
- [ ] Variantlar aralashgan
- [ ] S3 da fayl saqlanadi

---

## 🎯 PRODUCTION DEPLOYMENT

```bash
# Build va start
docker-compose up -d

# Scale workers
docker-compose up -d --scale worker=10

# Monitor
docker-compose logs -f worker
docker-compose ps
```

---

## 📈 PERFORMANCE OPTIMIZATION

### Agar sekin bo'lsa:

1. **Worker sonini oshiring:**
```bash
docker-compose up -d --scale worker=10
```

2. **Concurrency oshiring:**
```env
WORKER_CONCURRENCY=20
```

3. **Redis memory oshiring:**
```yaml
redis:
  command: redis-server --maxmemory 2gb
```

4. **Pandoc cache:**
```typescript
// pandocDocxService.ts da cache qo'shing
```

---

## 🎓 KEYINGI YAXSHILASHLAR

1. **Bull Board** - Queue monitoring UI
2. **Prometheus** - Metrics
3. **Grafana** - Dashboards
4. **Sentry** - Error tracking
5. **CloudWatch** - AWS monitoring
6. **Auto-scaling** - Kubernetes HPA
7. **CDN** - CloudFront for S3
8. **Caching** - Redis cache for repeated exports

---

**Status:** ✅ READY FOR TESTING  
**Next:** Run `npm install` and start services
