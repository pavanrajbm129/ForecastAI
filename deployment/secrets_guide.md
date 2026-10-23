# Google Secret Manager Configuration Guide — ForecastAI

This guide details how to store, manage, and grant access to sensitive runtime secrets without storing them in Git or environment variables.

---

## 1. Secrets vs. Environment Variables

| Setting | Type | Storage Location | Example |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | **Secret** | Google Secret Manager | 64-char random hex key |
| `SMTP_PASS` | **Secret** | Google Secret Manager | Gmail App Password |
| `TWILIO_AUTH_TOKEN` | **Secret** | Google Secret Manager | Twilio token |
| `NODE_ENV` | Variable | Cloud Run Env Var | `production` |
| `PORT` | Variable | Cloud Run Automatic | `8080` |
| `PYTHON_EXECUTABLE` | Variable | Cloud Run Env Var | `/opt/venv/bin/python3` |
| `DATABASE_TYPE` | Variable | Cloud Run Env Var | `firestore` |
| `GOOGLE_CLOUD_PROJECT` | Variable | Cloud Run Env Var | `YOUR_PROJECT_ID` |
| `ALLOWED_ORIGINS` | Variable | Cloud Run Env Var | `https://your-app.web.app` |

---

## 2. Creating Secrets in Google Secret Manager

### A. Create JWT Secret (Required)
Generate a cryptographically secure 64-character secret and store it:
```bash
# Generate secret
openssl rand -hex 32 | tr -d '\n' > /tmp/jwt_secret.txt

# Create secret in Secret Manager
gcloud secrets create forecastai_jwt_secret \
    --data-file=/tmp/jwt_secret.txt \
    --replication-policy="automatic"

# Remove local temp file
rm /tmp/jwt_secret.txt
```

### B. Create Email / SMTP Password (Optional)
If email OTP verification is required:
```bash
echo -n "your-16-char-gmail-app-password" | gcloud secrets create forecastai_smtp_pass \
    --data-file=- \
    --replication-policy="automatic"
```

### C. Create Twilio Auth Token (Optional)
If SMS OTP verification is required:
```bash
echo -n "your-twilio-auth-token" | gcloud secrets create forecastai_twilio_token \
    --data-file=- \
    --replication-policy="automatic"
```

---

## 3. Grant Service Account Permission to Read Secrets

The Cloud Run runtime service account (`forecastai-runner`) must have the `secretmanager.secretAccessor` role:

```bash
gcloud secrets add-iam-policy-binding forecastai_jwt_secret \
    --member="serviceAccount:forecastai-runner@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

---

## 4. Bind Secrets to Cloud Run

Update the Cloud Run service to map the secret into the container environment:

```bash
gcloud run services update forecastai-backend \
    --region=asia-south1 \
    --set-secrets JWT_SECRET=forecastai_jwt_secret:latest
```

Cloud Run securely mounts the secret into `process.env.JWT_SECRET` at container startup without writing it to disk or displaying it in the console.
