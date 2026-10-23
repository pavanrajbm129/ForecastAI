# Google Cloud Firestore Setup & Data Migration Guide

This guide details the creation of the Firestore database and execution of the non-destructive, idempotent migration script to transition from local `data.json` to Firestore.

---

## 1. Create Firestore Database in Google Cloud

By default, new GCP projects require enabling Firestore in **Native mode**:

```bash
gcloud firestore databases create \
    --project=YOUR_PROJECT_ID \
    --location=asia-south1 \
    --type=firestore-native
```

Verify database creation:
```bash
gcloud firestore databases list --project=YOUR_PROJECT_ID
```

---

## 2. Execute Idempotent Migration Utility

The migration utility [`backend/migrate_to_firestore.js`](../backend/migrate_to_firestore.js) safely copies all records from `data.json` and `audit.json` to Firestore without altering or deleting the local files.

### Step A: Dry-Run Validation (No writes)
Verify all schemas, counts, and record structures:
```bash
cd backend
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID node migrate_to_firestore.js --dry-run
```

Expected dry-run output:
```
===============================================================
 ForecastAI Firestore Migration Utility
 Mode: DRY-RUN (Validation only, no writes)
 Target Project: YOUR_PROJECT_ID
===============================================================

Source Data Summary:
--------------------
  • users                   :     4 record(s)
  • datasets                :     4 record(s)
  • scenarios               :     0 record(s)
  • actions                 :     9 record(s)
  • suppliers               :     3 record(s)
  • purchaseRequests        :     5 record(s)
  • purchaseOrders          :     4 record(s)
  • goodsReceipts           :     1 record(s)
  • inventoryTransactions   :     0 record(s)
  • otps                    :     8 record(s)
  • audits                  :    64 record(s)
  • Total Source Records    :   102

✅ DRY-RUN completed successfully. All source records are valid and ready for migration.
```

### Step B: Live Migration
Execute live write to Firestore using your authenticated Google credentials:
```bash
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID node migrate_to_firestore.js
```

The script performs chunked batch writes (up to 400 documents per batch) with merge mode, making repeated runs completely idempotent.

---

## 3. Recommended Firestore Composite Indexes

For high-volume production deployments with thousands of products and audit logs, create the following single-field and composite indexes via `gcloud`:

```bash
# Index for ordering audit entries chronologically
gcloud firestore indexes composite create \
    --collection-group=audits \
    --field-config field-path=timestamp,order=descending

# Index for querying user datasets by last update
gcloud firestore indexes composite create \
    --collection-group=datasets \
    --field-config field-path=userId,order=ascending \
    --field-config field-path=updatedAt,order=descending

# Index for purchase orders by status and date
gcloud firestore indexes composite create \
    --collection-group=purchaseOrders \
    --field-config field-path=status,order=ascending \
    --field-config field-path=orderDate,order=descending
```

---

## 4. Firestore Security Rules

Ensure your Firestore rules restrict direct client-side database access, permitting only the authenticated backend Cloud Run service account to read and write:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Disallow direct browser client reads/writes
    // All data flows through the ForecastAI Cloud Run backend API
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
Deploy the security rules:
```bash
firebase deploy --only firestore:rules
```
