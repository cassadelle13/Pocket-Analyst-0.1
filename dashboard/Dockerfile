FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --prefer-offline --no-audit

FROM node:20-alpine AS builder
WORKDIR /app

ARG CLICKHOUSE_HOST
ARG CLICKHOUSE_DATABASE
ARG DATATALK_AGENT_URL
ARG DATATALK_AGENT_SHARED_SECRET

ENV CLICKHOUSE_HOST=$CLICKHOUSE_HOST
ENV CLICKHOUSE_DATABASE=$CLICKHOUSE_DATABASE
ENV DATATALK_AGENT_URL=$DATATALK_AGENT_URL
ENV DATATALK_AGENT_SHARED_SECRET=$DATATALK_AGENT_SHARED_SECRET

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
