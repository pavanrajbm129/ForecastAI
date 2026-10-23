# ==============================================================================
# Dockerfile — ForecastAI Cloud Run Production Container
# Multi-runtime: Node.js 20 LTS + Python 3.11 ML Environment
# ==============================================================================

FROM node:20-bookworm-slim

# Install Python runtime, pip, and system libraries for ML dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create and activate Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
ENV PYTHON_EXECUTABLE="/opt/venv/bin/python3"
ENV PYTHONUNBUFFERED=1

# Install Python ML dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Node.js production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY server.js db.js rf_model.py pythonRunner.js firestoreAdapter.js cloudStorageAdapter.js otp.js ./
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY data.csv data.json audit.json ./

# Create non-root system user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser && \
    mkdir -p /app/uploads /tmp/forecastai && \
    chown -R appuser:appuser /app /tmp/forecastai

USER appuser

# Cloud Run defaults PORT to 8080
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start server with direct process execution
CMD ["node", "server.js"]
