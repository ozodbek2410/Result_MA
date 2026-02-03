#!/bin/bash

# MathAcademy Deployment Script
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting MathAcademy deployment..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="mathacademy"
DEPLOY_PATH="/var/www/mathacademy"
DOMAIN="mathacademy.biznesjon.uz"
BACKEND_PORT=9999
FRONTEND_PORT=9998

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}❌ Please do not run as root${NC}"
    exit 1
fi

# Step 1: Build the project
echo -e "${YELLOW}📦 Building project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Step 2: Create deployment directory
echo -e "${YELLOW}📁 Creating deployment directory...${NC}"
sudo mkdir -p $DEPLOY_PATH
sudo mkdir -p $DEPLOY_PATH/logs
sudo mkdir -p $DEPLOY_PATH/server/uploads/omr
sudo mkdir -p $DEPLOY_PATH/server/uploads
sudo chown -R $USER:$USER $DEPLOY_PATH

echo -e "${GREEN}✅ Directories created${NC}"

# Step 3: Copy files
echo -e "${YELLOW}📋 Copying files...${NC}"

# Copy server files
rsync -av --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'uploads' \
    server/ $DEPLOY_PATH/server/

# Copy client build
rsync -av --delete client/dist/ $DEPLOY_PATH/client/dist/

# Copy configuration files
cp ecosystem.config.js $DEPLOY_PATH/
cp package.json $DEPLOY_PATH/
cp package-lock.json $DEPLOY_PATH/

echo -e "${GREEN}✅ Files copied${NC}"

# Step 4: Install production dependencies
echo -e "${YELLOW}📦 Installing production dependencies...${NC}"
cd $DEPLOY_PATH
npm install --production

cd $DEPLOY_PATH/server
npm install --production

cd -

echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 4.5: Setup Python environment
echo -e "${YELLOW}🐍 Setting up Python environment...${NC}"

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 is not installed. Installing...${NC}"
    sudo apt update
    sudo apt install python3 python3-pip -y
fi

# Check Python version
PYTHON_VERSION=$(python3 --version)
echo -e "${GREEN}✅ Python installed: $PYTHON_VERSION${NC}"

# Install Python dependencies
if [ -f "$DEPLOY_PATH/server/python/requirements.txt" ]; then
    echo -e "${YELLOW}Installing Python packages...${NC}"
    pip3 install -r $DEPLOY_PATH/server/python/requirements.txt
    echo -e "${GREEN}✅ Python packages installed${NC}"
else
    echo -e "${YELLOW}⚠️  requirements.txt not found, installing common packages...${NC}"
    pip3 install opencv-python-headless numpy pyzbar pillow
    echo -e "${GREEN}✅ Python packages installed${NC}"
fi

# Verify Python packages
echo -e "${YELLOW}Verifying Python packages...${NC}"
python3 -c "import cv2; import numpy; print('✅ OpenCV and NumPy are working')" || {
    echo -e "${RED}❌ Python packages verification failed${NC}"
    exit 1
}

# Copy Python scripts
echo -e "${YELLOW}Copying Python scripts...${NC}"
mkdir -p $DEPLOY_PATH/python
rsync -av server/python/ $DEPLOY_PATH/python/

# Make Python scripts executable
chmod +x $DEPLOY_PATH/python/*.py

echo -e "${GREEN}✅ Python scripts copied${NC}"

# Step 5: Setup environment file
echo -e "${YELLOW}⚙️  Setting up environment...${NC}"

if [ ! -f "$DEPLOY_PATH/server/.env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating template...${NC}"
    cat > $DEPLOY_PATH/server/.env << EOF
# Server Configuration
PORT=$BACKEND_PORT
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb://localhost:27017/mathacademy

# JWT
JWT_SECRET=$(openssl rand -base64 32)

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# File Upload
MAX_FILE_SIZE=50mb

# CORS
CORS_ORIGIN=https://$DOMAIN
EOF
    echo -e "${RED}⚠️  Please edit $DEPLOY_PATH/server/.env with your actual values${NC}"
    echo -e "${YELLOW}Press Enter to continue after editing .env file...${NC}"
    read
fi

echo -e "${GREEN}✅ Environment configured${NC}"

# Step 6: Setup PM2
echo -e "${YELLOW}🔄 Setting up PM2...${NC}"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    sudo npm install -g pm2
fi

# Stop existing process if running
pm2 stop mathacademy-server 2>/dev/null || true
pm2 delete mathacademy-server 2>/dev/null || true

# Start new process
cd $DEPLOY_PATH
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER

echo -e "${GREEN}✅ PM2 configured${NC}"

# Step 7: Setup Nginx
echo -e "${YELLOW}🌐 Setting up Nginx...${NC}"

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}❌ Nginx is not installed. Please install it first:${NC}"
    echo "sudo apt update && sudo apt install nginx -y"
    exit 1
fi

# Copy Nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/$DOMAIN

# Create symlink if not exists
if [ ! -L "/etc/nginx/sites-enabled/$DOMAIN" ]; then
    sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
fi

# Test Nginx configuration
sudo nginx -t

if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    echo -e "${GREEN}✅ Nginx configured${NC}"
else
    echo -e "${RED}❌ Nginx configuration error${NC}"
    exit 1
fi

# Step 8: Setup SSL with Let's Encrypt
echo -e "${YELLOW}🔒 Setting up SSL...${NC}"

if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing Certbot...${NC}"
    sudo apt update
    sudo apt install certbot python3-certbot-nginx -y
fi

# Check if certificate already exists
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo -e "${YELLOW}Obtaining SSL certificate...${NC}"
    sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@biznesjon.uz
    echo -e "${GREEN}✅ SSL certificate obtained${NC}"
else
    echo -e "${GREEN}✅ SSL certificate already exists${NC}"
fi

# Step 9: Setup log rotation
echo -e "${YELLOW}📝 Setting up log rotation...${NC}"

sudo tee /etc/logrotate.d/mathacademy > /dev/null << EOF
$DEPLOY_PATH/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $USER $USER
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

echo -e "${GREEN}✅ Log rotation configured${NC}"

# Step 10: Final checks
echo -e "${YELLOW}🔍 Running final checks...${NC}"

# Check if server is running
sleep 3
if pm2 list | grep -q "mathacademy-server.*online"; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not running${NC}"
    pm2 logs mathacademy-server --lines 50
    exit 1
fi

# Check if port is listening
if netstat -tuln | grep -q ":$BACKEND_PORT "; then
    echo -e "${GREEN}✅ Server is listening on port $BACKEND_PORT${NC}"
else
    echo -e "${RED}❌ Server is not listening on port $BACKEND_PORT${NC}"
    exit 1
fi

# Display status
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "📊 Status:"
pm2 status
echo ""
echo -e "🌐 Website: https://$DOMAIN"
echo -e "🔧 Backend Port: $BACKEND_PORT"
echo -e "🎨 Frontend Port: $FRONTEND_PORT (internal)"
echo -e "📁 Deploy Path: $DEPLOY_PATH"
echo ""
echo -e "📝 Useful commands:"
echo -e "  View logs:    pm2 logs mathacademy-server"
echo -e "  Restart:      pm2 restart mathacademy-server"
echo -e "  Stop:         pm2 stop mathacademy-server"
echo -e "  Monitor:      pm2 monit"
echo ""
echo -e "${YELLOW}⚠️  Don't forget to:${NC}"
echo -e "  1. Configure MongoDB connection in .env"
echo -e "  2. Setup firewall rules if needed"
echo -e "  3. Configure backup strategy"
echo ""
