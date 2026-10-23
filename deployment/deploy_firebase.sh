#!/usr/bin/env bash
# ==============================================================================
# deploy_firebase.sh — Automated Firebase Hosting Deployment Script
# ==============================================================================
set -e

PROJECT_ID="${1:-$FIREBASE_PROJECT_ID}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: Firebase Project ID is required."
  echo "Usage: ./deploy_firebase.sh <PROJECT_ID>"
  exit 1
fi

echo "==============================================================="
echo " Deploying ForecastAI Frontend to Firebase Hosting"
echo " Project: $PROJECT_ID"
echo "==============================================================="

cd "$(dirname "$0")/.."

# Verify Firebase CLI
if ! command -v firebase &> /dev/null; then
  echo "❌ Error: firebase CLI not found. Install via 'npm install -g firebase-tools'."
  exit 1
fi

# Set Firebase Project
firebase use "$PROJECT_ID"

# Deploy Hosting
firebase deploy --only hosting

echo "==============================================================="
echo "✅ Frontend successfully deployed to Firebase Hosting!"
echo "   App URL: https://${PROJECT_ID}.web.app"
echo "==============================================================="
