FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml .npmrc* ./ 2>/dev/null || true
RUN pnpm i --frozen-lockfile=false
COPY . .
RUN pnpm build

FROM node:20-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=build /app .
EXPOSE 3003
ENV PORT=3003
CMD ["pnpm","start"]

