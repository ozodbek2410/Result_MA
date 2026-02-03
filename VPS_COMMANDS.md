# VPS Buyruqlar - Cheat Sheet

## 🚀 Birinchi Marta O'rnatish

```bash
# 1. Python o'rnatish
sudo apt update && sudo apt install python3 python3-pip -y

# 2. Kutubxonalar o'rnatish
pip3 install opencv-python-headless numpy pyzbar pillow

# 3. Papkalar yaratish
sudo mkdir -p /var/www/mathacademy/server/uploads/omr
sudo mkdir -p /var/www/mathacademy/python
sudo chown -R $USER:$USER /var/www/mathacademy

# 4. Python scriptlarni nusxalash (local'dan)
# Local kompyuterdan:
scp -r server/python/* user@your-vps-ip:/var/www/mathacademy/python/

# 5. Server'ni qayta ishga tushirish
pm2 restart mathacademy-server
```

## 🔍 Tekshirish Buyruqlari

```bash
# Python versiyasi
python3 --version

# Kutubxonalar
python3 -c "import cv2, numpy; print('OK')"

# Papkalar
ls -la /var/www/mathacademy/python/
ls -la /var/www/mathacademy/server/uploads/omr/

# Server holati
pm2 status
pm2 logs mathacademy-server --lines 50
```

## 🛠️ Muammolarni Hal Qilish

```bash
# Loglarni ko'rish
pm2 logs mathacademy-server --err --lines 100

# Server'ni qayta ishga tushirish
pm2 restart mathacademy-server

# Ruxsatlarni tuzatish
sudo chown -R $USER:$USER /var/www/mathacademy
chmod -R 755 /var/www/mathacademy/server/uploads

# Python scriptni test qilish
cd /var/www/mathacademy
python3 python/omr_color.py server/uploads/omr/test.jpg
```

## 📦 Deploy Qilish

```bash
# Local'dan VPS'ga
git pull origin main
npm run build
./deploy.sh

# Yoki qo'lda
rsync -av --delete server/ user@vps:/var/www/mathacademy/server/
pm2 restart mathacademy-server
```

## 🔄 Yangilash

```bash
# Code yangilash
cd /var/www/mathacademy
git pull

# Dependencies yangilash
cd server && npm install
npm run build

# Server'ni qayta ishga tushirish
pm2 restart mathacademy-server
```

## 📊 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Server ma'lumotlari
pm2 info mathacademy-server

# Disk bo'sh joyi
df -h

# RAM ishlatilishi
free -h

# CPU ishlatilishi
top
```

## 🔒 Xavfsizlik

```bash
# Firewall sozlash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable

# SSL sertifikat yangilash
sudo certbot renew
```

## 🗑️ Tozalash

```bash
# PM2 loglarni tozalash
pm2 flush

# Eski rasmlarni o'chirish
find /var/www/mathacademy/server/uploads/omr -type f -mtime +30 -delete

# Node modules tozalash va qayta o'rnatish
cd /var/www/mathacademy/server
rm -rf node_modules
npm install
```

## 🆘 Favqulodda Vaziyat

```bash
# Server ishlamayapti
pm2 restart mathacademy-server
pm2 logs mathacademy-server --lines 200

# MongoDB ishlamayapti
sudo systemctl status mongodb
sudo systemctl restart mongodb

# Nginx ishlamayapti
sudo systemctl status nginx
sudo nginx -t
sudo systemctl restart nginx

# Disk to'lgan
du -sh /var/www/mathacademy/*
df -h
```

## 📝 Foydali Aliaslar

`.bashrc` ga qo'shing:

```bash
# Aliaslar
alias pm2logs='pm2 logs mathacademy-server'
alias pm2restart='pm2 restart mathacademy-server'
alias pm2status='pm2 status'
alias cdmath='cd /var/www/mathacademy'
alias checkpython='python3 -c "import cv2, numpy; print(\"OK\")"'

# Aliaslarni yuklash
source ~/.bashrc
```

## 🎯 Tez-tez Ishlatiladigan

```bash
# Loglarni kuzatish (real-time)
pm2 logs mathacademy-server --lines 0

# Xatoliklarni ko'rish
pm2 logs mathacademy-server --err

# Server'ni to'xtatish
pm2 stop mathacademy-server

# Server'ni ishga tushirish
pm2 start mathacademy-server

# Barcha PM2 processlar
pm2 list
```

---

**Eslatma:** `user@your-vps-ip` ni o'z VPS ma'lumotlaringiz bilan almashtiring.
