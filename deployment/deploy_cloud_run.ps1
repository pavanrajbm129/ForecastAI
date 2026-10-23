<#
.SYNOPSIS
  Automated Google Cloud Run Deployment Script for ForecastAI (Windows PowerShell)
.EXAMPLE
  .\deploy_cloud_run.ps1 -ProjectId "your-project-id" -Region "asia-south1"
#>
param (
  [Parameter(Mandatory = $false)]
  [string]$ProjectId = $env:GOOGLE_CLOUD_PROJECT,

  [Parameter(Mandatory = $false)]
  [string]$Region = "asia-south1"
)

if (-not $ProjectId) {
  Write-Host "❌ Error: Google Cloud Project ID is required." -ForegroundColor Red
  Write-Host "Usage: .\deploy_cloud_run.ps1 -ProjectId 'your-project-id' [-Region 'asia-south1']"
  exit 1
}

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host " Deploying ForecastAI Backend to Google Cloud Run" -ForegroundColor Cyan
Write-Host " Project: $ProjectId | Region: $Region" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan

# 1. Enable APIs
Write-Host "==> Enabling Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com --project=$ProjectId

# 2. Build Image
Write-Host "==> Building Docker image with Cloud Build..." -ForegroundColor Yellow
$backendDir = Join-Path $PSScriptRoot "..\backend"
Push-Location $backendDir
try {
  gcloud builds submit --project=$ProjectId --tag="gcr.io/${ProjectId}/forecastai-backend:latest" .
} finally {
  Pop-Location
}

# 3. Deploy Cloud Run
Write-Host "==> Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy forecastai-backend `
  --project=$ProjectId `
  --image="gcr.io/${ProjectId}/forecastai-backend:latest" `
  --platform=managed `
  --region=$Region `
  --allow-unauthenticated `
  --memory=1Gi `
  --cpu=1 `
  --timeout=60s `
  --min-instances=0 `
  --max-instances=10 `
  --set-env-vars="NODE_ENV=production,DATABASE_TYPE=firestore,GOOGLE_CLOUD_PROJECT=${ProjectId},PYTHON_EXECUTABLE=/opt/venv/bin/python3"

# 4. Service URL
$serviceUrl = (gcloud run services describe forecastai-backend --project=$ProjectId --platform=managed --region=$Region --format='value(status.url)').Trim()

Write-Host "===============================================================" -ForegroundColor Green
Write-Host "✅ Backend successfully deployed!" -ForegroundColor Green
Write-Host "   Service URL: $serviceUrl" -ForegroundColor Green
Write-Host "   Health Check: curl -s $serviceUrl/api/health" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
