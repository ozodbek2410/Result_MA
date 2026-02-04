#!/bin/bash
# Setup script for Python OMR dependencies on production server

set -e  # Exit on error

echo "========================================="
echo "Python OMR Setup Script"
echo "========================================="
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check Python
echo "1. Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✅ Python found: $PYTHON_VERSION"
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version)
    echo "✅ Python found: $PYTHON_VERSION"
    PYTHON_CMD="python"
else
    echo "❌ Python not found!"
    echo "Install Python 3: sudo apt-get install python3 python3-pip"
    exit 1
fi

# Check pip
echo ""
echo "2. Checking pip installation..."
if command -v pip3 &> /dev/null; then
    echo "✅ pip3 found"
    PIP_CMD="pip3"
elif command -v pip &> /dev/null; then
    echo "✅ pip found"
    PIP_CMD="pip"
else
    echo "❌ pip not found!"
    echo "Install pip: sudo apt-get install python3-pip"
    exit 1
fi

# Install dependencies
echo ""
echo "3. Installing Python dependencies..."
cd python
if [ -f "requirements.txt" ]; then
    echo "Installing from requirements.txt..."
    $PIP_CMD install -r requirements.txt
    echo "✅ Dependencies installed"
else
    echo "❌ requirements.txt not found!"
    exit 1
fi

# Make scripts executable
echo ""
echo "4. Making Python scripts executable..."
chmod +x *.py
echo "✅ Scripts are now executable"

# Test environment
echo ""
echo "5. Testing Python environment..."
$PYTHON_CMD test_environment.py

# Test scripts
echo ""
echo "6. Testing Python scripts..."

# Find a test image
TEST_IMAGE=$(find ../uploads/omr -name "*.png" -o -name "*.jpg" | head -n 1)

if [ -n "$TEST_IMAGE" ]; then
    echo "Testing with image: $TEST_IMAGE"
    
    echo ""
    echo "Testing QR scanner..."
    $PYTHON_CMD qr_scanner.py "$TEST_IMAGE" || echo "⚠️ QR scanner test failed (might be OK if no QR in image)"
    
    echo ""
    echo "Testing OMR color scanner..."
    $PYTHON_CMD omr_color.py "$TEST_IMAGE" || echo "⚠️ OMR scanner test failed"
else
    echo "⚠️ No test images found in uploads/omr"
    echo "Upload an OMR image to test the scripts"
fi

# Check which python to use
echo ""
echo "7. Python path information..."
PYTHON_PATH=$(which $PYTHON_CMD)
echo "Python executable: $PYTHON_PATH"
echo ""
echo "Add this to your .env file:"
echo "PYTHON_PATH=$PYTHON_PATH"

echo ""
echo "========================================="
echo "✅ Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Add PYTHON_PATH=$PYTHON_PATH to server/.env"
echo "2. Restart your Node.js server: pm2 restart mathaca"
echo "3. Test the OMR endpoint"
echo ""
