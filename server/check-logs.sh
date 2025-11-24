#!/bin/bash

# Script to check server logs and status on the remote server

REMOTE_USER="legion"
REMOTE_HOST="35.205.52.222"
KEY_PATH="-i ~/.ssh/gcp_key"

echo "================================================"
echo "  Checking Notula AI Server Status"
echo "================================================"
echo ""

echo "1. Checking if Docker container is running..."
ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST "sudo docker ps -a | grep notula-app"

echo ""
echo "2. Fetching last 50 lines of server logs..."
echo "================================================"
ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST "sudo docker logs --tail 50 notula-app"

echo ""
echo "================================================"
echo "  Commands to manage the server:"
echo "================================================"
echo ""
echo "View live logs:"
echo "  ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST 'sudo docker logs -f notula-app'"
echo ""
echo "Restart server:"
echo "  ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST 'sudo docker restart notula-app'"
echo ""
echo "Stop server:"
echo "  ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST 'sudo docker stop notula-app'"
echo ""
echo "Start server:"
echo "  ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST 'sudo docker start notula-app'"
echo ""
echo "Check container status:"
echo "  ssh $KEY_PATH $REMOTE_USER@$REMOTE_HOST 'sudo docker ps -a'"
echo ""
