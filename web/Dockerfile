# Web Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
# Copy lock/manifests first for better layer caching
COPY web/package.json web/package-lock.json* web/pnpm-lock.yaml* web/yarn.lock* ./
RUN npm ci || npm i
# Copy only source (avoid copying any host node_modules if present)
COPY web/tsconfig*.json ./
COPY web/vite.config.ts ./
COPY web/eslint.config.js ./
COPY web/index.html ./
COPY web/public ./public
COPY web/src ./src
RUN npm run build

# Nginx static serve
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# Replace default server config to support history routing and caching
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
