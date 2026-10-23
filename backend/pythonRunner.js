/**
 * pythonRunner.js — Portable Python ML Invocation Helper
 * ========================================================
 * Safely executes Python ML scripts across Windows, Linux, and Cloud Run.
 * - Resolves PYTHON_EXECUTABLE from env, with smart platform defaults:
 *   - Windows: 'py' or 'python'
 *   - Linux/Cloud Run: 'python3' or 'python'
 * - Uses execFile with argument arrays (no shell interpolation).
 * - Enforces process timeouts and captures stdout/stderr cleanly.
 * - Writes temporary CSV files to os.tmpdir() with guaranteed cleanup.
 */
'use strict';

const { execFile, execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Detect the best available Python executable.
 */
function resolvePythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }
  const candidates = process.platform === 'win32'
    ? ['py', 'python', 'python3']
    : ['python3', 'python'];

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore', timeout: 3000 });
      return candidate;
    } catch (_) {
      // candidate not available, try next
    }
  }
  // Default fallback
  return process.platform === 'win32' ? 'py' : 'python3';
}

const PYTHON_BIN = resolvePythonExecutable();

/**
 * Execute rf_model.py with a JSON payload.
 * @param {Object} inputObj - Input dictionary passed to rf_model.py
 * @param {number} timeoutMs - Execution timeout in milliseconds (default 35s)
 * @returns {Promise<Object>} - Parsed JSON result
 */
function runModel(inputObj, timeoutMs = 35000) {
  const modelScript = path.join(__dirname, 'rf_model.py');
  const inputStr = JSON.stringify(inputObj);

  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_BIN,
      [modelScript, inputStr],
      {
        cwd: __dirname,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB stdout buffer
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          TF_CPP_MIN_LOG_LEVEL: '3',
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          // Check if stdout contained a structured JSON error
          if (stdout && stdout.trim()) {
            try {
              const parsed = JSON.parse(stdout.trim());
              if (parsed && parsed.error) {
                return reject(new Error(parsed.error));
              }
            } catch (_) {}
          }
          const errMsg = (stderr && stderr.trim()) || error.message || 'Python process execution failed.';
          return reject(new Error(errMsg));
        }

        if (!stdout || !stdout.trim()) {
          return reject(new Error('Model produced no output.'));
        }

        try {
          const result = JSON.parse(stdout.trim());
          if (result && result.error) {
            return reject(new Error(result.error));
          }
          resolve(result);
        } catch (parseErr) {
          const preview = stdout.length > 250 ? stdout.slice(0, 250) + '...' : stdout;
          reject(new Error(`Model output could not be parsed as JSON: ${preview}`));
        }
      }
    );
  });
}

/**
 * Safely create a temporary CSV file in os.tmpdir() with canonical headers and values.
 * @param {Array<Object>} rows - Array of row objects
 * @param {Array<string>} headers - Canonical header list
 * @returns {string} - Absolute path to temporary file
 */
function createTempCsv(rows, headers) {
  const prefix = `fai_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const tempPath = path.join(os.tmpdir(), `${prefix}.csv`);

  const escapeCsv = val => {
    const text = String(val ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const headerLine = headers.join(',');
  const lines = rows.map(row => headers.map(h => escapeCsv(row[h])).join(','));
  const content = [headerLine, ...lines].join('\n');

  fs.writeFileSync(tempPath, content, 'utf8');
  return tempPath;
}

/**
 * Remove a temporary file safely without throwing.
 * @param {string} filePath
 */
function removeTempFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // best-effort cleanup
  }
}

module.exports = {
  PYTHON_BIN,
  resolvePythonExecutable,
  runModel,
  createTempCsv,
  removeTempFile,
};
