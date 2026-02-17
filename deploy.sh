#!/bin/bash

# ResultMA Deploy Script
# Usage: bash deploy.sh

set -e  # Exit on error

echo "🚀 Starting ResultMA deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Project paths
PROJECT_DIR="/var/www/Result_MA"
SERVER_DIR="$PROJECT_DIR/server"
CLIENT_DIR="$PROJECT_DIR/client"

# Step 1: Check if we're in the right directory
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Error: Project directory not found: $PROJECT_DIR${NC}"
    exit 1
fi

cd $PROJECT_DIR
echo -e "${GREEN}✅ Changed to project directory${NC}"

# Step 2: Install Node.js dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"

# Root dependencies
npm install

# Server dependencies
cd $SERVER_DIR
npm install
echo -e "${GREEN}✅ Server dependencies installed${NC}"

# Client dependencies
cd $CLIENT_DIR
npm install
echo -e "${GREEN}✅ Client dependencies installed${NC}"

# Step 3: Install Python dependencies
echo -e "${YELLOW}🐍 Installing Python dependencies...${NC}"
cd $SERVER_DIR/python

# Check if pip3 is available
if command -v pip3 &> /dev/null; then
    pip3 install -r requirements.txt
    echo -e "${GREEN}✅ Python dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠️  pip3 not found, skipping Python dependencies${NC}"
fi

# Step 4: Install Playwright browsers
echo -e "${YELLOW}🎭 Installing Playwright browsers...${NC}"
cd $SERVER_DIR
npx playwright install chromium
npx playwright install-deps chromium
echo -e "${GREEN}✅ Playwright installed${NC}"

# Step 5: Build TypeScript (Server)
echo -e "${YELLOW}🔨 Building server...${NC}"
cd $SERVER_DIR
npm run build
echo -e "${GREEN}✅ Server built successfully${NC}"

# Step 6: Build React (Client)
echo -e "${YELLOW}🔨 Building client...${NC}"
cd $CLIENT_DIR
npm run build
echo -e "${GREEN}✅ Client built successfully${NC}"

# Step 7: Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
cd $PROJECT_DIR
mkdir -p logs
mkdir -p server/uploads/omr
mkdir -p server/uploads/tests
mkdir -p server/uploads/profiles
echo -e "${GREEN}✅ Directories created${NC}"

# Step 8: Set permissions
echo -e "${YELLOW}🔐 Setting permissions...${NC}"
chmod -R 755 $PROJECT_DIR
chmod -R 777 $PROJECT_DIR/server/uploads
chmod -R 777 $PROJECT_DIR/logs
echo -e "${GREEN}✅ Permissions set${NC}"

# Step 9: PM2 setup
echo -e "${YELLOW}⚙️  Setting up PM2...${NC}"
cd $PROJECT_DIR

# Stop existing process if running
pm2 stop resultma-server 2>/dev/null || true
pm2 delete resultma-server 2>/dev/null || true

# Start with ecosystem config
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup systemd -u root --hp /root

echo -e "${GREEN}✅ PM2 configured${NC}"

# Step 10: Show status
echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo "📊 PM2 Status:"
pm2 ls

echo ""
echo "📝 Next steps:"
echo "1. Configure Nginx (if not done yet)"
echo "2. Setup SSL certificate"
echo "3. Test the application"
echo ""
echo "🔗 URLs:"
echo "   Backend: http://localhost:9999"
echo "   Frontend: http://localhost:9998 (if nginx configured)"
echo ""
echo "📋 Useful commands:"
echo "   pm2 logs resultma-server  - View logs"
echo "   pm2 restart resultma-server - Restart server"
echo "   pm2 monit - Monitor resources"
