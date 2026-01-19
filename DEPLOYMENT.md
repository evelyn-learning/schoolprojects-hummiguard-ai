# HummiGuard AI Deployment Guide

## Prerequisites

- Node.js 18+ installed locally
- SSH access to production server (84.247.185.169)
- rsync installed locally
- Anthropic API key (get one at https://console.anthropic.com/settings/keys)

## Environment Setup

### Production Environment Files

Create these files locally (they are NOT committed to git):

**`.env.production`** - copied to `.env` on the server:
```
ANTHROPIC_API_KEY=your_api_key_here
```

**`.env.local.production`** - copied to `.env.local` on the server:
```
ANTHROPIC_API_KEY=your_api_key_here
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` with your API key:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3003/hummiguard-ai in your browser

## Generate PWA Icons

The project includes an SVG icon. To generate PNG icons:

```bash
npm install sharp --save-dev
node scripts/generate-icons.js
```

Or manually convert `public/icon.svg` to PNG at 192x192 and 512x512 pixels.

## Production Deployment

### First-Time Setup

1. Make the deploy script executable:
   ```bash
   chmod +x deploy-to-production.sh
   ```

2. Create your `.env.production` file with the Anthropic API key

3. Run the deployment:
   ```bash
   ./deploy-to-production.sh
   ```

### Deploying Updates

Simply run:
```bash
./deploy-to-production.sh
```

The script will:
1. Check for `.env.production` file
2. Build the Next.js project locally
3. Upload files to the server via rsync
4. Copy environment files (`.env.production` -> `.env`)
5. Install production dependencies
6. Set up/update the systemd service
7. Restart the application

## Nginx Configuration (Required for Subpath)

Add this to your nginx configuration (e.g., `/etc/nginx/sites-available/default`):

```nginx
# HummiGuard AI - running on port 3003
location /hummiguard-ai {
    proxy_pass http://localhost:3003/hummiguard-ai;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location /hummiguard-ai/_next/static {
    proxy_pass http://localhost:3003/hummiguard-ai/_next/static;
    proxy_cache_bypass $http_upgrade;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

After adding, reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Server Configuration

### Application Details
- **Port**: 3003
- **Base Path**: /hummiguard-ai
- **Directory**: `/root/schoolprojects/hummiguard-ai`
- **Service Name**: `hummiguard-ai`
- **Access URL**: `http://84.247.185.169/hummiguard-ai` (after nginx config)

### Useful Commands

Check service status:
```bash
ssh root@84.247.185.169 'systemctl status hummiguard-ai'
```

View logs:
```bash
ssh root@84.247.185.169 'journalctl -u hummiguard-ai -f'
```

Restart service:
```bash
ssh root@84.247.185.169 'systemctl restart hummiguard-ai'
```

Stop service:
```bash
ssh root@84.247.185.169 'systemctl stop hummiguard-ai'
```

## Mobile Access

### Adding to Home Screen (PWA)

1. Open the app URL in your mobile browser
2. Tap the share button (iOS) or menu (Android)
3. Select "Add to Home Screen"
4. The app will appear as "HummiGuard AI"

### Camera Permissions

The app requires camera permissions to function:
- On iOS Safari: Settings > Safari > Camera > Allow
- On Android Chrome: Settings > Site settings > Camera > Allow

**Note**: Camera access requires HTTPS. The app will work over HTTP on localhost only.

## Troubleshooting

### Camera not working
- Ensure you're accessing via HTTPS (or localhost for testing)
- Check browser camera permissions
- Try a different browser

### API errors
- Verify ANTHROPIC_API_KEY is set correctly in `.env.production`
- Check server logs for detailed error messages
- Ensure the API key has sufficient credits

### Service won't start
- Check logs: `journalctl -u hummiguard-ai -n 50`
- Verify Node.js is installed: `node --version`
- Check if port 3003 is already in use: `lsof -i :3003`

### 404 errors on /hummiguard-ai
- Ensure nginx is configured and reloaded
- Check that the service is running on port 3003
- Verify basePath is set in next.config.js

## GitHub Repository

This project is hosted at: https://github.com/evelyn-learning/schoolprojects-hummiguard-ai
