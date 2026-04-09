# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and lockfile
COPY package.json package-lock.json ./

# Install all dependencies (npm ignores engine-strict by default)
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# REACT_APP_BACKEND_URL must be passed at build time
# Example: docker build --build-arg REACT_APP_BACKEND_URL=https://batutynas.lt .
ARG REACT_APP_BACKEND_URL
ARG REACT_APP_GOOGLE_MAPS_KEY
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_GOOGLE_MAPS_KEY=$REACT_APP_GOOGLE_MAPS_KEY
ENV NODE_ENV=production

RUN npm run build

# ── Stage 2: Serve with nginx ──────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Copy built React app
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
