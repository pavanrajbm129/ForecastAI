# Google Cloud Run Deployment Guide — ForecastAI Backend

This guide outlines the complete, tested procedure for deploying the ForecastAI backend service to **Google Cloud Run**.

---

## 1. Prerequisites & Required Tools

Install the Google Cloud CLI (`gcloud`) if not already present on your workstation:
- **Windows:** Download and install from [Google Cloud SDK](https://cloud.google.com/sdk/docs/install#windows)
- **Linux:** `sudo apt-get install google-cloud-cli`
- **macOS:** `brew install google-cloud-sdk`

Verify installation:
```bash
gcloud --version
```

---

## 2. Authentication & Project Selection

Log in to Google Cloud:
```bash
gcloud auth login
gcloud auth application-default login
```

Set your active Google Cloud Project ID:
```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="asia-south1"

gcloud config set project $PROJECT_ID
```

*(On Windows PowerShell, use `$env:PROJECT_ID="YOUR_PROJECT_ID"` and `$env:REGION="asia-south1"`)*

---

## 3. Enable Required Google Cloud APIs

Enable only the services required by ForecastAI (least privilege):
```bash
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    firestore.googleapis.com \
    storage.googleapis.com \
    secretmanager.googleapis.com \
    artifactregistry.googleapis.com
```

---

## 4. Create Service Identity (Least Privilege)

Create a dedicated runtime service account for the ForecastAI backend:
```bash
gcloud iam service-accounts create forecastai-runner \
    --description="Runtime service account for ForecastAI Cloud Run" \
    --display-name="ForecastAI Runner"
```

Grant least-privilege roles to the service account:
```bash
# Firestore access
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:forecastai-runner@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/datastore.user"

# Cloud Storage access (for dataset uploads)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:forecastai-runner@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.objectUser"

# Secret Manager secret accessor
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:forecastai-runner@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

---

## 5. Build Container via Google Cloud Build

Since Docker is not required locally when using Cloud Build:
```bash
cd backend
gcloud builds submit --tag gcr.io/${PROJECT_ID}/forecastai-backend:v2.0 .
```

*Cloud Build automatically uploads the context, reads `backend/Dockerfile`, builds the multi-runtime container, runs tests, and stores the image in Container Registry / Artifact Registry.*

---

## 6. Deploy to Google Cloud Run

Deploy the container with secure production parameters:
```bash
gcloud run deploy forecastai-backend \
    --image gcr.io/${PROJECT_ID}/forecastai-backend:v2.0 \
    --platform managed \
    --region $REGION \
    --service-account forecastai-runner@${PROJECT_ID}.iam.gserviceaccount.com \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --timeout 60s \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars NODE_ENV=production,DATABASE_TYPE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PYTHON_EXECUTABLE=/opt/venv/bin/python3 \
    --set-secrets JWT_SECRET=forecastai_jwt_secret:latest
```

### Explanations of Flags:
- `--memory 1Gi`: Allocates sufficient RAM for scikit-learn model training and Pandas DataFrame operations.
- `--min-instances 0`: Scales to zero when no requests are active to eliminate idle costs.
- `--allow-unauthenticated`: Enables public ingress to the `/api` HTTP endpoints. Security and authorization are enforced by application-level JWT middleware (`middleware/auth.js`) on protected routes.
- `--set-secrets`: Securely injects `JWT_SECRET` from Google Secret Manager directly into the process environment without exposing it in source code or deployment scripts.

---

## 7. Verify Cloud Run Service

Capture the deployed service URL:
```bash
export SERVICE_URL=$(gcloud run services describe forecastai-backend --platform managed --region $REGION --format 'value(status.url)')
echo "Cloud Run Service URL: $SERVICE_URL"
```

Verify service readiness and health endpoint:
```bash
curl -s "${SERVICE_URL}/api/health"
```

Expected JSON response:
```json
{
  "status": "ok",
  "version": "2.0.0",
  "service": "ForecastAI Decision Intelligence Platform",
  "environment": "production",
  "database": {
    "status": "ok",
    "adapter": "firestore"
  },
  "python": {
    "executable": "/opt/venv/bin/python3"
  }
}
```
