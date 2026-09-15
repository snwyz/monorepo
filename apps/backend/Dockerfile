FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json .npmrc ./
COPY apps/backend/package.json apps/backend/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/monitor/package.json packages/monitor/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY apps/backend apps/backend
COPY packages packages
RUN DATABASE_URL=postgresql://roadbook:password@postgres:5432/roadbook pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
WORKDIR /app/apps/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]
