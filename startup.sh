#!/bin/bash
set -e

echo "Starting application setup at $(date)..."

# Function for logging with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Error handler with more detailed logging
handle_error() {
    local line_no=$1
    local error_code=$2
    log "Error occurred in script at line: $line_no with exit code: $error_code"
    log "Last 10 lines of logs:"
    tail -n 10 /home/site/wwwroot/logs/app.log || true
    exit 1
}

trap 'handle_error ${LINENO} $?' ERR

# Set environment variables with fallbacks
export PORT="${PORT:-8080}"
export NODE_ENV="${NODE_ENV:-production}"
export WEBSITE_NODE_DEFAULT_VERSION="${WEBSITE_NODE_DEFAULT_VERSION:-20-lts}"

# Log environment details
log "Environment Configuration:"
log "PORT: $PORT"
log "NODE_ENV: $NODE_ENV"
log "PWD: $(pwd)"
log "Node Version: $(node -v)"
log "NPM Version: $(npm -v)"

# Verify critical dependencies
command -v node >/dev/null 2>&1 || { log "Node.js is required but not installed. Aborting."; exit 1; }
command -v npm >/dev/null 2>&1 || { log "npm is required but not installed. Aborting."; exit 1; }

# Create and set permissions for logs directory
mkdir -p /home/site/wwwroot/logs
chmod -R 777 /home/site/wwwroot/logs

# Move to application directory
cd /home/site/wwwroot || { log "Failed to change to application directory"; exit 1; }

# Check and install dependencies
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    log "Installing dependencies..."
    # Clear npm cache first to avoid any corruption
    npm cache clean --force
    # Install dependencies with detailed logging
    npm install --production --verbose
else
    log "Dependencies already installed, skipping npm install"
fi

# Verify critical files exist
[ -f "bot.js" ] || { log "bot.js not found. Aborting."; exit 1; }
[ -f "package.json" ] || { log "package.json not found. Aborting."; exit 1; }

# Start the application with proper logging and monitoring
log "Starting Node.js application..."
node bot.js 2>&1 | tee -a /home/site/wwwroot/logs/app.log