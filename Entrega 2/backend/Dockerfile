# syntax=docker/dockerfile:1
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy source code and default data
COPY src/ ./src/
COPY data/ ./data/

# Environment configuration
ENV NODE_ENV=production
ENV PORT=5000
ENV DATA_DIR=/data

# Create data directory for docker volume
RUN mkdir -p /data && cp -r data/* /data/ || true

# Expose backend port
EXPOSE 5000

# Healthcheck to verify the node is physically running
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start the node process
CMD ["node", "src/server.js"]
