FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY prober/package.json prober/package-lock.json ./
RUN npm ci
COPY prober/tsconfig.json ./
COPY prober/src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=9091
COPY prober/package.json prober/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
USER node
EXPOSE 9091
CMD ["node", "dist/index.js"]
