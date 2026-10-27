# syntax=docker/dockerfile:1
#
# cantera-hub image (Postgres only; SQLite stays a local-dev feature).
#
# ONE image runs both roles:
#   - app:     default CMD (Next.js standalone server)
#   - migrate: `command: ["node_modules/.bin/tsx", "scripts/migrate.ts", "up"]`
#              (see docker-compose.yml), so users only pull a single tag.

FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Full dependencies for the build. --ignore-scripts skips the sqlite3 native
# build (optional, unused with DATABASE_URL) and the git-hooks `prepare` script;
# SWC/esbuild binaries come from optional platform packages, not scripts.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Production-only dependencies (includes tsx, needed by the migration runner).
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_COMPANY_NAME
ARG NEXT_PUBLIC_COMPANY_LOGO
ARG NEXT_PUBLIC_PRODUCT_NAME
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME \
    NEXT_PUBLIC_COMPANY_LOGO=$NEXT_PUBLIC_COMPANY_LOGO \
    NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Full production node_modules (superset of the traced standalone ones) so the
# same image can run the migration runner through tsx.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts/migrate.ts ./scripts/migrate.ts
COPY --chown=node:node lib/persistence/pgSsl.ts ./lib/persistence/pgSsl.ts
COPY --chown=node:node tsconfig.json ./tsconfig.json
USER node
EXPOSE 3000
CMD ["node", "server.js"]
