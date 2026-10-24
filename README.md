# ForecastAI

Smart Inventory Demand Forecasting and Decision Intelligence Platform.

ForecastAI is a full-stack application for inventory planning, demand forecasting, AI-based recommendations, and operational decision support. It combines a Node.js backend, a static frontend, and Python-based forecasting models to help teams analyze sales, inventory, and risk before placing orders.

## Overview

This project helps businesses:

- forecast product demand using historical sales data
- estimate inventory risk and stockout probability
- evaluate reorder recommendations and safety stock
- simulate what-if business scenarios
- review AI-generated decisions in an audit trail
- manage procurement and inventory workflows

## Features

- AI-powered demand forecasting with explainable outputs
- Scenario simulation for demand, inventory, price, and lead-time changes
- Inventory intelligence, stockout/overstock analysis, and action recommendations
- Machine learning model comparison and evaluation metrics
- Data quality scoring for uploaded inventory datasets
- Copilot-style natural language interaction for business queries
- Audit log for human-in-the-loop approval/rejection workflow
- User authentication with JWT and OTP support
- Admin, manager, procurement, and warehouse roles

## Tech Stack

### Frontend
- HTML, CSS, JavaScript
- Static web app served via Python HTTP server
- Responsive design for dashboard and auth pages

### Backend
- Node.js
- Express.js
- JWT authentication
- Rate limiting and CORS
- JSON-based persistence via data.json

### Forecasting Engine
- Python 3
- pandas
- numpy
- scikit-learn
- Random Forest and regression models

## Project Structure

```text
MAJOR_PROJECT/
├── README.md
├── backend/
│   ├── .env.example
│   ├── data.csv
│   ├── data.json
│   ├── db.js
│   ├── otp.js
│   ├── package.json
│   ├── rf_model.py
│   ├── seed_admin.js
│   ├── seed_demo_users.js
│   ├── server.js
│   ├── middleware/
│   ├── model_cache/
│   ├── routes/
│   └── tests / scripts (various API/model checks)
├── frontend/
│   ├── index.html
│   ├── script.js
│   ├── styles.css
│   ├── auth/
│   └── assets/
└── LICENSE (if present in your repo)
```

## Prerequisites

Before running the project, install:

- Node.js 18+
- Python 3.9+
- pip

## Installation

### 1. Install backend dependencies

```bash
cd backend
npm install
```

### 2. Install Python dependencies

```bash
python -m pip install pandas scikit-learn numpy
```

If you are on Windows and Python is installed as `py`:

```bash
py -m pip install pandas scikit-learn numpy
```

### 3. Configure environment variables

Copy the example file and set your secret values:

```bash
cd backend
copy .env.example .env
```

Then update `.env` with a valid JWT secret and optional SMTP/Twilio settings.

Example:

```env
PORT=4000
JWT_SECRET=your_long_random_secret_here
JWT_EXPIRES_IN=7d
```

## Running the Project

### Start Backend

```bash
cd backend
npm start
```

The backend runs on:

```text
http://localhost:4000
```

### Start Frontend

```bash
cd frontend
python -m http.server 3000
```

Or on Windows with `py`:

```bash
cd frontend
py -m http.server 3000
```

The frontend is available at:

```text
http://localhost:3000/auth/login.html
```

## Production API Configuration

The frontend is plain HTML, CSS, and JavaScript; it does not require a Vite build or Vite environment variables. Its shared configuration is in `frontend/config.js`:

- Localhost development uses `http://localhost:4000/api`.
- The deployed Vercel frontend uses `https://forecastai-87fx.onrender.com/api`.

Configure the Render service with the deployed frontend origin so browser API requests pass CORS checks:

```env
FRONTEND_URL=https://forecastai-frontend.vercel.app
ALLOWED_ORIGINS=https://forecastai-frontend.vercel.app
```

Additional deployed frontend origins can be included as comma-separated exact origins in `ALLOWED_ORIGINS`. Redeploy the backend after changing its CORS configuration.

## Demo Accounts

The project includes a seeded admin account for local testing.

- Email: `admin@forecastai.com`
- Password: `Admin@12345`

You can also seed demo users with:

```bash
cd backend
npm run seed-demo-users
```

## API Highlights

Key backend endpoints include:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/send-otp`
- `POST /api/auth/verify-otp`
- `POST /api/forecast`
- `POST /api/upload-forecast`
- `POST /api/data-quality`
- `GET /api/intelligence/dashboard`
- `POST /api/intelligence/copilot`

## Model and Forecasting Workflow

The system loads inventory data and uses a Python forecasting pipeline to:

- prepare feature inputs
- train and compare multiple ML models
- evaluate performance with MAE/RMSE/MAPE metrics
- generate forecast predictions with uncertainty
- recommend reorder actions based on stock risk

## Common Commands

### Seed admin account

```bash
cd backend
npm run seed-admin
```

### Run model test

```bash
cd backend
python rf_model.py "{\"sales\":7310,\"inventory\":980,\"price\":550,\"month\":6}"
```

### Development mode with nodemon

```bash
cd backend
npm run dev
```

## Troubleshooting

### Port already in use

If port 4000 or 3000 is already in use:

```bash
# Windows PowerShell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 4000,3000 }
```

Then stop the conflicting process or change the port in the environment variables.

### Python model not running

Ensure Python packages are installed and the `python` or `py` command resolves correctly:

```bash
python --version
python -m pip install pandas scikit-learn numpy
```

### JWT or auth issues

Make sure `.env` contains a valid `JWT_SECRET` and is loaded before starting the backend.

## Notes

- This project is intended for local development and demo/testing workflows.
- For production, replace the JSON storage and add secure deployment configuration.
- OTP sending may depend on external SMTP/Twilio credentials.

## License

This project is distributed under the license specified by the repository owner. If a license file is not present, treat it as a local project for educational and demo use unless otherwise stated.

## Contributing

Pull requests and improvements are welcome. If you are extending the forecasting logic, model evaluation, or procurement workflow, update the relevant backend routes and test scripts alongside your changes.
