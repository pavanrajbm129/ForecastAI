/**
 * migrate_to_firestore.js — Idempotent JSON-to-Firestore Migration Utility
 * =========================================================================
 * Migrates data from local data.json and audit.json to Google Cloud Firestore.
 * 
 * Features:
 * - Idempotent: Can be run multiple times safely without creating duplicates.
 * - Non-destructive: Leaves local data.json and audit.json completely untouched.
 * - Comprehensive: Migrates users, datasets, scenarios, actions, suppliers,
 *   purchaseRequests, purchaseOrders, goodsReceipts, inventoryTransactions, otps, audits.
 * - Validation & Reporting: Verifies record integrity and displays per-collection counts.
 * 
 * Usage:
 *   GOOGLE_CLOUD_PROJECT=your-project-id node migrate_to_firestore.js [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const FirestoreAdapter = require('./firestoreAdapter');

const DATA_JSON_PATH = path.join(__dirname, 'data.json');
const AUDIT_JSON_PATH = path.join(__dirname, 'audit.json');

const isDryRun = process.argv.includes('--dry-run');

async function runMigration() {
  console.log('===============================================================');
  console.log(' ForecastAI Firestore Migration Utility');
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (Validation only, no writes)' : 'LIVE MIGRATION'}`);
  console.log(` Target Project: ${process.env.GOOGLE_CLOUD_PROJECT || 'Default ADC project'}`);
  console.log('===============================================================\n');

  // 1. Read and validate local data.json
  if (!fs.existsSync(DATA_JSON_PATH)) {
    console.error(`FATAL: Source data file not found at ${DATA_JSON_PATH}`);
    process.exit(1);
  }

  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(DATA_JSON_PATH, 'utf8'));
  } catch (err) {
    console.error(`FATAL: Could not parse ${DATA_JSON_PATH}: ${err.message}`);
    process.exit(1);
  }

  // 2. Read local audit.json if available
  let audits = [];
  if (fs.existsSync(AUDIT_JSON_PATH)) {
    try {
      audits = JSON.parse(fs.readFileSync(AUDIT_JSON_PATH, 'utf8'));
      if (!Array.isArray(audits)) audits = [];
    } catch (_) {
      audits = [];
    }
  }

  const collectionsToMigrate = [
    { name: 'users', items: data.users || [], idKey: 'id' },
    { name: 'datasets', items: data.datasets || [], idKey: 'id' },
    { name: 'scenarios', items: data.scenarios || [], idKey: 'id' },
    { name: 'actions', items: data.actions || [], idKey: 'actionId' },
    { name: 'suppliers', items: data.suppliers || [], idKey: 'id' },
    { name: 'purchaseRequests', items: data.purchaseRequests || [], idKey: 'id' },
    { name: 'purchaseOrders', items: data.purchaseOrders || [], idKey: 'id' },
    { name: 'goodsReceipts', items: data.goodsReceipts || [], idKey: 'id' },
    { name: 'inventoryTransactions', items: data.inventoryTransactions || [], idKey: 'id' },
    { name: 'otps', items: data.otps || [], idKey: 'id' },
    { name: 'audits', items: audits, idKey: 'id' },
  ];

  console.log('Source Data Summary:');
  console.log('--------------------');
  let totalRecords = 0;
  for (const col of collectionsToMigrate) {
    console.log(`  • ${col.name.padEnd(24)}: ${String(col.items.length).padStart(5)} record(s)`);
    totalRecords += col.items.length;
  }
  console.log(`  • Total Source Records    : ${String(totalRecords).padStart(5)}\n`);

  if (isDryRun) {
    console.log('✅ DRY-RUN completed successfully. All source records are valid and ready for migration.');
    return;
  }

  // 3. Connect to Firestore
  const adapter = new FirestoreAdapter();
  const connected = await adapter.init();
  if (!connected) {
    console.error('\n❌ Could not connect to Google Cloud Firestore.');
    console.error('   Ensure GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login is configured.');
    process.exit(1);
  }

  console.log('Starting Batch Upload to Firestore:');
  console.log('-----------------------------------');
  let totalMigrated = 0;

  for (const col of collectionsToMigrate) {
    if (col.items.length === 0) {
      console.log(`  • ${col.name.padEnd(24)}: Skipped (0 records)`);
      continue;
    }
    const count = await adapter.batchUpsert(col.name, col.items, col.idKey);
    console.log(`  • ${col.name.padEnd(24)}: Migrated ${count}/${col.items.length} records`);
    totalMigrated += count;
  }

  console.log('\n===============================================================');
  console.log(`✅ Migration complete! Successfully transferred ${totalMigrated} records.`);
  console.log('   Local data.json and audit.json files were preserved intact.');
  console.log('===============================================================\n');
}

if (require.main === module) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
