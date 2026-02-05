#!/bin/bash
# Check OMR system status

echo "========================================="
echo "OMR System Status Check"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check Python
echo "1. Python Installation"
echo "----------------------"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓${NC} Python: $PYTHON_VERSION"
    PYTHON_PATH=$(which python3)
    echo "  Path: $PYTHON_PATH"
else
    echo -e "${RED}✗${NC} Python not found"
    exit 1
fi

# Check pip
echo ""
echo "2. Pip Installation"
echo "-------------------"
if command -v pip3 &> /dev/null; then
    PIP_VERSION=$(pip3 --version)
    echo -e "${GREEN}✓${NC} pip: $PIP_VERSION"
else
    echo -e "${RED}✗${NC} pip not found"
fi

# Check Python dependencies
echo ""
echo "3. Python Dependencies"
echo "----------------------"

# Check opencv
if python3 -c "import cv2" 2>/dev/null; then
    CV_VERSION=$(python3 -c "import cv2; print(cv2.__version__)")
    echo -e "${GREEN}✓${NC} opencv-python: $CV_VERSION"
else
    echo -e "${RED}✗${NC} opencv-python not installed"
    echo "  Install: pip3 install opencv-python"
fi

# Check numpy
if python3 -c "import numpy" 2>/dev/null; then
    NP_VERSION=$(python3 -c "import numpy; print(numpy.__version__)")
    echo -e "${GREEN}✓${NC} numpy: $NP_VERSION"
else
    echo -e "${RED}✗${NC} numpy not installed"
    echo "  Install: pip3 install numpy"
fi

# Check Pillow
if python3 -c "import PIL" 2>/dev/null; then
    PIL_VERSION=$(python3 -c "import PIL; print(PIL.__version__)")
    echo -e "${GREEN}✓${NC} Pillow: $PIL_VERSION"
else
    echo -e "${YELLOW}⚠${NC} Pillow not installed (optional)"
fi

# Check Python scripts
echo ""
echo "4. Python Scripts"
echo "-----------------"

if [ -f "python/omr_color.py" ]; then
    if [ -x "python/omr_color.py" ]; then
        echo -e "${GREEN}✓${NC} omr_color.py (executable)"
    else
        echo -e "${YELLOW}⚠${NC} omr_color.py (not executable)"
        echo "  Fix: chmod +x python/omr_color.py"
    fi
else
    echo -e "${RED}✗${NC} omr_color.py not found"
fi

if [ -f "python/qr_scanner.py" ]; then
    if [ -x "python/qr_scanner.py" ]; then
        echo -e "${GREEN}✓${NC} qr_scanner.py (executable)"
    else
        echo -e "${YELLOW}⚠${NC} qr_scanner.py (not executable)"
        echo "  Fix: chmod +x python/qr_scanner.py"
    fi
else
    echo -e "${RED}✗${NC} qr_scanner.py not found"
fi

# Check .env configuration
echo ""
echo "5. Environment Configuration"
echo "----------------------------"

if [ -f ".env" ]; then
    if grep -q "PYTHON_PATH" .env; then
        PYTHON_PATH_ENV=$(grep "PYTHON_PATH" .env | cut -d '=' -f2)
        echo -e "${GREEN}✓${NC} PYTHON_PATH configured: $PYTHON_PATH_ENV"
    else
        echo -e "${YELLOW}⚠${NC} PYTHON_PATH not set in .env"
        echo "  Add: PYTHON_PATH=$PYTHON_PATH"
    fi
else
    echo -e "${YELLOW}⚠${NC} .env file not found"
fi

# Check uploads directory
echo ""
echo "6. Upload Directory"
echo "-------------------"

if [ -d "uploads/omr" ]; then
    OMR_COUNT=$(find uploads/omr -type f \( -name "*.jpg" -o -name "*.png" \) | wc -l)
    echo -e "${GREEN}✓${NC} uploads/omr exists ($OMR_COUNT images)"
    
    # Check permissions
    if [ -w "uploads/omr" ]; then
        echo -e "${GREEN}✓${NC} uploads/omr is writable"
    else
        echo -e "${RED}✗${NC} uploads/omr is not writable"
        echo "  Fix: chmod 755 uploads/omr"
    fi
else
    echo -e "${RED}✗${NC} uploads/omr directory not found"
    echo "  Create: mkdir -p uploads/omr"
fi

# Test Python scripts
echo ""
echo "7. Script Functionality Test"
echo "-----------------------------"

# Find a test image
TEST_IMAGE=$(find uploads/omr -type f \( -name "*.jpg" -o -name "*.png" \) | head -n 1)

if [ -n "$TEST_IMAGE" ]; then
    echo "Testing with: $(basename $TEST_IMAGE)"
    
    # Test QR scanner
    echo -n "  QR Scanner: "
    if python3 python/qr_scanner.py "$TEST_IMAGE" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠${NC} (may be OK if no QR code)"
    fi
    
    # Test OMR scanner
    echo -n "  OMR Scanner: "
    if python3 python/omr_color.py "$TEST_IMAGE" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
    fi
else
    echo -e "${YELLOW}⚠${NC} No test images found"
    echo "  Upload an OMR image to test"
fi

# Check PM2 status
echo ""
echo "8. Server Status"
echo "----------------"

if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "mathaca"; then
        STATUS=$(pm2 list | grep "mathaca" | awk '{print $10}')
        if [ "$STATUS" = "online" ]; then
            echo -e "${GREEN}✓${NC} PM2 process 'mathaca' is running"
        else
            echo -e "${RED}✗${NC} PM2 process 'mathaca' is $STATUS"
            echo "  Restart: pm2 restart mathaca"
        fi
    else
        echo -e "${YELLOW}⚠${NC} PM2 process 'mathaca' not found"
    fi
else
    echo -e "${YELLOW}⚠${NC} PM2 not installed"
fi

# Summary
echo ""
echo "========================================="
echo "Summary"
echo "========================================="

# Count issues
ISSUES=0

if ! command -v python3 &> /dev/null; then ((ISSUES++)); fi
if ! python3 -c "import cv2" 2>/dev/null; then ((ISSUES++)); fi
if ! python3 -c "import numpy" 2>/dev/null; then ((ISSUES++)); fi
if [ ! -f "python/omr_color.py" ]; then ((ISSUES++)); fi
if [ ! -f "python/qr_scanner.py" ]; then ((ISSUES++)); fi

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "OMR system is ready to use."
else
    echo -e "${RED}✗ Found $ISSUES issue(s)${NC}"
    echo ""
    echo "Run setup script to fix:"
    echo "  ./setup-python-omr.sh"
fi

echo ""
