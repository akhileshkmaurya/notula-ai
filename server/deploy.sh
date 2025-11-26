#!/bin/bash

# --- Configuration ---
REMOTE_USER="legion" 
REMOTE_HOST="34.78.56.154"
REMOTE_DIR="~/notula-server"
KEY_PATH="-i ~/.ssh/gcp_key"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================================"
echo "  Deploying Notula AI Server with Authentication"
echo "================================================"
echo ""

# Check if .env file exists
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "⚠️  Warning: .env file not found in server directory"
    echo "Creating .env from template..."
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo ""
    echo "❌ Please edit server/.env and add your GOOGLE_CLIENT_ID"
    echo "   Then run this script again."
    exit 1
fi

# Check if GOOGLE_CLIENT_ID is set
if ! grep -q "GOOGLE_CLIENT_ID=.*[^=]" "$SCRIPT_DIR/.env"; then
    echo "❌ Error: GOOGLE_CLIENT_ID not set in server/.env"
    echo "   Please edit server/.env and add your Google Client ID"
    exit 1
fi

echo "✓ Configuration validated"
echo ""

# 1. Create directory on remote server
echo "1. Creating remote directory..."
ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"

# 2. Copy files to remote server
echo "2. Copying files..."
scp $KEY_PATH \
    "$SCRIPT_DIR/app.py" \
    "$SCRIPT_DIR/auth_middleware.py" \
    "$SCRIPT_DIR/Dockerfile" \
    "$SCRIPT_DIR/requirements.txt" \
    "$SCRIPT_DIR/.env" \
    $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

# 3. Build and Restart Docker on remote server
echo "3. Building and restarting server..."
ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST <<'EOF'
    cd ~/notula-server
    
    echo "   - Building Docker image..."
    sudo docker build -t notula-server .
    
    echo "   - Stopping old container..."
    sudo docker stop notula-app 2>/dev/null || true
    sudo docker rm notula-app 2>/dev/null || true
    
    echo "   - Starting new container..."
    sudo docker run -d \
        --name notula-app \
        --restart unless-stopped \
        -p 8000:8000 \
        -e WHISPER_MODEL=tiny.en \
        --env-file .env \
        notula-server
    
    echo "   - Cleaning up old images..."
    sudo docker image prune -f
    
    echo ""
    echo "   - Checking container status..."
    sleep 2
    sudo docker ps | grep notula-app
    
    echo ""
    echo "   - Checking logs..."
    sudo docker logs --tail 20 notula-app
EOF

echo ""
echo "================================================"
echo "  ✅ Deployment Complete!"
echo "================================================"
echo ""
echo "Server is running at: http://$REMOTE_HOST:8000"
echo ""
echo "To check logs:"
echo "  ./check-logs.sh"
echo ""
echo "To view live logs:"
echo "  ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST 'sudo docker logs -f notula-app'"
echo ""
