# Build stage
FROM node:20-slim AS build
WORKDIR /app
# Enable corepack (pnpm)
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json ./
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
RUN pnpm i --frozen-lockfile=false
RUN pnpm prisma generate
COPY src ./src
RUN pnpm build

# Runtime stage
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json ./
RUN pnpm i --prod --frozen-lockfile=false
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
EXPOSE 3000
CMD ["node","dist/main.js"]
