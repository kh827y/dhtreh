FROM node:20-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml .npmrc* ./ 2>/dev/null || true
RUN pnpm i --prod --frozen-lockfile=false
COPY src ./src
EXPOSE 18080
CMD ["node","src/index.js"]

