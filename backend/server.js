/**
 * server.js — ForecastAI Backend
 * ================================
 * Express server: auth, forecast, intelligence, scenario, copilot, audit
 */
'use strict';

require('dotenv').config();
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const fs = require('fs');
const db = require('./db');

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable must be configured in production.');
    process.exit(1);
  } else {
    console.warn('⚠️ WARNING: JWT_SECRET is not configured in .env. A fallback development secret is being used.');
    process.env.JWT_SECRET = 'forecastai_dev_fallback_secret_key_8492048192837491823749182';
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

/* ── CORS ─────────────────────────────────────────────────────────────────── */
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    if (origin === 'null') return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

/* ── Rate limiters ────────────────────────────────────────────────────────── */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { error: 'Too many OTP requests. Please wait 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { error: 'Too many verification attempts. Please wait.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 600,
  message: { error: 'Too many requests. Please slow down.' },
});

/* ── Routes ───────────────────────────────────────────────────────────────── */
const authRouter = require('./routes/auth');
const intelligenceRouter = require('./routes/intelligence');
const adminRouter = require('./routes/admin');
const procurementRouter = require('./routes/procurement');
const { requireAuth, authorize } = require('./middleware/auth');

app.use('/api/auth/send-otp', otpLimiter);
app.use('/api/auth/resend-otp', otpLimiter);
app.use('/api/auth/signup', otpLimiter);
app.use('/api/auth/verify-otp', verifyLimiter);
app.use('/api/auth/login', verifyLimiter);
app.use('/api/intelligence', apiLimiter);

app.use('/api/auth', authRouter);
app.use('/api/intelligence', intelligenceRouter);
app.use('/api/admin', adminRouter);
app.use('/api/procurement', requireAuth, procurementRouter);

/* ── Health ───────────────────────────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '2.0.0' });
});

/* ── Python runner helper ─────────────────────────────────────────────────── */
function runPython(inputObj, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile('py', [path.join(__dirname, 'rf_model.py'), JSON.stringify(inputObj)],
      { cwd: __dirname, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message));
        try {
          const result = JSON.parse(stdout.trim());
          if (result.error) return reject(new Error(result.error));
          resolve(result);
        } catch (e) {
          reject(new Error(`Model parse error: ${stdout.slice(0, 200)}`));
        }
      }
    );
  });
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  const findVal = (keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
      const match = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
      if (match && row[match] !== undefined && row[match] !== null && row[match] !== '') return row[match];
    }
    return undefined;
  };

  const productRaw = findVal(['product', 'product_name', 'product_title', 'item', 'item_name', 'sku', 'product_id', 'name']);
  const product = String(productRaw || 'product').trim();

  let month = findVal(['month', 'period_month', 'month_number']);
  let date = findVal(['date', 'timestamp', 'period', 'order_date', 'datetime']);
  let year = findVal(['year']);

  if (month !== undefined) {
    month = Number(month);
    if (!Number.isFinite(month) || month < 1 || month > 12) month = 1;
  } else if (date) {
    const parsedDate = new Date(date);
    if (!Number.isNaN(parsedDate.getTime())) {
      month = parsedDate.getMonth() + 1;
      year = parsedDate.getFullYear();
      date = parsedDate.toISOString().slice(0, 10);
    } else {
      month = 1;
    }
  } else {
    month = 1;
  }

  const salesVal = findVal(['sales', 'units_sold', 'sales_volume', 'quantity', 'qty']);
  const demandVal = findVal(['demand', 'actual_demand', 'actual', 'order_demand', 'quantity_demanded']);
  const inventoryVal = findVal(['inventory', 'stock', 'stock_level', 'current_inventory', 'inventory_level', 'on_hand']);
  const priceVal = findVal(['price', 'unit_price', 'selling_price', 'retail_price']);
  const leadTimeVal = findVal(['lead_time', 'lead_time_days', 'leadtime', 'supplier_lead_time']);
  const costVal = findVal(['cost_per_unit', 'unit_cost', 'cost']);

  const sales = Number(salesVal ?? demandVal ?? 0);
  const demand = Number(demandVal ?? salesVal ?? sales);
  const inventory = Number(inventoryVal ?? 0);
  const price = Number(priceVal ?? 0);
  const lead_time = Number.isFinite(Number(leadTimeVal)) ? Number(leadTimeVal) : 7;
  const cost_per_unit = Number.isFinite(Number(costVal)) ? Number(costVal) : null;
  const category = String(findVal(['category', 'product_category', 'type', 'segment']) || 'Uncategorized').trim();

  return {
    ...row,
    product,
    product_name: product,
    category,
    month,
    year: Number.isFinite(Number(year)) ? Number(year) : undefined,
    date: date ? String(date) : undefined,
    sales: Number.isFinite(sales) ? sales : 0,
    demand: Number.isFinite(demand) ? demand : 0,
    inventory: Number.isFinite(inventory) ? inventory : 0,
    price: Number.isFinite(price) ? price : 0,
    lead_time: Number.isFinite(lead_time) ? lead_time : 7,
    cost_per_unit,
  };
}

function runPythonForUser(inputObj, userId, timeoutMs = 30000, datasetId) {
  const preferences = db.getUserPreferences(userId);
  const activeId = datasetId || preferences.activeDatasetId;
  if (!activeId || activeId === 'default') return runPython(inputObj, timeoutMs);

  const datasets = db.listDatasets(userId);
  const dataset = datasets.find(item => item.id === activeId);
  if (!dataset) {
    if (datasetId && datasetId !== 'default') {
      return Promise.reject(new Error(`Selected dataset ${datasetId} was not found or is inaccessible.`));
    }
    return runPython(inputObj, timeoutMs);
  }

  const normRows = (dataset.rows || []).map(normalizeRow).filter(Boolean);
  if (!normRows.length) {
    return Promise.reject(new Error('The selected dataset contains no valid data rows.'));
  }

  const canonicalHeaders = ['product', 'sales', 'inventory', 'price', 'month', 'demand', 'lead_time'];
  const tempPath = path.join(__dirname, `_user_${Date.now()}_${Math.random().toString(16).slice(2)}.csv`);
  const csvValue = value => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  fs.writeFileSync(
    tempPath,
    [canonicalHeaders.join(','), ...normRows.map(row => canonicalHeaders.map(h => csvValue(row[h])).join(','))].join('\n'),
    'utf8'
  );
  return runPython({ ...inputObj, csv_path: tempPath }, timeoutMs).finally(() => {
    try { fs.unlinkSync(tempPath); } catch (_) { }
  });
}

/* ── POST /api/forecast ───────────────────────────────────────────────────── */
app.post('/api/forecast', requireAuth, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  const { sales, inventory, price, month, lead_time, mode, datasetId, model } = req.body;
  if (sales === undefined || inventory === undefined || price === undefined || month === undefined) {
    return res.status(400).json({ error: 'sales, inventory, price, and month are required.' });
  }
  try {
    const result = await runPythonForUser({
      mode: mode || 'forecast',
      sales: Number(sales),
      inventory: Number(inventory),
      price: Number(price),
      month: Number(month),
      lead_time: Number(lead_time || 7),
      model: db.getUserPreferences(req.user.id).activeModel || 'Random Forest',
    }, req.user.id, 30000, datasetId);
    res.json(result);
  } catch (err) {
    console.error('[forecast]', err.message);
    res.status(422).json({ success: false, error: { code: 'MODEL_TRAINING_FAILED', message: err.message || 'The forecast model could not process this input.' } });
  }
});

/* ── POST /api/upload-forecast ────────────────────────────────────────────── */
app.post('/api/upload-forecast', requireAuth, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  let { rows, datasetId } = req.body;
  if (datasetId && (!rows || !rows.length)) {
    const dataset = db.findDataset(datasetId, req.user.id);
    if (!dataset) return res.status(404).json({ error: 'Dataset not found.' });
    rows = dataset.rows;
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No dataset rows provided.' });
  }

  const normalizedRows = rows.map(normalizeRow).filter(Boolean);
  if (normalizedRows.length === 0) {
    return res.status(400).json({ error: 'Dataset rows must contain recognizable product, sales, price, and month fields.' });
  }

  const last = normalizedRows[normalizedRows.length - 1];
  const { sales, inventory, price, month } = last;
  if ([sales, inventory, price, month].some(v => v === undefined || isNaN(Number(v)))) {
    return res.status(400).json({ error: 'Last row must have valid sales, inventory, price, month values.' });
  }

  // Write temp CSV to backend dir with canonical headers
  const tmpPath = path.join(__dirname, `_upload_${Date.now()}.csv`);
  const canonicalHeaders = ['product', 'sales', 'inventory', 'price', 'month', 'demand', 'lead_time'];
  const csvValue = value => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csvLines = normalizedRows.map(r => canonicalHeaders.map(h => csvValue(r[h])).join(','));
  const csvContent = [canonicalHeaders.join(','), ...csvLines].join('\n');
  fs.writeFileSync(tmpPath, csvContent, 'utf8');

  try {
    const result = await runPython({
      mode: 'full',
      sales: Number(sales),
      inventory: Number(inventory),
      price: Number(price),
      month: Number(month),
      lead_time: Number(last.lead_time || 7),
      csv_path: tmpPath,
    });
    try { fs.unlinkSync(tmpPath); } catch (_) { }
    res.json({
      ...result,
      rows_used: normalizedRows.length,
      history: normalizedRows,
      product: last.product || 'uploaded-product'
    });
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) { }
    console.error('[upload-forecast]', err.message);
    res.status(500).json({ error: 'Forecast model failed.', detail: err.message });
  }
});

/* ── POST /api/data-quality ───────────────────────────────────────────────── */
app.post('/api/data-quality', requireAuth, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  const { rows } = req.body;
  let tmpPath = null;

  try {
    if (rows === undefined) {
      const preferences = db.getUserPreferences(req.user.id);
      const activeId = preferences.activeDatasetId;
      if (activeId && activeId !== 'default') {
        const datasets = db.listDatasets(req.user.id);
        const dataset = datasets.find(item => item.id === activeId);
        if (dataset) {
          const csvValue = value => {
            const text = String(value ?? '');
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          };
          tmpPath = path.join(__dirname, `_quality_${Date.now()}.csv`);
          fs.writeFileSync(tmpPath, [dataset.headers.join(','), ...dataset.rows.map(row => dataset.headers.map(header => csvValue(row[header])).join(','))].join('\n'), 'utf8');
        }
      }
    } else {
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, error: { code: 'EMPTY_DATASET', message: 'The uploaded CSV contains no data rows.' } });
      }
      const headers = Object.keys(rows[0]);
      const csvValue = value => {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const csvLines = rows.map(row => headers.map(header => csvValue(row[header])).join(','));
      tmpPath = path.join(__dirname, `_quality_${Date.now()}.csv`);
      fs.writeFileSync(tmpPath, [headers.join(','), ...csvLines].join('\n'), 'utf8');
    }

    const result = await runPython({
      mode: 'quality',
      csv_path: tmpPath || path.join(__dirname, 'data.csv'),
    });
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch (_) { }
    res.json(result);
  } catch (err) {
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch (_) { }
    res.status(500).json({ error: 'Quality analysis failed.', detail: err.message });
  }
});

/* ── POST /api/scenario ───────────────────────────────────────────────────── */
app.post('/api/scenario', requireAuth, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  const { sales, inventory, price, month, lead_time, scenarios } = req.body;
  if (!scenarios || !Array.isArray(scenarios)) {
    return res.status(400).json({ error: 'scenarios[] array is required.' });
  }
  try {
    const result = await runPython({
      mode: 'scenario',
      sales: Number(sales || 500),
      inventory: Number(inventory || 800),
      price: Number(price || 5000),
      month: Number(month || 6),
      lead_time: Number(lead_time || 7),
      scenarios,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Scenario simulation failed.', detail: err.message });
  }
});

/* ── GET /api/models ──────────────────────────────────────────────────────── */
app.get('/api/models', requireAuth, authorize('ADMIN'), async (req, res) => {
  try {
    const result = await runPython({ mode: 'compare' }, 45000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Model comparison failed.', detail: err.message });
  }
});

/* ── 404 ──────────────────────────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

/* ── Global error handler ─────────────────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error('[unhandled]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

/* ── Start ────────────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀 ForecastAI backend v2.0 running on http://localhost:${PORT}`);
  console.log(`   Health:       GET  http://localhost:${PORT}/api/health`);
  console.log(`   Forecast:     POST http://localhost:${PORT}/api/forecast`);
  console.log(`   Dashboard:    GET  http://localhost:${PORT}/api/intelligence/dashboard`);
  console.log(`   Models:       GET  http://localhost:${PORT}/api/models`);
  console.log(`   Copilot:      POST http://localhost:${PORT}/api/intelligence/copilot\n`);
});
