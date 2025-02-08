#!/bin/bash
set -e

# Log startup
echo "Starting WhatsApp bot setup..."

# Install Chrome on Azure Linux with error handling
echo "Installing Chrome dependencies..."
sudo apt-get update || { echo "Failed to update apt"; exit 1; }
sudo apt-get install -y wget curl gnupg || { echo "Failed to install basic dependencies"; exit 1; }

echo "Downloading Chrome..."
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb || { 
    curl -O https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb || {
        echo "Failed to download Chrome"; exit 1;
    }
}

echo "Installing Chrome and dependencies..."
sudo apt-get install -y ./google-chrome-stable_current_amd64.deb || { echo "Failed to install Chrome"; exit 1; }
sudo apt-get install -y libnss3 libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libasound2 || { echo "Failed to install Chrome dependencies"; exit 1; }

# Create necessary directories with proper permissions
echo "Setting up directories..."
mkdir -p /home/site/wwwroot/session
chmod -R 777 /home/site/wwwroot/session

# Start the bot with proper environment variables
echo "Starting the bot..."
export PORT=8080
NODE_ENV=production node bot.js