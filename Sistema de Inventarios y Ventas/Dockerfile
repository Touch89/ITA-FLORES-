# Production image (docker-compose.prod.yml). Multi-stage: the first stage builds the SPA with
# Vite (needs devDependencies), the final image only has dist/, server/ and production
# dependencies, and runs server/prod.mjs — no Vite dev server. For local development keep using
# Dockerfile.dev via docker-compose.yml.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/app/uploads
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
# Created here (owned by `node`) so the named volume mounted over it starts out writable by the app.
RUN mkdir -p uploads/articulos uploads/logos uploads/usuarios && chown -R node:node uploads
USER node
EXPOSE 3000
CMD ["node", "server/prod.mjs"]
