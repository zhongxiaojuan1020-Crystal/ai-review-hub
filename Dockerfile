FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

# Install all dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN npm ci

# Build shared
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./
RUN npm run build -w packages/shared

# Build server
COPY packages/server ./packages/server
RUN npm run build -w packages/server

# Build web
COPY packages/web ./packages/web
RUN npm run build -w packages/web

# ---- Runtime image ----
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/server/dist ./packages/server/dist
COPY --from=base /app/packages/web/dist    ./packages/web/dist

# Data volume for SQLite
RUN mkdir -p /data
ENV DATABASE_PATH=/data/aireviews.db
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV SERVER_PORT=3000

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "packages/server/dist/index.js"]
