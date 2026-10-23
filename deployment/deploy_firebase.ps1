<#
.SYNOPSIS
  Automated Firebase Hosting Deployment Script for ForecastAI (Windows PowerShell)
.EXAMPLE
  .\deploy_firebase.ps1 -ProjectId "your-firebase-project-id"
#>
param (
  [Parameter(Mandatory = $false)]
  [string]$ProjectId = $env:FIREBASE_PROJECT_ID
)

if (-not $ProjectId) {
  Write-Host "❌ Error: Firebase Project ID is required." -ForegroundColor Red
  Write-Host "Usage: .\deploy_firebase.ps1 -ProjectId 'your-firebase-project-id'"
  exit 1
}

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host " Deploying ForecastAI Frontend to Firebase Hosting" -ForegroundColor Cyan
Write-Host " Project: $ProjectId" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan

$rootDir = Join-Path $PSScriptRoot ".."
Push-Location $rootDir
try {
  # Verify Firebase CLI
  if (-not (Get-Command "firebase" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: firebase CLI not found. Install via 'npm install -g firebase-tools'." -ForegroundColor Red
    exit 1
  }

  firebase use $ProjectId
  firebase deploy --only hosting

  Write-Host "===============================================================" -ForegroundColor Green
  Write-Host "✅ Frontend successfully deployed to Firebase Hosting!" -ForegroundColor Green
  Write-Host "   App URL: https://${ProjectId}.web.app" -ForegroundColor Green
  Write-Host "===============================================================" -ForegroundColor Green
} finally {
  Pop-Location
}
