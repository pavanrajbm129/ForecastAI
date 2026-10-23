/**
 * test_workflow.js — Tests for Dataset Upload, Selection, Alias Normalization, and Forecasting Isolation
 * Run: node test_workflow.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:4000';
let pass = 0, fail = 0;
let authToken = '';

async function req(method, path, body, customHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...customHeaders };
  if (authToken && !customHeaders.Authorization && customHeaders.Authorization !== null) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (customHeaders.Authorization === null) {
    delete headers['Authorization'];
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    pass++;
  } catch (e) {
    console.log(`  ✗  ${label} — ${e.message}`);
    fail++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

(async () => {
  console.log('\n══ ForecastAI Dataset Upload & Forecasting Workflow Suite ══\n');

  // 1. Authenticate as admin
  const loginRes = await req('POST', '/api/auth/login', {
    identifier: 'admin@forecastai.com',
    password: 'Admin@12345',
  });
  assert(loginRes.status === 200, 'Login failed');
  authToken = loginRes.data.token;
  assert(authToken, 'No auth token returned');

  // ── Bug A: Dataset Upload, Filename Preservation & Deduplication ──
  console.log('── Bug A: Dataset Upload & Deduplication ──');

  let uploadedDatasetId = '';
  const testFileName = 'custom_electronics_q3_2026.csv';
  const sampleRows = [
    { product_name: 'Smart Keyboard X', date: '2026-01-15', quantity: 120, stock: 45, unit_price: 3500 },
    { product_name: 'Smart Keyboard X', date: '2026-02-15', quantity: 140, stock: 50, unit_price: 3500 },
    { product_name: 'Smart Keyboard X', date: '2026-03-15', quantity: 160, stock: 55, unit_price: 3500 },
    { product_name: 'Smart Keyboard X', date: '2026-04-15', quantity: 180, stock: 60, unit_price: 3500 },
    { product_name: 'Smart Keyboard X', date: '2026-05-15', quantity: 210, stock: 70, unit_price: 3500 },
    { product_name: 'Compact Mouse M1', date: '2026-05-15', quantity: 95, stock: 30, unit_price: 1200 }, // only 1 month history
  ];

  await test('Upload valid CSV with column aliases preserves original filename', async () => {
    const res = await req('POST', '/api/intelligence/datasets', {
      name: testFileName,
      headers: ['product_name', 'date', 'quantity', 'stock', 'unit_price'],
      rows: sampleRows,
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.dataset && res.data.dataset.id, 'Missing dataset ID');
    assert(res.data.dataset.name === testFileName, `Expected filename ${testFileName}, got ${res.data.dataset.name}`);
    uploadedDatasetId = res.data.dataset.id;
  });

  await test('Reject invalid CSV upload without data rows', async () => {
    const res = await req('POST', '/api/intelligence/datasets', {
      name: 'empty.csv',
      headers: ['product', 'sales'],
      rows: [],
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Re-uploading identical dataset does NOT create duplicate records', async () => {
    const listBefore = await req('GET', '/api/intelligence/datasets');
    const countBefore = listBefore.data.datasets.length;

    const res = await req('POST', '/api/intelligence/datasets', {
      name: testFileName,
      headers: ['product_name', 'date', 'quantity', 'stock', 'unit_price'],
      rows: sampleRows,
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.dataset.id === uploadedDatasetId, 'Expected existing dataset ID to be reused');

    const listAfter = await req('GET', '/api/intelligence/datasets');
    assert(listAfter.data.datasets.length === countBefore, `Expected ${countBefore} datasets, got ${listAfter.data.datasets.length}`);
  });

  await test('Dataset listing returns unique records without duplicates', async () => {
    const res = await req('GET', '/api/intelligence/datasets');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const datasets = res.data.datasets;
    const ids = datasets.map(d => d.id);
    const uniqueIds = new Set(ids);
    assert(ids.length === uniqueIds.size, `Duplicate dataset IDs detected: ${ids.length} vs ${uniqueIds.size}`);
  });

  // ── Bug B: Start Forecast & Prediction Workflow ──
  console.log('\n── Bug B: Start Forecast Workflow ──');

  await test('POST /api/upload-forecast with aliased rows succeeds and returns forecast metrics', async () => {
    const res = await req('POST', '/api/upload-forecast', {
      rows: sampleRows,
      datasetId: uploadedDatasetId,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert(Number.isFinite(res.data.predicted_demand), 'predicted_demand must be a finite number');
    assert(Number.isFinite(res.data.recommended_stock), 'recommended_stock must be a finite number');
    assert(res.data.prediction_interval && Number.isFinite(res.data.prediction_interval.lower), 'prediction_interval.lower must be finite');
    assert(res.data.prediction_interval && Number.isFinite(res.data.prediction_interval.upper), 'prediction_interval.upper must be finite');
    assert(Array.isArray(res.data.history) && res.data.history.length === sampleRows.length, 'history array must be returned for charting');
  });

  await test('POST /api/forecast rejects inaccessible or nonexistent dataset ID (no silent fallback)', async () => {
    const res = await req('POST', '/api/forecast', {
      sales: 150, inventory: 50, price: 3500, month: 6,
      datasetId: 'nonexistent-uuid-0000-000000000000',
    });
    assert(res.status === 422 || res.status === 400 || res.status === 404, `Expected error status, got ${res.status}`);
  });

  // ── Bug C: Product Intelligence, History Isolation & Column Aliases ──
  console.log('\n── Bug C: Column Aliases, History & Prediction ──');

  await test('Product catalogue parses products from uploaded dataset using aliases', async () => {
    const res = await req('GET', `/api/intelligence/products?datasetId=${encodeURIComponent(uploadedDatasetId)}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const productNames = res.data.products.map(p => p.name);
    assert(productNames.includes('Smart Keyboard X'), 'Smart Keyboard X should be in catalogue');
    assert(productNames.includes('Compact Mouse M1'), 'Compact Mouse M1 should be in catalogue');
  });

  await test('GET /api/intelligence/product/:id returns history strictly from selected dataset', async () => {
    const res = await req('GET', `/api/intelligence/product/smart-keyboard-x?datasetId=${encodeURIComponent(uploadedDatasetId)}`);
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert(res.data.product && res.data.product.name === 'Smart Keyboard X', 'Product name mismatch');
    assert(Array.isArray(res.data.history), 'History must be an array');
    assert(res.data.history.length === 5, `Expected 5 history rows for Smart Keyboard X, got ${res.data.history.length}`);
    // Check chronological order
    const dates = res.data.history.map(h => new Date(h.date).getTime());
    for (let i = 1; i < dates.length; i++) {
      assert(dates[i] >= dates[i - 1], `History observations not chronological: ${res.data.history[i - 1].date} before ${res.data.history[i].date}`);
    }
  });

  await test('Product with insufficient history (< 3 observations) reports exact count and minimum required', async () => {
    const res = await req('GET', `/api/intelligence/product/compact-mouse-m1?datasetId=${encodeURIComponent(uploadedDatasetId)}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.history_count === 1, `Expected history_count 1, got ${res.data.history_count}`);
    assert(res.data.min_required_history === 3, `Expected min_required_history 3, got ${res.data.min_required_history}`);
  });

  // ── Bug D: Verify JavaScript source text is absent from frontend UI ──
  console.log('\n── Bug D: Source Text Verification ──');

  await test('No stray JavaScript source text in frontend/script.js', async () => {
    const scriptContent = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
    const badPattern = /const\s+box\s*=\s*document\.getElementById\('forecastResultBox'\);/;
    // Check lines around setForecastChartMessage
    const match = scriptContent.match(/function\s+setForecastChartMessage[\s\S]*?<\/div>`/);
    assert(match, 'setForecastChartMessage not found');
    assert(!badPattern.test(match[0]), 'Stray const box = document.getElementById... found inside setForecastChartMessage!');
  });

  await test('No duplicate Dataset dropdown on Forecast page in frontend/index.html', async () => {
    const htmlContent = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
    // Ensure forecast-controls does not contain scenarioDataset
    const forecastControlsMatch = htmlContent.match(/class="glass-card forecast-controls"[\s\S]*?<button class="predict-btn"/);
    assert(forecastControlsMatch, 'forecast-controls not found in index.html');
    const hasScenarioInForecast = /id="scenarioDataset"/.test(forecastControlsMatch[0]);
    assert(!hasScenarioInForecast, 'scenarioDataset is still inside forecast-controls!');
  });

  // Cleanup: delete the test dataset
  if (uploadedDatasetId) {
    await req('DELETE', `/api/intelligence/datasets/${encodeURIComponent(uploadedDatasetId)}`);
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  Results: ${pass} passed  |  ${fail} failed`);
  console.log(`══════════════════════════════════════════════════\n`);
  if (fail > 0) process.exit(1);
})();
