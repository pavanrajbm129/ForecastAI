# Rollback Procedures — ForecastAI

This runbook outlines how to quickly roll back both the Cloud Run backend and Firebase Hosting frontend in the event of an unexpected regression or deployment defect.

---

## 1. Google Cloud Run Rollback (Backend)

Google Cloud Run retains an immutable record of every deployed revision. Traffic can be redirected instantly (sub-second) back to any previous healthy revision without rebuilding or redeploying containers.

### Step 1: List Available Revisions
```bash
gcloud run revisions list \
    --service=forecastai-backend \
    --region=asia-south1 \
    --format="table(name,active,creationTimestamp)"
```

Example output:
```
NAME                          ACTIVE  CREATION_TIMESTAMP
forecastai-backend-00004-abc  yes     2026-10-23T18:00:00Z
forecastai-backend-00003-xyz  no      2026-10-23T16:30:00Z
forecastai-backend-00002-def  no      2026-10-23T14:15:00Z
```

### Step 2: Route 100% Traffic to Previous Revision
To route all incoming traffic back to the previous stable revision (e.g. `forecastai-backend-00003-xyz`):
```bash
gcloud run services update-traffic forecastai-backend \
    --region=asia-south1 \
    --to-revisions=forecastai-backend-00003-xyz=100
```

### Step 3: Verify Rollback Health
```bash
curl -s "$(gcloud run services describe forecastai-backend --region=asia-south1 --format='value(status.url)')/api/health"
```

---

## 2. Firebase Hosting Rollback (Frontend)

Firebase Hosting stores previous releases in the Firebase CDN. You can roll back the static frontend with a single command:

### Option A: Via Firebase Console (Zero CLI)
1. Go to [Firebase Console](https://console.firebase.google.com/) -> Select your project.
2. Click **Hosting** in the left sidebar.
3. In the **Release History** table, find the previous stable release.
4. Click the three dots (`⋮`) on the right side of the release row and select **Rollback**.
5. The CDN immediately invalidates its cache and begins serving the previous release globally.

### Option B: Via Firebase CLI
If you prefer redeploying a clean state:
```bash
# Checkout the stable commit or main branch
git checkout main

# Re-deploy hosting
firebase deploy --only hosting
```

---

## 3. Database Data Rollback

Because the Firestore migration utility [`backend/migrate_to_firestore.js`](../backend/migrate_to_firestore.js) is **strictly non-destructive**, the original JSON file database [`backend/data.json`](../backend/data.json) was never overwritten or deleted.
- If you need to switch the backend service back to file-based mode immediately:
  ```bash
  gcloud run services update forecastai-backend \
      --region=asia-south1 \
      --update-env-vars DATABASE_TYPE=file
  ```
- The service will immediately resume reading and writing to its container `data.json`.
