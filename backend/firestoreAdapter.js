/**
 * firestoreAdapter.js — Google Cloud Firestore Storage Adapter
 * ==============================================================
 * Provides Firestore collection synchronization and document operations.
 * - Uses Application Default Credentials (ADC) in Cloud Run production.
 * - Supports Firestore emulator or GOOGLE_APPLICATION_CREDENTIALS for local testing.
 * - Idempotent document upserts with timestamp tracking.
 * - Batched writes and error resilience.
 */
'use strict';

let Firestore = null;
try {
  ({ Firestore } = require('@google-cloud/firestore'));
} catch (_) {
  // @google-cloud/firestore will be available in container/installed env
}

class FirestoreAdapter {
  constructor(options = {}) {
    this.projectId = options.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
    this.databaseId = options.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)';
    this.db = null;
    this.initialized = false;
    this.initError = null;
  }

  /**
   * Initialize Firestore client using Application Default Credentials
   */
  async init() {
    if (this.initialized) return true;
    if (!Firestore) {
      this.initError = new Error('@google-cloud/firestore package is not available.');
      return false;
    }

    try {
      const config = {};
      if (this.projectId) config.projectId = this.projectId;
      if (this.databaseId && this.databaseId !== '(default)') config.databaseId = this.databaseId;

      this.db = new Firestore(config);
      // Verify connectivity with a lightweight ping
      await this.db.collection('_healthcheck').doc('ping').set({
        ping: true,
        timestamp: new Date().toISOString(),
      }, { merge: true });

      this.initialized = true;
      this.initError = null;
      console.log(`[Firestore] Connected to project: ${this.projectId || 'ADC-default'}, database: ${this.databaseId}`);
      return true;
    } catch (err) {
      this.initialized = false;
      this.initError = err;
      console.warn(`[Firestore] Initialization failed: ${err.message}. Falling back to file storage.`);
      return false;
    }
  }

  /**
   * Check whether Firestore is active and healthy
   */
  async healthCheck() {
    if (!this.initialized || !this.db) {
      return {
        healthy: false,
        adapter: 'firestore',
        error: this.initError ? this.initError.message : 'Not initialized',
      };
    }
    try {
      const doc = await this.db.collection('_healthcheck').doc('ping').get();
      return {
        healthy: doc.exists,
        adapter: 'firestore',
        projectId: this.projectId,
        databaseId: this.databaseId,
      };
    } catch (err) {
      return {
        healthy: false,
        adapter: 'firestore',
        error: err.message,
      };
    }
  }

  /**
   * Fetch all documents in a collection as an array of objects
   */
  async fetchCollection(collectionName) {
    if (!this.initialized || !this.db) return [];
    try {
      const snapshot = await this.db.collection(collectionName).get();
      const docs = [];
      snapshot.forEach(doc => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      return docs;
    } catch (err) {
      console.error(`[Firestore] Error fetching ${collectionName}:`, err.message);
      return [];
    }
  }

  /**
   * Write or merge a document in a collection
   */
  async writeDoc(collectionName, docId, data) {
    if (!this.initialized || !this.db) return false;
    try {
      const docRef = this.db.collection(collectionName).doc(String(docId));
      await docRef.set({
        ...data,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return true;
    } catch (err) {
      console.error(`[Firestore] Error writing doc ${collectionName}/${docId}:`, err.message);
      return false;
    }
  }

  /**
   * Delete a document from a collection
   */
  async deleteDoc(collectionName, docId) {
    if (!this.initialized || !this.db) return false;
    try {
      await this.db.collection(collectionName).doc(String(docId)).delete();
      return true;
    } catch (err) {
      console.error(`[Firestore] Error deleting doc ${collectionName}/${docId}:`, err.message);
      return false;
    }
  }

  /**
   * Batch upsert documents
   */
  async batchUpsert(collectionName, items, idKey = 'id') {
    if (!this.initialized || !this.db) return 0;
    if (!Array.isArray(items) || items.length === 0) return 0;

    let totalWritten = 0;
    const batchSize = 400; // Firestore limit is 500 operations per batch

    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const batch = this.db.batch();

      for (const item of chunk) {
        const docId = String(item[idKey] || item.actionId || item.requestId || item.poNumber || item.receiptNumber || item.identifier || Math.random().toString(16).slice(2));
        const docRef = this.db.collection(collectionName).doc(docId);
        batch.set(docRef, item, { merge: true });
      }

      await batch.commit();
      totalWritten += chunk.length;
    }

    return totalWritten;
  }
}

module.exports = FirestoreAdapter;
