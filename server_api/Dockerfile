# ============================================
# Optimized Dockerfile for Sticker Converter
# ============================================
FROM node:18-slim AS base

# Install Chromium and FFmpeg in a single layer
# Most lib* dependencies are automatically installed as chromium dependencies
# We only need to explicitly add a few extras
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set Puppeteer environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# ============================================
# Dependencies layer (cached unless package.json changes)
# ============================================
FROM base AS deps

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ============================================
# Production image
# ============================================
FROM base AS production

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Create required directories
RUN mkdir -p uploads temp

# server.js is mounted as volume in docker-compose.yml
# No need to COPY it here - allows instant updates!

EXPOSE 8202
CMD ["node", "server.js"]