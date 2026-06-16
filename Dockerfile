FROM node:20-alpine AS base

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
