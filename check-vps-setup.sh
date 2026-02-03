#!/bin/bash

# VPS Setup Checker for OMR functionality
# Run this on your VPS: bash check-vps-setup.sh

echo "🔍 Checking VPS setup for OMR functionality..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

# 1. Check Python3
echo "1️⃣ Checking Python3..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✅ Python3 found: $PYTHON_VERSION${NC}"
else
    echo -e "${RED}❌ Python3 not found${NC}"
    echo "   Install: sudo apt install python3 python3-pip -y"
    ERRORS=$((ERRORS + 1))
fi

# 2. Check pip3
echo ""
echo "2️⃣ Checking pip3..."
if command -v pip3 &> /dev/null; then
    PIP_VERSION=$(pip3 --version)
    echo -e "${GREEN}✅ pip3 found: $PIP_VERSION${NC}"
else
    echo -e "${RED}❌ pip3 not found${NC}"
    echo "   Install: sudo apt install python3-pip -y"
    ERRORS=$((ERRORS + 1))
fi

# 3. Check Python packages
echo ""
echo "3️⃣ Checking Python packages..."

# OpenCV
if python3 -c "import cv2" 2>/dev/null; then
    CV_VERSION=$(python3 -c "import cv2; print(cv2.__version__)")
    echo -e "${GREEN}✅ opencv-python: $CV_VERSION${NC}"
else
    echo -e "${RED}❌ opencv-python not installed${NC}"
    echo "   Install: pip3 install opencv-python-headless"
    ERRORS=$((ERRORS + 1))
fi

# NumPy
if python3 -c "import numpy" 2>/dev/null; then
    NP_VERSION=$(python3 -c "import numpy; print(numpy.__version__)")
    echo -e "${GREEN}✅ numpy: $NP_VERSION${NC}"
else
    echo -e "${RED}❌ numpy not installed${NC}"
    echo "   Install: pip3 install numpy"
    ERRORS=$((ERRORS + 1))
fi

# 4. Check directories
echo ""
echo "4️⃣ Checking directories..."

DEPLOY_PATH="/var/www/mathacademy"

if [ -d "$DEPLOY_PATH" ]; then
    echo -e "${GREEN}✅ Deploy directory exists: $DEPLOY_PATH${NC}"
    
    # Check uploads directory
    if [ -d "$DEPLOY_PATH/server/uploads/omr" ]; then
        echo -e "${GREEN}✅ OMR uploads directory exists${NC}"
        
        # Check permissions
        if [ -w "$DEPLOY_PATH/server/uploads/omr" ]; then
            echo -e "${GREEN}✅ OMR directory is writable${NC}"
        else
            echo -e "${RED}❌ OMR directory is not writable${NC}"
            echo "   Fix: sudo chown -R \$USER:\$USER $DEPLOY_PATH/server/uploads"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "${RED}❌ OMR uploads directory missing${NC}"
        echo "   Create: mkdir -p $DEPLOY_PATH/server/uploads/omr"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Check Python scripts
    if [ -d "$DEPLOY_PATH/python" ]; then
        echo -e "${GREEN}✅ Python scripts directory exists${NC}"
        
        if [ -f "$DEPLOY_PATH/python/omr_color.py" ]; then
            echo -e "${GREEN}✅ omr_color.py found${NC}"
        else
            echo -e "${RED}❌ omr_color.py not found${NC}"
            ERRORS=$((ERRORS + 1))
        fi
        
        if [ -f "$DEPLOY_PATH/python/qr_scanner.py" ]; then
            echo -e "${GREEN}✅ qr_scanner.py found${NC}"
        else
            echo -e "${RED}❌ qr_scanner.py not found${NC}"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "${RED}❌ Python scripts directory missing${NC}"
        echo "   This should be at: $DEPLOY_PATH/python/"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}❌ Deploy directory not found: $DEPLOY_PATH${NC}"
    ERRORS=$((ERRORS + 1))
fi

# 5. Check PM2
echo ""
echo "5️⃣ Checking PM2..."
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ PM2 found${NC}"
    pm2 list | grep mathacademy
else
    echo -e "${YELLOW}⚠️  PM2 not found${NC}"
fi

# 6. Check Node.js
echo ""
echo "6️⃣ Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo "Your VPS is ready for OMR functionality."
else
    echo -e "${RED}❌ Found $ERRORS error(s)${NC}"
    echo "Please fix the issues above."
fi
echo "=========================================="
echo ""

# Quick fix commands
if [ $ERRORS -gt 0 ]; then
    echo "🔧 Quick fix commands:"
    echo ""
    echo "# Install Python and dependencies:"
    echo "sudo apt update"
    echo "sudo apt install python3 python3-pip -y"
    echo "pip3 install opencv-python-headless numpy pyzbar pillow"
    echo ""
    echo "# Create directories:"
    echo "sudo mkdir -p $DEPLOY_PATH/server/uploads/omr"
    echo "sudo chown -R \$USER:\$USER $DEPLOY_PATH"
    echo ""
    echo "# Copy Python scripts (run from project root):"
    echo "rsync -av server/python/ $DEPLOY_PATH/python/"
    echo ""
fi

exit $ERRORS
