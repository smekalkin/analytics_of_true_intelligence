# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build

# Образ для запуска тестов (содержит dev-зависимости и исходники)
FROM deps AS test
COPY . .
CMD ["npm", "test"]

FROM node:22-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
# Миграции → сид (идемпотентный, пропускается, если данные уже есть) → API
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/database/seed.js && node dist/main.js"]
