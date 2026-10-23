# ForecastAI — Google Cloud Run & Firebase Hosting Deployment Architecture

This directory contains the complete deployment specification, migration utilities, and automated scripts to deploy **ForecastAI — Explainable AI Decision Intelligence Platform** to **Google Cloud Run** (Backend ML Service) and **Firebase Hosting** (Static Frontend SPA).

---

## 1. System Architecture

```
                       ┌───────────────────────────────┐
                       │           End User            │
                       │   (Browser / Mobile Web)      │
                       └──────────────┬────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │                                                   │
  Static Assets (HTML/CSS/JS)                        API Requests (/api/*)
            │                                                   │
            ▼                                                   ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│       Firebase Hosting        │               │       Firebase Hosting        │
│   (Global Edge CDN Cache)     │               │   (Cloud Run URL Rewrite)     │
│   https://<project>.web.app   │               │   Rewrites: /api/** -> Run    │
└───────────────────────────────┘               └───────────────┬───────────────┘
                                                                │
                                                                ▼
                                                ┌───────────────────────────────┐
                                                │       Google Cloud Run        │
                                                │   Container: forecastai-backend
                                                │   Runtime: Node.js 20 + Py 3.11
                                                │   Region: asia-south1         │
                                                └───────┬───────────────┬───────┘
                                                        │               │
                            ┌───────────────────────────┴────┐          │
                            ▼                                ▼          ▼
            ┌───────────────────────────────┐  ┌───────────────────────────────┐
            │     Google Cloud Firestore    │  │     Google Cloud Storage      │
            │   (Serverless NoSQL Database) │  │   (Dataset & Model Artifacts) │
            │   Collections: users, audits, │  │   Bucket: forecastai-datasets │
            │   datasets, purchaseOrders    │  │   Tenant-isolated paths       │
            └───────────────────────────────┘  └───────────────────────────────┘
                            ▲
                            │
            ┌───────────────┴───────────────┐
            │     Google Secret Manager     │
            │   JWT_SECRET, SMTP_PASS, etc. │
            └───────────────────────────────┘
```

---

## 2. Component Design & Justifications

### A. Compute: Google Cloud Run
- **Why Cloud Run?**
  ForecastAI runs a hybrid Node.js API server combined with a Python scikit-learn machine learning engine. Cloud Run allows packaging both runtimes into a single lightweight Debian container (`node:20-bookworm-slim`), scales to zero when idle (minimizing cost), automatically handles HTTPS, and scales up seamlessly during demand spikes.
- **Port & Host:** Listens on `0.0.0.0` and respects `$PORT` (default `8080`).
- **Region:** `asia-south1` (Mumbai) for ultra-low latency in India, or configurable per requirements.

### B. Database: Google Cloud Firestore (Native Mode)
- **Why Firestore over Cloud SQL?**
  1. The application data model (`users`, `datasets`, `actions`, `scenarios`, `suppliers`, `purchaseOrders`, `goodsReceipts`, `inventoryTransactions`, `otps`, `audits`) is already document-oriented, matching Firestore collections 1:1.
  2. Cloud SQL requires minimum monthly compute costs (~$15–$30/mo) and persistent connection management. Firestore is serverless, auto-scaling, offers a generous free tier (50K reads, 20K writes/day), and integrates natively with Cloud Run Application Default Credentials (ADC).
  3. No database proxy or IP whitelisting is required.

### C. Persistent File & Dataset Storage: Google Cloud Storage
- User-uploaded CSV datasets and machine learning caches are persisted to Cloud Storage buckets with tenant isolation:
  `gs://<bucket-name>/<userId>/<datasetId>/<filename>.csv`
- Temporary parsing and inference files are created in `/tmp` (`os.tmpdir()`) and unlinked upon completion.

### D. Frontend: Firebase Hosting
- Fast, global SSD CDN with zero server management.
- Configured with Cloud Run rewrites: All `/api/**` requests are routed internally to the Cloud Run service. This eliminates cross-origin preflight requests (CORS) entirely in production.

---

## 3. Deployment Documentation Index

| Guide | Description |
| :--- | :--- |
| [`cloud_run_guide.md`](./cloud_run_guide.md) | Step-by-step commands to build and deploy the backend container to Cloud Run. |
| [`firebase_guide.md`](./firebase_guide.md) | Initializing and deploying the frontend to Firebase Hosting with rewrites. |
| [`firestore_setup.md`](./firestore_setup.md) | Creating Firestore database, indexes, and running the idempotent migration script. |
| [`secrets_guide.md`](./secrets_guide.md) | Managing secrets in Google Secret Manager and granting Cloud Run service account access. |
| [`troubleshooting.md`](./troubleshooting.md) | Diagnosing common build, CORS, ML, container memory, and database errors. |
| [`rollback.md`](./rollback.md) | Instant revision rollback procedure for Cloud Run and Firebase Hosting. |
| [`deploy_cloud_run.sh`](./deploy_cloud_run.sh) / [`.ps1`](./deploy_cloud_run.ps1) | One-command deployment script for the backend. |
| [`deploy_firebase.sh`](./deploy_firebase.sh) / [`.ps1`](./deploy_firebase.ps1) | One-command deployment script for the frontend. |
