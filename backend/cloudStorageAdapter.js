/**
 * cloudStorageAdapter.js — Google Cloud Storage / Local Storage Adapter
 * =======================================================================
 * Manages persistent storage of uploaded CSV datasets, generated reports,
 * and ML artifacts with strict tenant/user isolation.
 * 
 * Features:
 * - Google Cloud Storage bucket support when GOOGLE_CLOUD_STORAGE_BUCKET is set.
 * - Local filesystem fallback for development in backend/uploads/.
 * - Strict isolation: datasets are stored by path: `${userId}/${datasetId}/${filename}`.
 * - Path traversal protection and filename sanitization.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

let Storage = null;
try {
  ({ Storage } = require('@google-cloud/storage'));
} catch (_) {}

class CloudStorageAdapter {
  constructor() {
    this.bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || null;
    this.storage = null;
    this.bucket = null;
    this.localUploadDir = path.join(__dirname, 'uploads');

    if (this.bucketName && Storage) {
      try {
        this.storage = new Storage({
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT,
        });
        this.bucket = this.storage.bucket(this.bucketName);
        console.log(`[Storage] Configured Google Cloud Storage bucket: ${this.bucketName}`);
      } catch (err) {
        console.warn(`[Storage] GCS initialization failed (${err.message}). Using local storage.`);
        this.bucket = null;
      }
    }

    if (!this.bucket) {
      if (!fs.existsSync(this.localUploadDir)) {
        try { fs.mkdirSync(this.localUploadDir, { recursive: true }); } catch (_) {}
      }
    }
  }

  /**
   * Sanitize filename to prevent directory traversal
   */
  sanitizeName(filename) {
    return path.basename(String(filename || 'dataset.csv')).replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Build isolated storage path: userId/datasetId/filename
   */
  getStorageKey(userId, datasetId, filename) {
    const cleanUser = String(userId || 'common').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanDataset = String(datasetId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanName = this.sanitizeName(filename);
    return `${cleanUser}/${cleanDataset}/${cleanName}`;
  }

  /**
   * Save dataset content (string or buffer)
   */
  async saveDataset(userId, datasetId, filename, content) {
    const key = this.getStorageKey(userId, datasetId, filename);

    if (this.bucket) {
      try {
        const file = this.bucket.file(key);
        await file.save(content, {
          contentType: 'text/csv',
          resumable: false,
          metadata: {
            userId,
            datasetId,
            uploadedAt: new Date().toISOString(),
          },
        });
        return { success: true, location: `gs://${this.bucketName}/${key}` };
      } catch (err) {
        console.error(`[Storage] GCS write error for ${key}:`, err.message);
        // Fall back to local write on failure
      }
    }

    // Local storage
    const targetPath = path.join(this.localUploadDir, key.replace(/\//g, path.sep));
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, content, 'utf8');
    return { success: true, location: targetPath };
  }

  /**
   * Read dataset content
   */
  async readDataset(userId, datasetId, filename) {
    const key = this.getStorageKey(userId, datasetId, filename);

    if (this.bucket) {
      try {
        const file = this.bucket.file(key);
        const [contents] = await file.download();
        return contents.toString('utf8');
      } catch (err) {
        console.warn(`[Storage] GCS download failed for ${key}: ${err.message}. Checking local.`);
      }
    }

    const targetPath = path.join(this.localUploadDir, key.replace(/\//g, path.sep));
    if (fs.existsSync(targetPath)) {
      return fs.readFileSync(targetPath, 'utf8');
    }
    return null;
  }

  /**
   * Delete dataset content
   */
  async deleteDataset(userId, datasetId, filename) {
    const key = this.getStorageKey(userId, datasetId, filename);

    if (this.bucket) {
      try {
        await this.bucket.file(key).delete({ ignoreNotFound: true });
      } catch (_) {}
    }

    const targetPath = path.join(this.localUploadDir, key.replace(/\//g, path.sep));
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch (_) {}
    }
    return true;
  }
}

module.exports = new CloudStorageAdapter();
