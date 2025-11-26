# Server Deployment Guide

## Quick Commands

### Deploy Server
```bash
cd /home/legion/project91/notula-ai/server
./deploy.sh
```

### Check Server Logs
```bash
./check-logs.sh
```

### View Live Logs
```bash
ssh -i ~/.ssh/gcp_key legion@34.78.56.154 'sudo docker logs -f notula-app'
```

### Restart Server
```bash
ssh -i ~/.ssh/gcp_key legion@34.78.56.154 'sudo docker restart notula-app'
```

### Check Server Status
```bash
curl http://34.78.56.154:8000/
# Should return: {"message":"Notula AI Server is running (REST Mode)"}
```

## Deployment Checklist

Before deploying, ensure:
- [ ] `server/.env` file exists with `GOOGLE_CLIENT_ID`
- [ ] `server/auth_middleware.py` exists
- [ ] `server/app.py` has authentication imports
- [ ] `server/Dockerfile` copies both `app.py` and `auth_middleware.py`
- [ ] `server/requirements.txt` includes google-auth packages

## What Gets Deployed

The `deploy.sh` script:
1. Validates `.env` file exists and has `GOOGLE_CLIENT_ID`
2. Copies files to server:
   - `app.py`
   - `auth_middleware.py`
   - `Dockerfile`
   - `requirements.txt`
   - `.env`
3. Builds Docker image with all dependencies
4. Stops old container
5. Starts new container with environment variables from `.env`
6. Shows container status and logs

## Troubleshooting

### Server Not Starting
```bash
# Check logs
./check-logs.sh

# Common issues:
# - Missing auth_middleware.py: Update Dockerfile
# - Missing GOOGLE_CLIENT_ID: Check server/.env
# - Port already in use: Stop old container first
```

### Connection Refused
```bash
# Check if container is running
ssh -i ~/.ssh/gcp_key legion@34.78.56.154 'sudo docker ps | grep notula-app'

# Check firewall
# Ensure port 8000 is open in Google Cloud Console
```

### Authentication Errors
```bash
# Verify GOOGLE_CLIENT_ID is set
ssh -i ~/.ssh/gcp_key legion@34.78.56.154 'cat ~/notula-server/.env'

# Check server logs for auth errors
./check-logs.sh
```

## Server Configuration

### Environment Variables (server/.env)
```env
GOOGLE_CLIENT_ID=your_client_id_here
WHISPER_MODEL=base
```

### Docker Container
- **Name**: notula-app
- **Port**: 8000 (host) → 8000 (container)
- **Restart Policy**: unless-stopped
- **Environment**: Loaded from `.env` file

## Files Structure on Server

```
~/notula-server/
├── app.py
├── auth_middleware.py
├── Dockerfile
├── requirements.txt
└── .env
```

## Monitoring

### Check if Server is Healthy
```bash
curl http://34.78.56.154:8000/
```

### Watch Logs in Real-Time
```bash
ssh -i ~/.ssh/gcp_key legion@34.78.56.154 'sudo docker logs -f notula-app'
```

### Check Resource Usage
```bash
ssh -i ~/.ssh/gcp_key legion@34.78.56.154 'sudo docker stats notula-app'
```

## Updates

When you make changes to the code:

1. **Update local files** (app.py, auth_middleware.py, etc.)
2. **Run deployment script**:
   ```bash
   cd /home/legion/project91/notula-ai/server
   ./deploy.sh
   ```
3. **Verify deployment**:
   ```bash
   ./check-logs.sh
   ```

The deployment script handles:
- Copying updated files
- Rebuilding Docker image
- Restarting container
- Cleaning up old images

## Current Status

✅ **Server is running at**: http://34.78.56.154:8000  
✅ **Authentication**: Enabled with Google OAuth  
✅ **Whisper Model**: base  
✅ **Auto-restart**: Enabled  

## Testing from Client

Once server is deployed, test from your local machine:

```bash
cd /home/legion/project91/notula-ai
npm start
```

1. Login with Google
2. Click "Record Meeting"
3. Speak or play audio
4. Check server logs to see authenticated requests:
   ```bash
   ./check-logs.sh
   # Should show: "Transcribing audio for user: your@email.com"
   ```
