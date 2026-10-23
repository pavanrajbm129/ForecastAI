#!/usr/bin/env bash
# ==============================================================================
# deploy_cloud_run.sh — Automated Google Cloud Run Deployment Script
# ==============================================================================
set -e

PROJECT_ID="${1:-$GOOGLE_CLOUD_PROJECT}"
REGION="${2:-asia-south1}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: Google Cloud Project ID is required."
  echo "Usage: ./deploy_cloud_run.sh <PROJECT_ID> [REGION]"
  exit 1
fi

echo "==============================================================="
echo " Deploying ForecastAI Backend to Google Cloud Run"
echo " Project: $PROJECT_ID | Region: $REGION"
echo "==============================================================="

# 1. Enable Required Services
echo "==> Enabling Google Cloud APIs..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    firestore.googleapis.com \
    storage.googleapis.com \
    secretmanager.googleapis.com \
    --project="$PROJECT_ID"

# 2. Build Container Image via Cloud Build
echo "==> Building Docker image with Cloud Build..."
cd "$(dirname "$0")/../backend"
gcloud builds submit \
    --project="$PROJECT_ID" \
    --tag="gcr.io/${PROJECT_ID}/forecastai-backend:latest" .

# 3. Deploy to Cloud Run
echo "==> Deploying to Cloud Run..."
gcloud run deploy forecastai-backend \
    --project="$PROJECT_ID" \
    --image="gcr.io/${PROJECT_ID}/forecastai-backend:latest" \
    --platform=managed \
    --region="$REGION" \
    --allow-unauthenticated \
    --memory=1Gi \
    --cpu=1 \
    --timeout=60s \
    --min-instances=0 \
    --max-instances=10 \
    --set-env-vars="NODE_ENV=production,DATABASE_TYPE=firestore,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},PYTHON_EXECUTABLE=/opt/venv/bin/python3"

# 4. Show Deployed URL
SERVICE_URL=$(gcloud run services describe forecastai-backend --project="$PROJECT_ID" --platform=managed --region="$REGION" --format='value(status.url)')

echo "==============================================================="
echo "✅ Backend successfully deployed!"
echo "   Service URL: $SERVICE_URL"
echo "   Health Check: curl -s ${SERVICE_URL}/api/health"
echo "==============================================================="
