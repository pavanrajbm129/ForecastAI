# Firebase Hosting Deployment Guide — ForecastAI Frontend

This guide describes how to configure and deploy the static ForecastAI frontend to **Firebase Hosting** with Cloud Run URL routing.

---

## 1. Prerequisites

Install the Firebase CLI:
```bash
npm install -g firebase-tools
```

Verify installation:
```bash
firebase --version
```

---

## 2. Authentication & Project Initialization

Log in to Firebase with your Google account:
```bash
firebase login
```

Associate your workspace with your Firebase project:
```bash
firebase use --add YOUR_PROJECT_ID
```
*(Select an alias, e.g., `production` or `default`)*

---

## 3. Review Configuration

Ensure `firebase.json` at the root contains the correct public folder (`frontend`) and Cloud Run rewrite rule:
```json
{
  "hosting": {
    "public": "frontend",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "forecastai-backend",
          "region": "asia-south1"
        }
      }
    ],
    "headers": [
      {
        "source": "**/*.@(css|js)",
        "headers": [
          { "key": "Cache-Control", "value": "max-age=86400" }
        ]
      },
      {
        "source": "**/config.js",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
        ]
      }
    ]
  }
}
```

### Why Cloud Run Rewrites Matter:
When Firebase Hosting rewrites `/api/**` directly to the `forecastai-backend` Cloud Run service, all API requests are executed **on the same origin**:
`https://your-project.web.app/api/forecast` -> Cloud Run container.
- No CORS configuration needed.
- No cross-origin preflight `OPTIONS` overhead.
- SSL handled by Firebase automatically.

---

## 4. Deploy to Firebase Hosting

Run the deployment command:
```bash
firebase deploy --only hosting
```

Output will display the live hosting URL:
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/YOUR_PROJECT_ID/overview
Hosting URL: https://YOUR_PROJECT_ID.web.app
```

---

## 5. End-to-End Testing

Open `https://YOUR_PROJECT_ID.web.app` in your browser:
1. Verify static asset delivery (styles, animations, branding images load with HTTP 200).
2. Test authentication: Log in as admin (`admin@forecastai.internal` / password).
3. Test dataset upload: Upload a CSV file and observe the dropdown update without reload.
4. Click **Start Forecast**: Verify that the Cloud Run service processes the input and renders the interactive prediction chart with confidence intervals.
