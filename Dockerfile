FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---

FROM node:22-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build

# Context is persisted to /data — mount a volume here to keep it across runs
RUN mkdir -p /data
ENV NODE_ENV=production
ENV HEVY_CONTEXT_PATH=/data/context.json

VOLUME ["/data"]

ENTRYPOINT ["node", "build/index.js"]
