# LokshinEats API — production image.
#
# Host-agnostic on purpose: this runs the same on Cloud Run, Render, Fly or a
# plain VM. The only requirement is that the platform sets PORT and provides
# credentials (see the notes at the bottom).

# ---- Build stage ----------------------------------------------------------
# Dev dependencies live only here, so TypeScript and the test tooling never
# reach the shipped image.
FROM node:22-alpine AS build

WORKDIR /app

# Copied first so a dependency install is cached until the manifests change,
# rather than on every source edit.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Production dependencies only. `npm ci --omit=dev` reuses the lockfile, so the
# image gets exactly the versions that were tested.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run as an unprivileged user. The node image ships a `node` user for this.
USER node

# Cloud Run and most PaaS hosts inject PORT; config/env.ts reads it and falls
# back to 4000 for local use.
ENV PORT=8080
EXPOSE 8080

# No shell wrapper, so SIGTERM reaches Node directly and the graceful shutdown
# in index.ts actually runs instead of the platform killing a shell.
CMD ["node", "dist/index.js"]

# Required configuration at runtime:
#   FIREBASE_PROJECT_ID     the project holding Auth + Firestore
#   CORS_ORIGINS            comma-separated browser origins allowed to call this
#   PAYMENT_PROVIDER        "sandbox" until a live provider is chosen
#
# Credentials: on Cloud Run, attach a service account with Firestore access and
# leave the credential variables unset — Application Default Credentials are
# picked up automatically. Anywhere else, set FIREBASE_SERVICE_ACCOUNT_JSON to
# the service-account key. Never bake either into this image.
