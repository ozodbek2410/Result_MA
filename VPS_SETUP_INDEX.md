# 📚 VPS Setup - Barcha Qo'llanmalar

## 🎯 Qaysi Qo'llanmani O'qish Kerak?

### 1️⃣ Birinchi Marta Deploy Qilish

**Boshlash:** `PYTHON_VPS_INSTALL.md`
- Python o'rnatish
- Kutubxonalar o'rnatish
- To'liq setup

**Keyin:** `deploy.sh` scriptni ishga tushiring

### 2️⃣ 500 Xatolik Chiqsa

**Tezkor yechim:** `VPS_QUICK_FIX.md` (5 daqiqa)
- Eng keng tarqalgan muammolar
- Tezkor buyruqlar
- Diagnostika

**To'liq yechim:** `VPS_TROUBLESHOOTING.md`
- Barcha mumkin bo'lgan muammolar
- Batafsil yechimlar
- Test qilish usullari

### 3️⃣ Kundalik Ishlatish

**Buyruqlar:** `VPS_COMMANDS.md`
- Tez-tez ishlatiladigan buyruqlar
- Monitoring
- Yangilash
- Tozalash

### 4️⃣ Avtomatik Tekshirish

**Script:** `check-vps-setup.sh`
```bash
cd /var/www/mathacademy
bash check-vps-setup.sh
```

## 📖 Qo'llanmalar Ro'yxati

| Fayl | Maqsad | Qachon Kerak |
|------|--------|--------------|
| `PYTHON_VPS_INSTALL.md` | Python o'rnatish | Birinchi marta |
| `VPS_QUICK_FIX.md` | Tezkor yechimlar | 500 xatolik |
| `VPS_TROUBLESHOOTING.md` | To'liq troubleshooting | Murakkab muammolar |
| `VPS_COMMANDS.md` | Buyruqlar cheat sheet | Kundalik ish |
| `check-vps-setup.sh` | Avtomatik diagnostika | Tekshirish |
| `deploy.sh` | Deploy script | Deploy qilish |

## 🚀 Tezkor Boshlash (3 Qadam)

### Qadam 1: Python O'rnatish

```bash
sudo apt update
sudo apt install python3 python3-pip -y
pip3 install opencv-python-headless numpy pyzbar pillow
```

### Qadam 2: Papkalar va Scriptlar

```bash
sudo mkdir -p /var/www/mathacademy/server/uploads/omr
sudo mkdir -p /var/www/mathacademy/python
sudo chown -R $USER:$USER /var/www/mathacademy

# Local'dan Python scriptlarni nusxalash
scp -r server/python/* user@vps:/var/www/mathacademy/python/
```

### Qadam 3: Server'ni Ishga Tushirish

```bash
pm2 restart mathacademy-server
pm2 logs mathacademy-server
```

## ✅ Tekshirish

```bash
# Python
python3 --version
python3 -c "import cv2, numpy; print('OK')"

# Papkalar
ls -la /var/www/mathacademy/python/
ls -la /var/www/mathacademy/server/uploads/omr/

# Server
pm2 status
curl http://localhost:9999/api/health
```

## 🆘 Yordam Kerakmi?

1. **Avtomatik diagnostika:** `bash check-vps-setup.sh`
2. **Loglarni ko'rish:** `pm2 logs mathacademy-server --err`
3. **Tezkor yechim:** `VPS_QUICK_FIX.md`
4. **To'liq qo'llanma:** `VPS_TROUBLESHOOTING.md`

## 📞 Umumiy Muammolar

| Muammo | Yechim | Qo'llanma |
|--------|--------|-----------|
| Python topilmaydi | `sudo apt install python3` | PYTHON_VPS_INSTALL.md |
| cv2 topilmaydi | `pip3 install opencv-python-headless` | PYTHON_VPS_INSTALL.md |
| Permission denied | `sudo chown -R $USER:$USER /var/www/mathacademy` | VPS_QUICK_FIX.md |
| 500 xatolik | Diagnostika ishga tushiring | VPS_TROUBLESHOOTING.md |
| Script topilmaydi | Python scriptlarni nusxalang | VPS_QUICK_FIX.md |

## 🎓 O'rganish Tartibi

1. **Yangi boshlovchilar:**
   - `PYTHON_VPS_INSTALL.md` - Boshidan oxirigacha o'qing
   - `VPS_COMMANDS.md` - Asosiy buyruqlarni o'rganing

2. **Tajribali foydalanuvchilar:**
   - `VPS_QUICK_FIX.md` - Tezkor yechimlar
   - `VPS_COMMANDS.md` - Cheat sheet

3. **Muammo bo'lsa:**
   - `check-vps-setup.sh` - Avtomatik diagnostika
   - `VPS_TROUBLESHOOTING.md` - Batafsil yechimlar

## 🔗 Foydali Havolalar

- **Project README:** `README.md`
- **Deploy Script:** `deploy.sh`
- **Nginx Config:** `nginx.conf`
- **PM2 Config:** `ecosystem.config.js`

---

**Muvaffaqiyatli deploy!** 🎉
