# Python OMR Scripts

This directory contains Python scripts for Optical Mark Recognition (OMR) processing.

## Scripts

- **omr_color.py** - Main OMR scanner for colored bubble sheets (green=empty, red/dark=filled)
- **qr_scanner.py** - QR code scanner for variant identification
- **test_environment.py** - Environment diagnostic tool

## Requirements

- Python 3.7+
- OpenCV (opencv-python)
- NumPy
- Pillow

## Installation

### Quick Setup (Recommended)

Run the setup script from the server directory:

```bash
cd /var/www/resultMA/server
chmod +x setup-python-omr.sh
./setup-python-omr.sh
```

This will:
1. Check Python installation
2. Install dependencies
3. Make scripts executable
4. Test the environment
5. Provide the Python path for .env

### Manual Installation

```bash
# Install dependencies
pip3 install -r requirements.txt

# Make scripts executable
chmod +x *.py

# Test environment
python3 test_environment.py
```

## Usage

### Test Environment

```bash
python3 test_environment.py
```

Output:
```json
{
  "python_version": "3.10.12 ...",
  "python_executable": "/usr/bin/python3",
  "imports": {
    "cv2": {
      "available": true,
      "version": "4.8.1"
    },
    "numpy": {
      "available": true,
      "version": "1.26.2"
    }
  }
}
```

### Scan QR Code

```bash
python3 qr_scanner.py /path/to/image.jpg
```

Output:
```json
{
  "found": true,
  "data": "VAR-ABC123"
}
```

### Process OMR Sheet

```bash
python3 omr_color.py /path/to/image.jpg
```

Output:
```json
{
  "success": true,
  "detected_answers": {
    "1": "A",
    "2": "B",
    "3": "C"
  },
  "total_questions": 30,
  "annotated_image": "checked_image.jpg"
}
```

## Troubleshooting

### ModuleNotFoundError: No module named 'cv2'

Install OpenCV:
```bash
pip3 install opencv-python
```

### Permission denied

Make scripts executable:
```bash
chmod +x *.py
```

### Python not found

Install Python 3:
```bash
sudo apt-get update
sudo apt-get install python3 python3-pip
```

### Scripts work manually but fail from Node.js

1. Find Python path:
```bash
which python3
```

2. Add to `server/.env`:
```
PYTHON_PATH=/usr/bin/python3
```

3. Restart server:
```bash
pm2 restart mathaca
```

## Integration with Node.js

The Node.js server calls these scripts via `child_process.exec()`. 

Environment variable `PYTHON_PATH` can be set to specify the Python executable:

```bash
# In server/.env
PYTHON_PATH=/usr/bin/python3
```

If not set, defaults to:
- Windows: `python`
- Linux/Mac: `python3`

## Development

### Testing Changes

```bash
# Test with a sample image
python3 omr_color.py ../uploads/omr/sample.jpg

# Check output
cat ../uploads/omr/checked_sample.jpg
```

### Debugging

Scripts output debug information to stderr:
```bash
python3 omr_color.py image.jpg 2>&1 | grep DEBUG
```

## Production Deployment

1. Run setup script:
```bash
./setup-python-omr.sh
```

2. Add Python path to .env (from setup output)

3. Restart Node.js server:
```bash
pm2 restart mathaca
```

4. Check logs:
```bash
pm2 logs mathaca --lines 50
```

## Support

For issues, see: `server/PYTHON_OMR_TROUBLESHOOTING.md`
