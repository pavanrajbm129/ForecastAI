# Troubleshooting & Operational Runbook — ForecastAI

This guide provides diagnostic procedures and resolutions for common build, runtime, CORS, database, and machine learning issues.

---

## 1. Cloud Run Container Startup Failures

### Symptom: Container failed to start and listen on the port within the timeout
- **Diagnosis:**
  View the real-time Cloud Run container logs:
  ```bash
  gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=forecastai-backend" --limit 30 --format "value(textPayload)"
  ```
- **Common Root Causes & Fixes:**
  1. **Port binding issue:** Node.js must listen on `0.0.0.0` and respect `process.env.PORT`. Verify [`backend/server.js`](../backend/server.js) uses `app.listen(PORT, '0.0.0.0', ...)`.
  2. **Missing `JWT_SECRET` in production:** In production mode (`NODE_ENV=production`), `server.js` refuses to start without `JWT_SECRET`. Ensure the secret is bound via `--set-secrets`.
  3. **Python runtime missing:** Ensure `backend/Dockerfile` installed `python3`, `python3-pip`, and `python3-venv` and set `PYTHON_EXECUTABLE="/opt/venv/bin/python3"`.

---

## 2. Machine Learning Pipeline Failures

### Symptom: "Model training failed" or "Memory limit exceeded"
- **Diagnosis:**
  Cloud Run defaults to 512MiB RAM if not configured, which can be exhausted during Random Forest training on large CSV datasets.
- **Fix:**
  Increase Cloud Run memory to 1GiB or 2GiB:
  ```bash
  gcloud run services update forecastai-backend \
      --region=asia-south1 \
      --memory 2Gi \
      --cpu 2
  ```

### Symptom: "The selected dataset contains no valid data rows"
- **Diagnosis:**
  The uploaded CSV uses non-standard column headers (e.g., `ITEM_NAME`, `QTY`).
- **Fix:**
  ForecastAI's [`backend/routes/intelligence.js`](../backend/routes/intelligence.js) and [`backend/rf_model.py`](../backend/rf_model.py) include automated column alias normalization:
  - Product: `product`, `product_name`, `item`, `sku`, `title`
  - Demand/Sales: `sales`, `demand`, `quantity`, `units_sold`, `qty`
  - Price: `price`, `unit_price`, `cost`
  - Month: `month`, `date`, `period`
  Verify that the uploaded CSV contains at least 3 monthly observations per product.

---

## 3. CORS & Cross-Origin Failures

### Symptom: "Access to fetch at ... has been blocked by CORS policy"
- **Diagnosis:**
  The frontend origin is not in the backend's allowed list.
- **Fix:**
  1. When using Firebase Hosting, the recommended setup is the rewrite rule in `firebase.json` (`/api/**` -> Cloud Run). This serves frontend and backend from the **exact same domain**, bypassing CORS completely.
  2. If calling Cloud Run directly from a custom domain, update `ALLOWED_ORIGINS` in Cloud Run:
     ```bash
     gcloud run services update forecastai-backend \
         --region=asia-south1 \
         --update-env-vars ALLOWED_ORIGINS="https://your-domain.com,https://your-project.web.app"
     ```

---

## 4. Firestore Permission Errors

### Symptom: `Error: 7 PERMISSION_DENIED: Missing or insufficient permissions`
- **Diagnosis:**
  The Cloud Run service account lacks the Firestore User role.
- **Fix:**
  Grant the `roles/datastore.user` role:
  ```bash
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
      --member="serviceAccount:forecastai-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
      --role="roles/datastore.user"
  ```
  *(Note: Cloud Run service account changes take effect within 30-60 seconds without requiring a redeployment)*

---

## 5. Localhost Fallback in Production

### Symptom: Frontend makes requests to `http://localhost:4000/api` even when deployed
- **Diagnosis:**
  Browser is using cached static scripts or `localStorage` override.
- **Fix:**
  1. In the ForecastAI web interface, navigate to **Settings** -> **API Configuration**.
  2. Click **Test Connection** with the production URL or clear browser `localStorage.removeItem('forecastai_api_url')`.
  3. Ensure [`frontend/config.js`](../frontend/config.js) is served with `Cache-Control: no-cache`.
