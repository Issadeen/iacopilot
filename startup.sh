#!/bin/bash
set -e

echo "Starting WhatsApp bot setup..."

# Install global dependencies
echo "Installing PM2 globally..."
npm install -g pm2

# Install Chrome and dependencies
echo "Installing Chrome dependencies..."
sudo apt-get update
sudo apt-get install -y wget curl gnupg chromium-browser

# Create necessary directories
echo "Setting up directories..."
mkdir -p /home/site/wwwroot/session
mkdir -p /home/site/wwwroot/logs
chmod -R 777 /home/site/wwwroot/session
chmod -R 777 /home/site/wwwroot/logs

# Export environment variables
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
export NODE_ENV=production
export WEBSITES_PORT=8080

# Start the application with PM2
echo "Starting application with PM2..."
cd /home/site/wwwroot
pm2 start ecosystem.config.js --no-daemon