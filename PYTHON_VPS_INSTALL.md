# VPS'ga Python O'rnatish - To'liq Qo'llanma

## 🚀 Tezkor O'rnatish (Ubuntu/Debian)

VPS'ga SSH orqali kiring va quyidagi buyruqlarni ketma-ket bajaring:

```bash
# 1. Tizimni yangilash
sudo apt update
sudo apt upgrade -y

# 2. Python3 va pip o'rnatish
sudo apt install python3 python3-pip python3-venv -y

# 3. Versiyani tekshirish
python3 --version
pip3 --version
```

## 📦 OMR uchun Kerakli Kutubxonalar

### ⚠️ Muhim: Ubuntu 24.04 / Debian 12+ (Python 3.11+)

Yangi versiyalarda `externally-managed-environment` xatoligi chiqadi. 3 ta yechim:

### ✅ Yechim 1: Virtual Environment (TAVSIYA ETILADI)

```bash
# Virtual environment yaratish
python3 -m venv /var/www/resultMA/venv

# Aktivlashtirish
source /var/www/resultMA/venv/bin/activate

# Kutubxonalarni o'rnatish
pip install opencv-python-headless numpy pyzbar pillow

# Deactivate (kerak bo'lsa)
deactivate
```

**PM2 konfiguratsiyasini yangilash kerak** (pastda ko'rsatilgan)

### ✅ Yechim 2: System Packages (OSON)

```bash
# System paketlaridan o'rnatish
sudo apt install -y \
    python3-opencv \
    python3-numpy \
    python3-pil

# pyzbar uchun (apt'da yo'q, shuning uchun --break-system-packages)
pip3 install --break-system-packages pyzbar
```

### ✅ Yechim 3: --break-system-packages (TEZKOR)

```bash
# Barcha paketlarni majburiy o'rnatish
pip3 install --break-system-packages opencv-python-headless numpy pyzbar pillow
```

**Eslatma:** `--break-system-packages` xavfli emas, faqat system Python'ni buzmaslik uchun ogohlantirish.

### 🎯 Qaysi Yechimni Tanlash?

| Yechim | Afzalliklari | Kamchiliklari | Tavsiya |
|--------|--------------|---------------|---------|
| Virtual Env | ✅ Xavfsiz, professional | ❌ PM2 config o'zgartirish kerak | Production uchun |
| System Packages | ✅ Oson, tez | ❌ Ba'zi paketlar yo'q | Oddiy loyihalar |
| --break-system | ✅ Eng tez | ⚠️ Ogohlantirish beradi | Development/Test |

### 📝 Tavsiya: Virtual Environment + PM2

**1. Virtual environment yaratish:**
```bash
python3 -m venv /var/www/resultMA/venv
source /var/www/resultMA/venv/bin/activate
pip install opencv-python-headless numpy pyzbar pillow
deactivate
```

**2. PM2 konfiguratsiyasini yangilash:**

`ecosystem.config.js` faylida:
```javascript
module.exports = {
  apps: [
    {
      name: 'resultMA-server',
      script: './server/dist/index.js',
      interpreter: '/var/www/resultMA/venv/bin/node', // Bu qator kerak emas
      // Yoki environment variable
      env: {
        NODE_ENV: 'production',
        PORT: 9999,
        PATH: '/var/www/resultMA/venv/bin:' + process.env.PATH
      }
    }
  ]
};
```

**3. Python scriptlarda shebang qo'shish:**

`server/python/omr_color.py` boshiga:
```python
#!/var/www/resultMA/venv/bin/python3
```

### ⚠️ Muhim: opencv-python-headless

Server'da **opencv-python-headless** ishlatiladi, chunki:
- ✅ GUI kerak emas
- ✅ Kichikroq hajm
- ✅ Tezroq o'rnatiladi
- ✅ Kam resurs ishlatadi

## 🔍 Tekshirish

### Virtual Environment bilan:
```bash
# Virtual env aktivlashtirish
source /var/www/resultMA/venv/bin/activate

# Tekshirish
python --version
pip list

# Kutubxonalar
python -c "import cv2; print('OpenCV:', cv2.__version__)"
python -c "import numpy; print('NumPy:', numpy.__version__)"
python -c "import pyzbar; print('pyzbar: OK')"
python -c "import PIL; print('Pillow: OK')"

# Deactivate
deactivate
```

### System packages bilan:
```bash
# Python ishlayotganini tekshirish
python3 --version
# Natija: Python 3.8.10 (yoki yuqori)

# pip ishlayotganini tekshirish
pip3 --version

# Kutubxonalar o'rnatilganini tekshirish
python3 -c "import cv2; print('OpenCV:', cv2.__version__)"
python3 -c "import numpy; print('NumPy:', numpy.__version__)"
python3 -c "import pyzbar; print('pyzbar: OK')"
python3 -c "import PIL; print('Pillow: OK')"
```

## 🛠️ To'liq O'rnatish Skripti

### Variant 1: Virtual Environment bilan (TAVSIYA)

```bash
#!/bin/bash

echo "🐍 Python va OMR kutubxonalarini o'rnatish (Virtual Env)..."

# Tizimni yangilash
echo "📦 Tizimni yangilash..."
sudo apt update
sudo apt upgrade -y

# Python va pip o'rnatish
echo "🐍 Python3 o'rnatish..."
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential

# OpenCV uchun kerakli kutubxonalar
echo "📚 OpenCV dependencies o'rnatish..."
sudo apt install -y \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0

# Virtual environment yaratish
echo "🌐 Virtual environment yaratish..."
python3 -m venv /var/www/mathacademy/venv

# Aktivlashtirish va kutubxonalar o'rnatish
echo "📦 Python kutubxonalarini o'rnatish..."
source /var/www/mathacademy/venv/bin/activate
pip install --upgrade pip
pip install opencv-python-headless numpy pyzbar pillow
deactivate

# Tekshirish
echo ""
echo "✅ O'rnatish tugadi! Tekshirish..."
echo ""

python3 --version
pip3 --version

echo ""
echo "Kutubxonalar (Virtual Env):"
source /var/www/mathacademy/venv/bin/activate
python -c "import cv2; print('✅ OpenCV:', cv2.__version__)"
python -c "import numpy; print('✅ NumPy:', numpy.__version__)"
python -c "import pyzbar; print('✅ pyzbar: OK')"
python -c "import PIL; print('✅ Pillow: OK')"
deactivate

echo ""
echo "🎉 Hammasi tayyor!"
echo ""
echo "⚠️  Eslatma: PM2 konfiguratsiyasini yangilang:"
echo "   PATH: /var/www/mathacademy/venv/bin:\$PATH"
```

### Variant 2: System Packages bilan (OSON)

```bash
#!/bin/bash

echo "🐍 Python va OMR kutubxonalarini o'rnatish (System)..."

# Tizimni yangilash
echo "📦 Tizimni yangilash..."
sudo apt update
sudo apt upgrade -y

# Python va pip o'rnatish
echo "🐍 Python3 o'rnatish..."
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential

# OpenCV uchun kerakli kutubxonalar
echo "📚 OpenCV dependencies o'rnatish..."
sudo apt install -y \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0

# System paketlarini o'rnatish
echo "📦 System Python kutubxonalarini o'rnatish..."
sudo apt install -y \
    python3-opencv \
    python3-numpy \
    python3-pil

# pyzbar (apt'da yo'q)
echo "📦 pyzbar o'rnatish..."
pip3 install --break-system-packages pyzbar

# Tekshirish
echo ""
echo "✅ O'rnatish tugadi! Tekshirish..."
echo ""

python3 --version
pip3 --version

echo ""
echo "Kutubxonalar:"
python3 -c "import cv2; print('✅ OpenCV:', cv2.__version__)"
python3 -c "import numpy; print('✅ NumPy:', numpy.__version__)"
python3 -c "import pyzbar; print('✅ pyzbar: OK')"
python3 -c "import PIL; print('✅ Pillow: OK')"

echo ""
echo "🎉 Hammasi tayyor!"
```

### Variant 3: --break-system-packages bilan (TEZKOR)

```bash
#!/bin/bash

echo "🐍 Python va OMR kutubxonalarini o'rnatish..."

# Tizimni yangilash
echo "📦 Tizimni yangilash..."
sudo apt update
sudo apt upgrade -y

# Python va pip o'rnatish
echo "🐍 Python3 o'rnatish..."
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential

# OpenCV uchun kerakli kutubxonalar
echo "📚 OpenCV dependencies o'rnatish..."
sudo apt install -y \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0

# Python kutubxonalarini o'rnatish
echo "📦 Python kutubxonalarini o'rnatish..."
pip3 install --upgrade pip --break-system-packages
pip3 install --break-system-packages opencv-python-headless numpy pyzbar pillow

# Tekshirish
echo ""
echo "✅ O'rnatish tugadi! Tekshirish..."
echo ""

python3 --version
pip3 --version

echo ""
echo "Kutubxonalar:"
python3 -c "import cv2; print('✅ OpenCV:', cv2.__version__)"
python3 -c "import numpy; print('✅ NumPy:', numpy.__version__)"
python3 -c "import pyzbar; print('✅ pyzbar: OK')"
python3 -c "import PIL; print('✅ Pillow: OK')"

echo ""
echo "🎉 Hammasi tayyor!"
```

### Qaysi Skriptni Tanlash?

- **Production:** Variant 1 (Virtual Env)
- **Oddiy loyiha:** Variant 2 (System Packages)
- **Tezkor test:** Variant 3 (--break-system-packages)

Bu skriptlardan birini saqlang va bajaring:

```bash
# Skriptni yaratish
nano install-python.sh

# Skriptni nusxalang va Ctrl+X, Y, Enter

# Ruxsat berish
chmod +x install-python.sh

# Ishga tushirish
./install-python.sh
```

## 🔧 Muammolar va Yechimlar

### 1. "python: command not found"

**Muammo:** `python` buyrug'i topilmaydi

**Yechim:**
```bash
# python3 ni python ga bog'lash
sudo ln -s /usr/bin/python3 /usr/bin/python

# Yoki har doim python3 ishlatish
```

### 2. "pip: command not found"

**Muammo:** pip o'rnatilmagan

**Yechim:**
```bash
sudo apt install python3-pip -y
```

### 3. "No module named 'cv2'"

**Muammo:** OpenCV o'rnatilmagan

**Yechim:**
```bash
pip3 install opencv-python-headless
```

### 4. "Permission denied"

**Muammo:** Ruxsat yo'q

**Yechim:**
```bash
# --user flag bilan o'rnatish
pip3 install --user opencv-python-headless numpy pyzbar pillow

# Yoki sudo bilan
sudo pip3 install opencv-python-headless numpy pyzbar pillow
```

### 5. OpenCV o'rnatilayotganda xatolik

**Muammo:** Build dependencies yo'q

**Yechim:**
```bash
sudo apt install -y \
    python3-dev \
    build-essential \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0

# Keyin qayta urinish
pip3 install opencv-python-headless
```

## 🌍 Turli Linux Distributivlar

### CentOS / RHEL / Fedora

```bash
# Python o'rnatish
sudo yum install python3 python3-pip -y

# Yoki dnf (yangi versiyalar)
sudo dnf install python3 python3-pip -y

# Kutubxonalar
pip3 install opencv-python-headless numpy pyzbar pillow
```

### Alpine Linux (Docker)

```bash
# Python o'rnatish
apk add python3 py3-pip

# Build dependencies
apk add gcc musl-dev python3-dev

# Kutubxonalar
pip3 install opencv-python-headless numpy pyzbar pillow
```

## 🐳 Docker bilan (Ixtiyoriy)

Agar Docker ishlatmoqchi bo'lsangiz:

```dockerfile
FROM python:3.9-slim

# Dependencies
RUN apt-get update && apt-get install -y \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Python kutubxonalar
RUN pip install --no-cache-dir \
    opencv-python-headless \
    numpy \
    pyzbar \
    pillow

WORKDIR /app
```

## 📊 Xotira va Resurslar

Python kutubxonalari hajmi:
- opencv-python-headless: ~50MB
- numpy: ~15MB
- pyzbar: ~5MB
- pillow: ~3MB

**Jami:** ~75MB

Minimal VPS talablari:
- RAM: 512MB (1GB tavsiya etiladi)
- Disk: 1GB bo'sh joy
- CPU: 1 core

## ✅ Yakuniy Tekshirish

Barcha narsalar to'g'ri o'rnatilganini tekshirish:

```bash
# Test skript yaratish
cat > test_python.py << 'EOF'
#!/usr/bin/env python3
import sys

print("🐍 Python versiyasi:", sys.version)
print()

try:
    import cv2
    print("✅ OpenCV:", cv2.__version__)
except ImportError as e:
    print("❌ OpenCV:", e)

try:
    import numpy
    print("✅ NumPy:", numpy.__version__)
except ImportError as e:
    print("❌ NumPy:", e)

try:
    import pyzbar
    print("✅ pyzbar: OK")
except ImportError as e:
    print("❌ pyzbar:", e)

try:
    import PIL
    print("✅ Pillow:", PIL.__version__)
except ImportError as e:
    print("❌ Pillow:", e)

print()
print("🎉 Barcha kutubxonalar tayyor!")
EOF

# Ishga tushirish
python3 test_python.py
```

## 🚀 Keyingi Qadamlar

Python o'rnatilgandan keyin:

1. **Python scriptlarni nusxalash:**
```bash
cd /var/www/resultMA
mkdir -p python
# Local'dan nusxalash (SCP yoki rsync)
```

2. **Server'ni qayta ishga tushirish:**
```bash
pm2 restart resultMA-server
```

3. **Loglarni tekshirish:**
```bash
pm2 logs resultMA-server
```

4. **OMR endpoint'ni test qilish:**
```bash
curl http://localhost:9999/api/health
```

## 📞 Yordam

Agar muammo bo'lsa:
- `VPS_TROUBLESHOOTING.md` - To'liq troubleshooting
- `VPS_QUICK_FIX.md` - Tezkor yechimlar
- `check-vps-setup.sh` - Avtomatik diagnostika

---

**Muvaffaqiyatli o'rnatish!** 🎉
