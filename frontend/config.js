/**
 * config.js — Centralized API and Environment Configuration for ForecastAI
 * ==========================================================================
 * Automatically resolves the correct Backend API endpoint:
 * 1. Checks user override in localStorage ('forecastai_api_url')
 * 2. Checks global window.__API_BASE__ (configured during deployment/hosting)
 * 3. In local development (localhost / 127.0.0.1): uses 'http://localhost:4000/api'
 * 4. In production (Firebase Hosting / Cloud Run):
 *    - Uses same-origin '/api' (when using Firebase Hosting rewrites to Cloud Run)
 *    - Or explicit Cloud Run endpoint URL
 */
(function (root) {
  'use strict';

  function determineApiBase() {
    // 1. User/Admin explicit setting saved in browser localStorage
    try {
      const saved = root.localStorage && root.localStorage.getItem('forecastai_api_url');
      if (saved && saved.trim()) {
        let url = saved.trim().replace(/\/+$/, '');
        if (!url.endsWith('/api')) url += '/api';
        return url;
      }
    } catch (_) {}

    // 2. Pre-injected runtime config
    if (root.__API_BASE__ && typeof root.__API_BASE__ === 'string' && root.__API_BASE__.trim()) {
      let url = root.__API_BASE__.trim().replace(/\/+$/, '');
      if (!url.endsWith('/api')) url += '/api';
      return url;
    }

    // 3. Localhost development
    const host = (root.location && root.location.hostname) || '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '') {
      return 'http://localhost:4000/api';
    }

    // 4. Production Firebase Hosting (relative /api with Cloud Run rewrite)
    return '/api';
  }

  const apiBase = determineApiBase();

  root.__FORECASTAI_CONFIG__ = {
    apiBase: apiBase,
    authBase: apiBase + '/auth',
    setApiBase: function (newUrl) {
      try {
        if (!newUrl) {
          root.localStorage.removeItem('forecastai_api_url');
        } else {
          root.localStorage.setItem('forecastai_api_url', newUrl.trim());
        }
      } catch (_) {}
      root.location.reload();
    },
    getApiBase: determineApiBase,
  };
})(typeof window !== 'undefined' ? window : this);
