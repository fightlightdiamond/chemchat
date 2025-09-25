# Multi-stage build for production optimization
FROM node:20-alpine AS base

# Development stage for hot-reload
FROM base AS development
WORKDIR /app

# Install system dependencies for development
RUN apk add --no-cache \
    git \
    curl \
    bash \
    procps

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and all dependencies (including dev dependencies)
RUN npm install -g pnpm && pnpm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose ports (3000 for app, 9229 for debugger)
EXPOSE 3000 9229

# Start development server with hot reload
CMD ["npm", "run", "start:dev"]

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Create logs directory
RUN mkdir -p /app/logs && chown nestjs:nodejs /app/logs

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
