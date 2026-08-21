# Образ приложения: API и воркер — один образ, разные команды запуска.
#
# Слоёв три, и разделены они ради одного: в конечном образе не должно быть
# ни компилятора, ни исходников, ни инструментов сборки. Всё, что нужно
# в работе, — собранный код, зависимости без dev и данные, которые компилятор
# не трогает: миграции, шаблоны ниш, разметка панели, шрифты.
#
# Debian slim, а не Alpine: разница в размере десятки мегабайт, а разница
# в поведении — musl против glibc, и ловится она не при сборке, а на первом
# редком пакете. Пилот не то место, где стоит экономить на этом.

# ── Сборка ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Зависимости отдельным слоем: он переиспользуется, пока не менялся package-lock,
# то есть почти всегда. Иначе каждая правка строчки кода тянет полную установку.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts/build-static.mjs ./scripts/build-static.mjs
RUN npm run build

# ── Зависимости для работы ──────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Образ ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./

# Миграции читаются с диска на старте, а не встроены в код.
COPY migrations ./migrations
# Конфигурации клиентов нужны команде `client apply`, а не самому серверу.
# Лежат в образе, чтобы заведение клиента делалось той же командой, что и локально.
COPY clients ./clients

# Файлы клиентов кладутся сюда, каталог монтируется томом.
# Владелец — node: процесс работает не от root, а писать в каталог обязан.
RUN mkdir -p /app/var/uploads && chown -R node:node /app/var
ENV STORAGE_DIR=/app/var/uploads
VOLUME ["/app/var/uploads"]

USER node
EXPOSE 3000

# Своя проверка живости: в slim нет ни curl, ни wget, а node есть по определению.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/engine/api/server.js"]
