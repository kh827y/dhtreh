FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY admin ./admin
RUN pnpm i --frozen-lockfile=false --filter admin...
RUN pnpm --filter admin build

FROM node:20-slim
WORKDIR /app/admin
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=build /app /app
EXPOSE 3001
ENV PORT=3001
CMD ["pnpm","start"]
