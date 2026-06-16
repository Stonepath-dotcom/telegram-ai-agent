# ============================================
# Dockerfile for Telegram AI Agent Bot
# ============================================

FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Create non-root user
RUN groupadd -r botuser && useradd -r -g botuser botuser
USER botuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "process.exit(0)"

# Start the bot
CMD ["node", "src/index.js"]
