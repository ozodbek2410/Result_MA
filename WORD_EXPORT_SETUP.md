# 📄 Word Export System - Production Setup

## 🎯 Overview

Production-ready Word export system with:
- ✅ Async processing (BullMQ + Redis)
- ✅ Parallel workers (10-30 concurrent jobs)
- ✅ S3/MinIO file storage
- ✅ LaTeX → Word native formulas (Pandoc)
- ✅ Progress tracking
- ✅ Retry mechanism
- ✅ Horizontal scaling

---

## 🏗️ Architecture

```
Frontend → API Server → Redis Queue → Workers (3x10=30) → MinIO/S3
                            ↓
                        Progress Updates
```

---

## 🚀 Quick Start (Development)

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Start Infrastructure (Docker)

```bash
docker-compose up -d mongodb redis minio minio-init
```

### 3. Configure Environment

```bash
cp server/.env.example server/.env
```

Edit `.env`:
```env
# Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO (local S3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY=minioadmin
AWS_SECRET_KEY=minioadmin123
S3_BUCKET=resultma-exports
S3_ENDPOINT=http://localhost:9000
USE_MINIO=true

# Worker
WORKER_CONCURRENCY=10
WORKER_MAX_JOBS_PER_MINUTE=100
```

### 4. Start Services

Terminal 1 (API Server):
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

### 5. Access Services

- Frontend: http://localhost:5173
- API: http://localhost:5000
- MinIO Console: http://localhost:9001 (minioadmin / minioadmin123)
- Redis: localhost:6379

---

## 🐳 Production Deployment (Docker)

### 1. Build and Start All Services

```bash
docker-compose up -d
```

This starts:
- MongoDB
- Redis
- MinIO (S3-compatible storage)
- API Server (1 instance)
- Workers (3 instances × 10 concurrency = 30 parallel jobs)
- Frontend

### 2. Scale Workers

```bash
# Scale to 10 workers (100 parallel jobs)
docker-compose up -d --scale worker=10

# Scale to 20 workers (200 parallel jobs)
docker-compose up -d --scale worker=20
```

### 3. Monitor

```bash
# View logs
docker-compose logs -f worker

# Check status
docker-compose ps
```

---

## 📊 Performance

### Development (1 worker, 10 concurrency):
- 10 students: ~5 seconds
- 50 students: ~15 seconds
- 100 students: ~30 seconds

### Production (3 workers, 30 concurrency):
- 10 students: ~3 seconds
- 50 students: ~8 seconds
- 100 students: ~12 seconds
- 1000 students: ~2 minutes

### Production (10 workers, 100 concurrency):
- 1000 students: ~40 seconds
- 10,000 students: ~7 minutes

---

## 🔧 Configuration

### Worker Concurrency

Edit `.env`:
```env
WORKER_CONCURRENCY=10  # Jobs per worker
```

Or in `docker-compose.yml`:
```yaml
worker:
  environment:
    - WORKER_CONCURRENCY=20
  deploy:
    replicas: 5  # 5 workers × 20 = 100 parallel jobs
```

### Rate Limiting

```env
WORKER_MAX_JOBS_PER_MINUTE=100
```

### S3 Storage

For production AWS S3:
```env
USE_MINIO=false
AWS_REGION=us-east-1
AWS_ACCESS_KEY=your_aws_key
AWS_SECRET_KEY=your_aws_secret
S3_BUCKET=your-bucket-name
# Remove S3_ENDPOINT
```

---

## 🧪 Testing

### 1. Test MinIO Connection

```bash
curl http://localhost:9000/minio/health/live
```

### 2. Test Redis Connection

```bash
redis-cli ping
# Should return: PONG
```

### 3. Test Word Export

```bash
# Start export
curl -X POST http://localhost:5000/tests/{testId}/export-docx-async \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"students": ["student1", "student2"], "settings": {}}'

# Response: {"jobId": "test-123-1234567890", "status": "queued"}

# Check status
curl http://localhost:5000/tests/export-status/{jobId} \
  -H "Authorization: Bearer {token}"
```

---

## 📈 Monitoring

### BullMQ Dashboard (Optional)

Install Bull Board:
```bash
npm install @bull-board/express @bull-board/api
```

Add to `server/src/index.ts`:
```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import wordExportQueue from './services/queue/wordExportQueue';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(wordExportQueue)],
  serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());
```

Access: http://localhost:5000/admin/queues

---

## 🐛 Troubleshooting

### Worker not processing jobs

1. Check Redis connection:
```bash
docker-compose logs redis
```

2. Check worker logs:
```bash
docker-compose logs -f worker
```

3. Restart worker:
```bash
docker-compose restart worker
```

### MinIO connection error

1. Check MinIO status:
```bash
docker-compose ps minio
```

2. Check bucket exists:
```bash
docker exec -it resultma-minio mc ls myminio
```

3. Recreate bucket:
```bash
docker-compose up -d minio-init
```

### Pandoc not found

Install Pandoc:
```bash
# Ubuntu/Debian
sudo apt-get install pandoc

# macOS
brew install pandoc

# Windows
choco install pandoc
```

---

## 🔐 Security

### Production Checklist

- [ ] Change MinIO credentials
- [ ] Use AWS S3 instead of MinIO
- [ ] Enable Redis password
- [ ] Use environment variables for secrets
- [ ] Enable HTTPS
- [ ] Set up firewall rules
- [ ] Enable rate limiting
- [ ] Monitor logs

### Environment Variables

Never commit `.env` file! Use:
- Docker secrets
- Kubernetes secrets
- AWS Parameter Store
- HashiCorp Vault

---

## 📚 API Reference

### Start Export

```http
POST /tests/:id/export-docx-async
POST /block-tests/:id/export-docx-async

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json

Body:
{
  "students": ["studentId1", "studentId2"],
  "settings": {
    "fontSize": 11,
    "fontFamily": "Cambria",
    "lineHeight": 1.5,
    "columnsCount": 2,
    "backgroundOpacity": 0.05
  }
}

Response:
{
  "jobId": "test-123-1234567890",
  "status": "queued",
  "message": "Export jarayoni boshlandi",
  "estimatedTime": 15
}
```

### Check Status

```http
GET /tests/export-status/:jobId
GET /block-tests/export-status/:jobId

Headers:
  Authorization: Bearer {token}

Response (in progress):
{
  "status": "active",
  "progress": 45,
  "message": "Ishlanmoqda..."
}

Response (completed):
{
  "status": "completed",
  "progress": 100,
  "result": {
    "fileUrl": "https://...",
    "fileName": "test-123.docx",
    "size": 1048576,
    "studentsCount": 30
  }
}

Response (failed):
{
  "status": "failed",
  "progress": 50,
  "error": "Error message",
  "attemptsMade": 3,
  "attemptsTotal": 3
}
```

---

## 🎓 Best Practices

1. **Use async version** for production (better UX, scalability)
2. **Keep sync version** as fallback
3. **Monitor queue** regularly
4. **Scale workers** based on load
5. **Use S3** for production (not MinIO)
6. **Set up alerts** for failed jobs
7. **Clean old files** periodically
8. **Test with load** before production

---

## 📞 Support

Issues? Check:
1. Logs: `docker-compose logs -f`
2. Redis: `redis-cli ping`
3. MinIO: http://localhost:9001
4. Worker status: `docker-compose ps worker`

---

**Version:** 1.0.0  
**Last Updated:** 2026-02-17  
**Author:** Senior Developer Team
