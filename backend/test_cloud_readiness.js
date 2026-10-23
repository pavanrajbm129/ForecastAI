/**
 * test_cloud_readiness.js — Automated Cloud Run & Firebase Verification Suite
 * =============================================================================
 * Verifies that all portability, security, storage, and deployment configurations
 * function correctly and reliably.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passed++;
        console.log(`  ✓ ${name}`);
      }).catch(err => {
        failed++;
        console.error(`  ✗ ${name}: ${err.message}`);
      });
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log(' Running ForecastAI Cloud Deployment Readiness Tests');
  console.log('===============================================================\n');

  // Test 1: Portable Python Runner
  console.log('[1] Portable Python Execution:');
  const { resolvePythonExecutable, runModel, createTempCsv, removeTempFile, PYTHON_BIN } = require('./pythonRunner');
  
  it('detects a valid Python binary on the host', () => {
    assert(typeof PYTHON_BIN === 'string' && PYTHON_BIN.length > 0, 'PYTHON_BIN must be non-empty');
  });

  it('safely creates temporary CSV in os.tmpdir() and cleans it up', () => {
    const rows = [
      { product: 'Widget A', sales: 100, inventory: 50, price: 20, month: 1, demand: 110, lead_time: 7 },
      { product: 'Widget A', sales: 120, inventory: 40, price: 20, month: 2, demand: 130, lead_time: 7 },
    ];
    const headers = ['product', 'sales', 'inventory', 'price', 'month', 'demand', 'lead_time'];
    const tempPath = createTempCsv(rows, headers);
    assert(fs.existsSync(tempPath), 'Temporary CSV must exist on disk');
    assert(tempPath.startsWith(os.tmpdir()), 'Temporary file must reside in os.tmpdir()');
    const content = fs.readFileSync(tempPath, 'utf8');
    assert(content.includes('Widget A'), 'Content must contain row data');
    removeTempFile(tempPath);
    assert(!fs.existsSync(tempPath), 'Temporary file must be removed after cleanup');
  });

  await it('executes rf_model.py through pythonRunner without crashing', async () => {
    const result = await runModel({ mode: 'forecast', sales: 500, inventory: 200, price: 1000, month: 3, lead_time: 7 });
    assert(result && typeof result.predicted_demand === 'number', 'Model must return numeric predicted_demand');
  });

  // Test 2: Database Layer & Health Check
  console.log('\n[2] Database & Health Check:');
  const db = require('./db');
  
  it('returns structured database health metadata', () => {
    const health = db.getDatabaseHealth();
    assert.strictEqual(health.status, 'ok', 'Database status must be ok');
    assert(typeof health.adapter === 'string', 'Database adapter must be defined');
    assert(health.records && typeof health.records.users === 'number', 'Record counts must be numeric');
    assert(typeof health.records.audits === 'number', 'Audit record count must be numeric');
  });

  it('supports audit logging through db.listAudits and db.insertAudit', () => {
    const initialCount = db.listAudits().length;
    const testEntry = {
      action: 'TEST_AUDIT',
      user: 'cloud_test_runner',
      reason: 'Automated verification check',
    };
    const created = db.insertAudit(testEntry);
    assert(created && created.id, 'Audit record must have an ID');
    const updatedCount = db.listAudits().length;
    assert.strictEqual(updatedCount, initialCount + 1, 'Audit record count must increment by 1');
  });

  // Test 3: Cloud Storage Adapter
  console.log('\n[3] Cloud Storage & Dataset Isolation:');
  const storage = require('./cloudStorageAdapter');

  it('sanitizes dataset filenames to prevent directory traversal', () => {
    const safe = storage.sanitizeName('../../../etc/passwd.csv');
    assert(!safe.includes('..'), 'Must not contain directory traversal characters');
    assert.strictEqual(safe, 'passwd.csv');
  });

  it('generates strictly isolated tenant keys (userId/datasetId/filename)', () => {
    const key = storage.getStorageKey('user-123', 'ds-456', 'sales data.csv');
    assert.strictEqual(key, 'user-123/ds-456/sales_data.csv');
  });

  await it('saves, reads, and deletes dataset content with tenant isolation', async () => {
    const testContent = 'product,month,demand\nItemX,1,500';
    const writeRes = await storage.saveDataset('test-user', 'test-ds', 'test_sample.csv', testContent);
    assert(writeRes.success, 'Save dataset must succeed');
    const readContent = await storage.readDataset('test-user', 'test-ds', 'test_sample.csv');
    assert.strictEqual(readContent, testContent, 'Read content must match saved content');
    const delRes = await storage.deleteDataset('test-user', 'test-ds', 'test_sample.csv');
    assert(delRes, 'Delete dataset must succeed');
  });

  // Test 4: Frontend Centralized Configuration
  console.log('\n[4] Frontend Configuration:');
  const configJsPath = path.join(__dirname, '../frontend/config.js');
  
  it('frontend/config.js exists and defines __FORECASTAI_CONFIG__', () => {
    assert(fs.existsSync(configJsPath), 'config.js must exist');
    const code = fs.readFileSync(configJsPath, 'utf8');
    assert(code.includes('__FORECASTAI_CONFIG__'), 'config.js must define __FORECASTAI_CONFIG__');
    assert(!code.includes('const API = \'http://localhost:4000/api\''), 'config.js must not hardcode static localhost');
  });

  it('frontend/script.js uses dynamic API resolution', () => {
    const scriptPath = path.join(__dirname, '../frontend/script.js');
    const scriptCode = fs.readFileSync(scriptPath, 'utf8');
    assert(scriptCode.includes('__FORECASTAI_CONFIG__'), 'script.js must reference __FORECASTAI_CONFIG__');
    assert(!scriptCode.startsWith("const API = 'http://localhost:4000/api';"), 'script.js must not start with hardcoded localhost');
  });

  // Test 5: Firebase & Docker Configuration
  console.log('\n[5] Firebase Hosting & Dockerization:');
  const firebaseJsonPath = path.join(__dirname, '../firebase.json');
  const dockerfilePath = path.join(__dirname, 'Dockerfile');

  it('firebase.json configures public frontend directory and Cloud Run rewrite', () => {
    assert(fs.existsSync(firebaseJsonPath), 'firebase.json must exist');
    const fb = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
    assert.strictEqual(fb.hosting.public, 'frontend', 'Hosting public dir must be frontend');
    assert(Array.isArray(fb.hosting.rewrites), 'Must have rewrites array');
    const apiRewrite = fb.hosting.rewrites.find(r => r.source === '/api/**');
    assert(apiRewrite && apiRewrite.run, 'Must configure /api/** rewrite to Cloud Run service');
  });

  it('Dockerfile specifies Node.js 20 base, Python virtualenv, and non-root user', () => {
    assert(fs.existsSync(dockerfilePath), 'Dockerfile must exist');
    const dockerContent = fs.readFileSync(dockerfilePath, 'utf8');
    assert(dockerContent.includes('node:20'), 'Dockerfile must use node:20 base');
    assert(dockerContent.includes('python3-venv') || dockerContent.includes('venv'), 'Dockerfile must configure Python venv');
    assert(dockerContent.includes('USER appuser'), 'Dockerfile must run as non-root user appuser');
    assert(dockerContent.includes('PORT'), 'Dockerfile must respect Cloud Run PORT');
  });

  console.log('\n---------------------------------------------------------------');
  console.log(`Readiness Suite Finished: ${passed} passed, ${failed} failed`);
  console.log('---------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test runner failure:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
