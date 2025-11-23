#!/bin/bash

# --- Configuration ---
# REPLACE 'your-username' with your actual SSH username for the server
REMOTE_USER="legion" 
REMOTE_HOST="35.205.52.222"
REMOTE_DIR="~/notula-server"
KEY_PATH="-i ~/.ssh/gcp_key" # Optional: Path to your private key if not in default location, e.g., "-i ~/.ssh/google_compute_engine"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if username is set
if [ "$REMOTE_USER" == "your-username" ]; then
    echo "Error: Please edit this script and set REMOTE_USER to your server username."
    exit 1
fi

echo "Deploying to $REMOTE_USER@$REMOTE_HOST..."

# 1. Create directory on remote server
echo "Creating remote directory..."
ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"

# 2. Copy files to remote server
echo "Copying files..."
scp $KEY_PATH "$SCRIPT_DIR/app.py" "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR/requirements.txt" $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

# 3. Build and Restart Docker on remote server
echo "Building and restarting server..."
ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST << EOF
    cd $REMOTE_DIR
    
    # Build new image
    sudo docker build -t notula-server .
    
    # Stop and remove old container
    sudo docker stop notula-app || true
    sudo docker rm notula-app || true
    
    # Run new container
    sudo docker run -d \
        --name notula-app \
        --restart unless-stopped \
        -p 8000:8000 \
        -e WHISPER_MODEL=base \
        notula-server
        
    # Clean up unused images to save space
    sudo docker image prune -f
EOF

echo "✅ Deployment Complete!"
