# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://dummy@localhost/dummy"

RUN npm run build

# Copy instrumentation files into standalone output
# (Next.js standalone tracing omits instrumentation.js and its chunks)
#
# Copy if missing, then ASSERT THE POSTCONDITION. The old form's `|| true` made a
# failed copy indistinguishable from a successful one: shell precedence let the
# whole RUN succeed unconditionally, which is the exact mechanism that killed all
# four processors in production on 2026-08-08 while every test passed. Asserting
# the file's presence rather than the copy's exit status also stays correct if a
# future Next version fixes standalone tracing and emits the file itself.
# The brace group (not a subshell) is load-bearing: `exit 1` must terminate this
# RUN's shell immediately, because more commands follow it.
# This is a build-time guard; it complements rather than replaces the runtime
# detection /api/health provides.
#
# The isDirectory() branch in the nft walk below is NOT decorative. Adding
# @sentry/nextjs (phase 42) changed what instrumentation.js.nft.json enumerates:
# it now lists `../node_modules/import-in-the-middle-<hash>`, which Next emits as a
# DIRECTORY inside .next/. The original walk assumed every nft entry was a regular
# file and called copyFileSync unconditionally, so the first directory entry aborted
# the whole RUN with `EISDIR: illegal operation on a directory, copyfile` — after
# the postcondition above had already passed. Measured 2026-08-23: `docker compose
# build` failed at this step on merged master while `npm test` (4524), `tsc` and
# `eslint` were all green, because nothing in the test suite builds a container.
# import-in-the-middle is Sentry's ESM loader hook, so this will recur for any
# future dependency Next chooses to vendor as a directory rather than a file.
RUN test -f .next/standalone/.next/server/instrumentation.js \
      || cp .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js; \
    test -f .next/standalone/.next/server/instrumentation.js \
      || { echo "FATAL: instrumentation.js missing from standalone output" >&2; exit 1; }; \
    cp .next/server/instrumentation.js.map .next/standalone/.next/server/instrumentation.js.map 2>/dev/null || true; \
    if [ -f .next/server/instrumentation.js.nft.json ]; then \
      node -e " \
        const nft = require('./.next/server/instrumentation.js.nft.json'); \
        const fs = require('fs'); \
        const path = require('path'); \
        for (const f of nft.files || []) { \
          const src = path.join('.next/server', f); \
          const dst = path.join('.next/standalone/.next/server', f); \
          if (fs.existsSync(src) && !fs.existsSync(dst)) { \
            fs.mkdirSync(path.dirname(dst), { recursive: true }); \
            if (fs.statSync(src).isDirectory()) { \
              fs.cpSync(src, dst, { recursive: true }); \
            } else { \
              fs.copyFileSync(src, dst); \
            } \
            console.log('Copied instrumentation dep:', f); \
          } \
        } \
      "; \
    fi

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Pre-create the upload directory so the named volume mounted there is writable.
#
# Measured: a fresh named volume mounted at a path ABSENT from the image is created
# root:root 0755, and this container runs as uid 1001 — `touch: Permission denied`,
# i.e. every upload would return 500, which is strictly worse than the ephemeral-uploads
# defect it was meant to fix. Docker copies the image directory's ownership onto a new
# volume, so creating and chowning it HERE, in a layer still built as root and before
# `USER nextjs` below, is what makes the volume writable. After `USER nextjs` it cannot
# run at all. Runner stage only — the builder image is discarded and its ownership never
# reaches the volume.
#
# chown to the USER, not the group: `adduser` above has no `-G nodejs`, so nextjs's
# primary group is `nogroup` (measured gid=65533) and it is NOT a member of nodejs. A
# `chown root:nodejs` + `chmod g+w` fix does not work here, and widening the mode to
# world-writable (0777) is the wrong answer to the resulting EACCES — world-writable
# upload storage in a CRM is a tampering and disclosure surface, not a permissions
# convenience. The gate scans this stage as RAW TEXT, comments included, so it is
# deliberately spelled "0777" above rather than as the literal command form; reword
# prose on a collision, never relax the assertion.
#
# The path must stay equal to UPLOAD_DIR in docker-compose.yml; if they disagree the
# volume is mounted somewhere the app never writes and persistence silently reverts.
# src/lib/__tests__/compose-uploads-persistence.test.ts asserts both the equality and
# that this line precedes `USER nextjs`.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy files needed for migrations
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./docker-entrypoint.sh"]
