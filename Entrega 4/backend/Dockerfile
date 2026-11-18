# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY src/ ./src/
COPY data/ ./data/

ENV NODE_ENV=production
ENV PORT=5000
ENV DATA_DIR=/data
ENV RABBITMQ_URL=amqp://rabbitmq:5672
ENV SERVICE_REGISTRY_URL=http://service-registry:5002
ENV SERVICE_HOST=backend

RUN mkdir -p /data && cp -r data/* /data/ || true

EXPOSE 5000

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "src/server.js"]
