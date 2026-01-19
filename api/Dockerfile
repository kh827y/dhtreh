# Build stage
FROM node:20-slim AS build
WORKDIR /app
# Enable corepack (pnpm)
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY api/package.json api/tsconfig*.json api/nest-cli.json ./api/
COPY api/prisma ./api/prisma
COPY api/src ./api/src
RUN pnpm i --frozen-lockfile=false --filter api...
RUN pnpm --filter api prisma generate
RUN pnpm --filter api build

# Runtime stage
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/
RUN pnpm i --prod --frozen-lockfile=false --filter api...
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/api/dist /app/api/dist
COPY api/prisma /app/api/prisma
WORKDIR /app/api
EXPOSE 3000
CMD ["node","dist/main.js"]
