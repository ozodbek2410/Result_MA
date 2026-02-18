# Multi-stage build for production

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Install Pandoc (for Word generation)
RUN apk add --no-cache pandoc

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

# Install Pandoc and Python (for OMR checker)
RUN apk add --no-cache \
    pandoc \
    python3 \
    py3-pip \
    opencv-python \
    && pip3 install --no-cache-dir opencv-python numpy

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy templates and python scripts
COPY templates ./templates
COPY python ./python

# Create directories
RUN mkdir -p uploads temp

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]
