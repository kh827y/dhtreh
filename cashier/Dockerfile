FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY cashier ./cashier
RUN pnpm i --frozen-lockfile=false --filter cashier...
RUN pnpm --filter cashier build

FROM node:20-slim
WORKDIR /app/cashier
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=build /app /app
EXPOSE 3000
ENV PORT=3000
CMD ["pnpm","start"]
