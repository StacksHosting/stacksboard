#!/bin/bash
# deploy.sh - Run this after git pull to deploy changes

set -e

REPO_DIR="/persist/repo"
APP_DIR="/persist/app"
NGINX_CONF="/etc/nginx/sites-enabled/default"

echo "📦 Deploying StacksBoard..."

# Copy frontend files
cp -r $REPO_DIR/frontend/* $APP_DIR/

# Update nginx config if changed
if [ -f "$REPO_DIR/nginx.conf" ]; then
    cp $REPO_DIR/nginx.conf $NGINX_CONF
    nginx -t && nginx -s reload
    echo "✅ Nginx config updated and reloaded"
fi

echo "✅ Deployment complete!"
