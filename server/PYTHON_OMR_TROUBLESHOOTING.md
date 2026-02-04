# Python OMR Troubleshooting Guide

## Problem
After deployment, the OMR check-answers endpoint fails with:
```
Python script failed with no output
```

## Root Causes

### 1. Python Dependencies Not Installed
The Python scripts require OpenCV and NumPy, which may not be installed on the production server.

### 2. Python Not in PATH
The `python3` command might not be available or not in the system PATH.

### 3. Incorrect Script Path
The path calculation for production might be incorrect.

## Solutions

### Step 1: Verify Python Environment

SSH into your server and run:

```bash
cd /var/www/resultMA

# Check Python version
python3 --version

# Test environment
python3 server/python/test_environment.py
```

### Step 2: Install Python Dependencies

If dependencies are missing:

```bash
# Install pip if not available
sudo apt-get update
sudo apt-get install python3-pip

# Install dependencies
cd /var/www/resultMA/server/python
pip3 install -r requirements.txt

# Or install system-wide
sudo pip3 install opencv-python numpy Pillow
```

### Step 3: Test Python Scripts Manually

```bash
cd /var/www/resultMA

# Test QR scanner
python3 server/python/qr_scanner.py server/uploads/omr/omr-1770227067562-730490897.png

# Test OMR color scanner
python3 server/python/omr_color.py server/uploads/omr/omr-1770227067562-730490897.png
```

### Step 4: Check File Permissions

```bash
# Make scripts executable
chmod +x server/python/*.py

# Check ownership
ls -la server/python/
```

### Step 5: Update PM2 Environment

If using PM2, ensure Python is in PATH:

```bash
# Edit ecosystem.config.js to add Python path
nano /var/www/resultMA/ecosystem.config.js
```

Add to env:
```javascript
env: {
  NODE_ENV: 'production',
  PATH: '/usr/bin:/usr/local/bin:' + process.env.PATH
}
```

Then restart:
```bash
pm2 restart mathaca
pm2 save
```

### Step 6: Alternative - Use Absolute Python Path

If Python is installed but not in PATH, find its location:

```bash
which python3
# Output example: /usr/bin/python3
```

Then update the code to use absolute path (see code fix below).

## Code Fix (Alternative Solution)

If you can't modify the server environment, update the route to use absolute Python path:

```typescript
// In server/src/routes/omr.routes.ts
// Replace:
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

// With:
const pythonCmd = process.platform === 'win32' 
  ? 'python' 
  : (process.env.PYTHON_PATH || '/usr/bin/python3');
```

Then set PYTHON_PATH in your .env:
```
PYTHON_PATH=/usr/bin/python3
```

## Verification

After applying fixes, test the endpoint:

```bash
# Check logs
pm2 logs mathaca --lines 50

# Or check log file
tail -f /var/www/resultMA/logs/server-error.log
```

## Common Issues

### Issue: "ModuleNotFoundError: No module named 'cv2'"
**Solution**: Install opencv-python: `pip3 install opencv-python`

### Issue: "Permission denied"
**Solution**: Make scripts executable: `chmod +x server/python/*.py`

### Issue: "python3: command not found"
**Solution**: Install Python 3: `sudo apt-get install python3`

### Issue: Scripts work manually but fail via Node.js
**Solution**: PM2 might not have Python in PATH. Update ecosystem.config.js with full PATH.

## Quick Fix Script

Run this on your server:

```bash
#!/bin/bash
cd /var/www/resultMA

echo "Installing Python dependencies..."
pip3 install -r server/python/requirements.txt

echo "Making scripts executable..."
chmod +x server/python/*.py

echo "Testing environment..."
python3 server/python/test_environment.py

echo "Restarting PM2..."
pm2 restart mathaca

echo "Done! Check logs with: pm2 logs mathaca"
```
