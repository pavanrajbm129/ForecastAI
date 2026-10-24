/**
 * config.js — Centralized API and Environment Configuration for ForecastAI
 * ==========================================================================
 * Local development uses localhost:4000; deployed frontends use the Render API.
 */
(function (root) {
  'use strict';

  const PRODUCTION_API_ORIGIN = 'https://forecastai-87fx.onrender.com';
  const LOCAL_API_ORIGIN = 'http://localhost:4000';

  function normalizeApiBase(value) {
    const url = String(value || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    return url.replace(/(?:\/api)+$/i, '') + '/api';
  }

  function isLocalHost(host) {
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  }

  function determineApiBase() {
    const host = (root.location && root.location.hostname) || '';
    const localDevelopment = isLocalHost(host);

    if (host === 'forecastai-frontend.vercel.app') {
      try {
        root.localStorage && root.localStorage.removeItem('forecastai_api_url');
      } catch (_) {}
      return normalizeApiBase(PRODUCTION_API_ORIGIN);
    }

    // Runtime config is useful for deployments that inject their own API origin.
    if (root.__API_BASE__ && typeof root.__API_BASE__ === 'string' && root.__API_BASE__.trim()) {
      const configured = normalizeApiBase(root.__API_BASE__);
      if (localDevelopment || configured.startsWith('https://')) return configured;
    }

    // Keep localhost overrides local to development and allow secure remote
    // overrides on other hosts; discard stale remote values in local development.
    try {
      const saved = root.localStorage && root.localStorage.getItem('forecastai_api_url');
      if (saved && saved.trim()) {
        const configured = normalizeApiBase(saved);
        if (localDevelopment) {
          if (configured.includes('localhost') || configured.includes('127.0.0.1')) {
            return configured;
          }
          // Discard stale remote API override when running locally
          root.localStorage.removeItem('forecastai_api_url');
        } else if (configured.startsWith('https://')) {
          return configured;
        } else {
          root.localStorage.removeItem('forecastai_api_url');
        }
      }
    } catch (_) {}

    return normalizeApiBase(localDevelopment ? LOCAL_API_ORIGIN : PRODUCTION_API_ORIGIN);
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
