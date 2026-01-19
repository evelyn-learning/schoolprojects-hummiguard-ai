#!/bin/bash

# Colors for output formatting
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_IP="84.247.185.169"
SERVER_USER="root"
REMOTE_DIR="/root/schoolprojects/hummiguard-ai"
PROJECT_NAME="hummiguard-ai"
PORT="3003"

# Log function with timestamps
log_message() {
  local level=$1
  local message=$2
  local color=$NC

  case $level in
    "INFO") color=$GREEN ;;
    "ERROR") color=$RED ;;
    "WARNING") color=$YELLOW ;;
    "STEP") color=$BLUE ;;
  esac

  echo -e "${color}[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] ${message}${NC}"
}

# Error handling function
handle_error() {
  log_message "ERROR" "An error occurred on line $1"
  exit 1
}

# Set up trap to catch errors
trap 'handle_error $LINENO' ERR

# Function to run remote command via SSH
run_remote_command() {
  local command=$1
  ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "$command"
}

# Starting deployment
log_message "INFO" "Starting HummiGuard AI deployment to production..."

# Step 1: Check for production env files
log_message "STEP" "Checking production environment files..."
if [ ! -f ".env.production" ]; then
  log_message "ERROR" ".env.production file not found. Please create it with your ANTHROPIC_API_KEY"
  exit 1
fi

# Step 2: Build Next.js project locally
log_message "STEP" "Building Next.js project locally..."

# Clean up previous builds
log_message "INFO" "Cleaning up previous build artifacts..."
rm -rf .next/
rm -f tsconfig.tsbuildinfo

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  log_message "INFO" "Installing dependencies..."
  npm install || {
    log_message "ERROR" "Failed to install dependencies"
    exit 1
  }
fi

# Build the project
npm run build || {
  log_message "ERROR" "Failed to build Next.js project"
  exit 1
}
log_message "INFO" "Build completed successfully"

# Step 3: Create remote directory if it doesn't exist
log_message "STEP" "Preparing remote directory..."
run_remote_command "mkdir -p $REMOTE_DIR" || {
  log_message "ERROR" "Failed to create remote directory"
  exit 1
}

# Step 4: Sync files to production server using rsync
log_message "STEP" "Uploading files to production server..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.production' \
  --exclude '.env.local.production' \
  ./ "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/" || {
  log_message "ERROR" "Failed to upload files to server"
  exit 1
}
log_message "INFO" "Files uploaded successfully"

# Step 5: Copy production env files to remote
log_message "STEP" "Copying environment files to server..."
scp -o StrictHostKeyChecking=no .env.production "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/.env" || {
  log_message "ERROR" "Failed to copy .env.production to server"
  exit 1
}

if [ -f ".env.local.production" ]; then
  scp -o StrictHostKeyChecking=no .env.local.production "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/.env.local" || {
    log_message "WARNING" "Failed to copy .env.local.production to server"
  }
fi
log_message "INFO" "Environment files copied successfully"

# Step 6: Install dependencies on server
log_message "STEP" "Installing dependencies on server..."
run_remote_command "cd $REMOTE_DIR && npm install --production" || {
  log_message "ERROR" "Failed to install dependencies on server"
  exit 1
}

# Step 7: Restart PM2 process
log_message "STEP" "Restarting PM2 process..."
run_remote_command "cd $REMOTE_DIR && pm2 delete $PROJECT_NAME 2>/dev/null || true && pm2 start npm --name '$PROJECT_NAME' -- start && pm2 save" || {
  log_message "ERROR" "Failed to restart PM2 process"
  exit 1
}

# Step 8: Check PM2 status
log_message "STEP" "Checking PM2 status..."
sleep 3
run_remote_command "pm2 list" || {
  log_message "WARNING" "Could not get PM2 status"
}

# Step 9: Deployment complete
log_message "INFO" "=========================================="
log_message "INFO" "Deployment to production completed successfully!"
log_message "INFO" "=========================================="
log_message "INFO" "Application running on port $PORT"
log_message "INFO" "Access via: https://$SERVER_IP/hummiguard-ai"
log_message "INFO" ""
log_message "INFO" "Check logs: ssh root@$SERVER_IP 'pm2 logs $PROJECT_NAME'"
log_message "INFO" "Restart: ssh root@$SERVER_IP 'pm2 restart $PROJECT_NAME'"
