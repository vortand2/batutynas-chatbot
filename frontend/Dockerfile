# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Remove Emergent-specific dev package (not needed in production build)
RUN sed -i '/@emergentbase\/visual-edits/d' package.json

# Install all dependencies (devDeps needed for craco build)
RUN yarn install --no-frozen-lockfile

# Copy source
COPY . .

# REACT_APP_BACKEND_URL must be passed at build time
# Example: docker build --build-arg REACT_APP_BACKEND_URL=https://batutynas.lt .
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV NODE_ENV=production

RUN yarn build

# ── Stage 2: Serve with nginx ──────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Copy built React app
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
