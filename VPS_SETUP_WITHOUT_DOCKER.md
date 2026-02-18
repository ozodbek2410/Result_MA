# 🚀 VPS Setup (Docker siz)

## 📋 PREREQUISITE

Sizning VPS da allaqachon bor:
- ✅ Node.js
- ✅ MongoDB
- ✅ Nginx (balki)
- ✅ PM2 (balki)

## 🔧 QO'SHIMCHA O'RNATISH

### 1. Redis O'rnatish

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server -y

# Start va enable
sudo systemctl start redis
sudo systemctl enable redis

# Test
redis-cli ping
# Output: PONG ✅
```

### 2. MinIO O'rnatish (Local S3)

```bash
# Download
cd /opt
sudo wget https://dl.min.io/server/minio/release/linux-amd64/minio
sudo chmod +x minio

# Create data directory
sudo mkdir -p /data/minio

# Create systemd service
sudo nano /etc/systemd/system/minio.service
```

Paste this:
```ini
[Unit]
Description=MinIO
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target

[Service]
User=root
Group=root
WorkingDirectory=/opt
ExecStart=/opt/minio server /data/minio --console-address ":9001"
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
# Start MinIO
sudo systemctl daemon-reload
sudo systemctl start minio
sudo systemctl enable minio

# Check status
sudo systemctl status minio

# Access console: http://your-vps-ip:9001
# Default: minioadmin / minioadmin
```

### 3. Pandoc O'rnatish

```bash
# Ubuntu/Debian
sudo apt install pandoc -y

# Test
pandoc --version
```

---

## 📦 PROJECT SETUP

### 1. Dependencies O'rnatish

```bash
cd /var/www/resultMA/server
npm install
```

### 2. Environment Variables

```bash
nano .env
```

Add/Update:
```env
# Existing...
PORT=5000
MONGODB_URI=mongodb://localhost:27017/resultma
JWT_SECRET=your_secret

# NEW - Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# NEW - MinIO (Local S3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY=minioadmin
AWS_SECRET_KEY=minioadmin
S3_BUCKET=resultma-exports
S3_ENDPOINT=http://localhost:9000
USE_MINIO=true

# NEW - Worker
WORKER_CONCURRENCY=10
WORKER_MAX_JOBS_PER_MINUTE=100
```

### 3. Build TypeScript

```bash
npm run build
```

---

## 🚀 ISHGA TUSHIRISH

### Option A: PM2 (Tavsiya)

#### 1. PM2 O'rnatish (agar yo'q bo'lsa)

```bash
sudo npm install -g pm2
```

#### 2. Ecosystem File Yaratish

```bash
cd /var/www/resultMA/server
nano ecosystem.config.js
```

Paste:
```javascript
module.exports = {
  apps: [
    // API Server
    {
      name: 'resultma-api',
      script: './dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    
    // Workers (3 instances)
    {
      name: 'resultma-worker',
      script: './dist/worker.js',
      instances: 3,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
```

#### 3. Ishga Tushirish

```bash
# Create logs directory
mkdir -p logs

# Start all
pm2 start ecosystem.config.js

# Save configuration
pm2 save

# Auto-start on reboot
pm2 startup
# Copy-paste the command it shows

# Monitor
pm2 monit

# Logs
pm2 logs resultma-worker
pm2 logs resultma-api
```

#### 4. Useful PM2 Commands

```bash
# Status
pm2 status

# Restart
pm2 restart resultma-worker
pm2 restart resultma-api

# Stop
pm2 stop resultma-worker

# Delete
pm2 delete resultma-worker

# Scale workers
pm2 scale resultma-worker 5  # 5 workers

# Reload (zero-downtime)
pm2 reload resultma-api
```

---

### Option B: Systemd Services

#### 1. API Service

```bash
sudo nano /etc/systemd/system/resultma-api.service
```

```ini
[Unit]
Description=ResultMA API Server
After=network.target mongodb.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/resultMA/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

#### 2. Worker Service

```bash
sudo nano /etc/systemd/system/resultma-worker@.service
```

```ini
[Unit]
Description=ResultMA Worker %i
After=network.target mongodb.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/resultMA/server
ExecStart=/usr/bin/node dist/worker.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

#### 3. Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Start API
sudo systemctl start resultma-api
sudo systemctl enable resultma-api

# Start 3 workers
sudo systemctl start resultma-worker@1
sudo systemctl start resultma-worker@2
sudo systemctl start resultma-worker@3

sudo systemctl enable resultma-worker@1
sudo systemctl enable resultma-worker@2
sudo systemctl enable resultma-worker@3

# Check status
sudo systemctl status resultma-api
sudo systemctl status resultma-worker@1

# Logs
sudo journalctl -u resultma-api -f
sudo journalctl -u resultma-worker@1 -f
```

---

## 🔍 TEKSHIRISH

### 1. Services Running

```bash
# Redis
redis-cli ping
# Output: PONG

# MinIO
curl http://localhost:9000/minio/health/live
# Output: OK

# MongoDB
mongosh --eval "db.adminCommand('ping')"
# Output: { ok: 1 }

# API
curl http://localhost:5000/health
# Output: OK

# PM2
pm2 status
```

### 2. Test Word Export

```bash
# Check worker logs
pm2 logs resultma-worker --lines 50

# Or systemd
sudo journalctl -u resultma-worker@1 -n 50
```

### 3. MinIO Console

Open browser: `http://your-vps-ip:9001`
- Login: minioadmin / minioadmin
- Check bucket: resultma-exports

---

## 🔐 SECURITY

### 1. Change MinIO Credentials

```bash
# Stop MinIO
sudo systemctl stop minio

# Edit service file
sudo nano /etc/systemd/system/minio.service
```

Add environment variables:
```ini
Environment="MINIO_ROOT_USER=your_new_user"
Environment="MINIO_ROOT_PASSWORD=your_strong_password"
```

```bash
# Restart
sudo systemctl daemon-reload
sudo systemctl start minio

# Update .env
nano /var/www/resultMA/server/.env
# AWS_ACCESS_KEY=your_new_user
# AWS_SECRET_KEY=your_strong_password

# Restart workers
pm2 restart resultma-worker
```

### 2. Firewall

```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw allow 5000  # API (if needed externally)

# Block MinIO from outside (only localhost)
sudo ufw deny 9000
sudo ufw deny 9001

sudo ufw enable
```

### 3. Redis Password

```bash
sudo nano /etc/redis/redis.conf
```

Uncomment and set:
```
requirepass your_strong_password
```

```bash
sudo systemctl restart redis

# Update .env
REDIS_PASSWORD=your_strong_password

# Restart
pm2 restart all
```

---

## 📊 MONITORING

### 1. PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Web dashboard (optional)
pm2 install pm2-server-monit
```

### 2. Logs

```bash
# API logs
pm2 logs resultma-api --lines 100

# Worker logs
pm2 logs resultma-worker --lines 100

# All logs
pm2 logs --lines 100

# Clear logs
pm2 flush
```

### 3. Resource Usage

```bash
# CPU, Memory
htop

# Disk
df -h

# Redis
redis-cli info stats

# MongoDB
mongosh --eval "db.serverStatus()"
```

---

## 🔄 UPDATES

### Deploy New Version

```bash
cd /var/www/resultMA

# Pull changes
git pull

# Install dependencies
cd server
npm install

# Build
npm run build

# Restart
pm2 restart all

# Check
pm2 status
pm2 logs --lines 50
```

---

## 🐛 TROUBLESHOOTING

### Worker not processing

```bash
# Check Redis
redis-cli ping

# Check worker logs
pm2 logs resultma-worker

# Restart worker
pm2 restart resultma-worker

# Check queue
redis-cli
> KEYS bull:word-export:*
> LLEN bull:word-export:waiting
```

### MinIO not accessible

```bash
# Check status
sudo systemctl status minio

# Check logs
sudo journalctl -u minio -n 50

# Restart
sudo systemctl restart minio
```

### Out of memory

```bash
# Check memory
free -h

# Reduce workers
pm2 scale resultma-worker 2

# Or reduce concurrency in .env
WORKER_CONCURRENCY=5
pm2 restart resultma-worker
```

---

## 📈 SCALING

### More Workers

```bash
# PM2
pm2 scale resultma-worker 5

# Systemd
sudo systemctl start resultma-worker@4
sudo systemctl start resultma-worker@5
```

### More API Instances

```bash
# PM2 (auto-scales to CPU cores)
pm2 scale resultma-api max
```

---

## ✅ FINAL CHECKLIST

- [ ] Redis o'rnatildi va ishlamoqda
- [ ] MinIO o'rnatildi va ishlamoqda
- [ ] Pandoc o'rnatildi
- [ ] Dependencies o'rnatildi (`npm install`)
- [ ] .env sozlandi
- [ ] Build qilindi (`npm run build`)
- [ ] PM2 ecosystem yaratildi
- [ ] Services ishga tushdi (`pm2 start`)
- [ ] Logs tekshirildi (`pm2 logs`)
- [ ] Test qilindi (Word export)
- [ ] Auto-start sozlandi (`pm2 startup`)
- [ ] Firewall sozlandi
- [ ] Credentials o'zgartirildi

---

**Status:** ✅ READY FOR PRODUCTION  
**Next:** Test Word export feature
