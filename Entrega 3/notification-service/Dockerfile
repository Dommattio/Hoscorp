# syntax=docker/dockerfile:1
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy source code
COPY src/ ./src/

# Environment configuration
ENV NODE_ENV=production
ENV PORT=5001
ENV RABBITMQ_URL=amqp://rabbitmq:5672

# Expose service port
EXPOSE 5001

# Healthcheck to verify the notification node is physically running
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

# Start the node process
CMD ["node", "src/server.js"]
