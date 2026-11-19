# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=5002

EXPOSE 5002

HEALTHCHECK --interval=5s --timeout=3s --start-period=4s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5002/health || exit 1

CMD ["node", "src/server.js"]
