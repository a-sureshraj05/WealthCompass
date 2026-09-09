# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────
# Stage 1 — build the SPA
# ─────────────────────────────────────────────────────────────────────
FROM node:22-slim AS frontend

WORKDIR /build

# package files first so `npm ci` is cached until dependencies actually change.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ─────────────────────────────────────────────────────────────────────
# Stage 2 — runtime
# ─────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend /build/dist ./frontend/dist

# ── Data-leak guard ──────────────────────────────────────────────────
# .dockerignore is supposed to keep all of this out of the build context. This
# asserts that it did. The check is here rather than in a comment because an
# image layer is public, immutable, and not deletable after the fact — by the
# time a mistake is noticed, it has already shipped.
#
# Belt-and-braces on purpose: .dockerignore is one edit away from being wrong,
# and this turns that edit into a failed build instead of a disclosure.
RUN set -eu; \
    leaked=""; \
    for path in \
        /app/db \
        /app/data \
        /app/config \
        /app/.env \
        /app/backend/app/api/archive \
    ; do \
        [ -e "$path" ] && leaked="$leaked $path"; \
    done; \
    found_db="$(find /app -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' 2>/dev/null | head -5)"; \
    if [ -n "$leaked" ] || [ -n "$found_db" ]; then \
        echo "BUILD REFUSED — local data or secrets reached the image:"; \
        for p in $leaked; do echo "    $p"; done; \
        for p in $found_db; do echo "    $p"; done; \
        echo "Fix .dockerignore. Nothing was pushed."; \
        exit 1; \
    fi; \
    echo "leak guard: clean — no databases, secrets, or personal config in image"

# ── Bake the demo database ───────────────────────────────────────────
# Runs AFTER the leak guard on purpose: the guard asserts no .db file came from
# the build context, and the only one that may exist in the image is the
# fabricated template created right here.
#
# Seeding at build time rather than at boot is what makes a cold start instant.
# On a free tier that sleeps after idle, a visitor would otherwise wait for the
# platform to wake the container AND for ~6s of seeding that calls out to
# Yahoo Finance for live quotes. Baked, the container is serving immediately.
#
# Prices in this file are as of build time. That is cosmetic — the app refreshes
# quotes on demand, and the periodic reset re-seeds live (see demo_reset.py).
RUN mkdir -p /app/seed \
    && WC_DEMO_MODE=true \
       DATABASE_URL=sqlite:////app/seed/demo.db \
       PYTHONPATH=/app \
       python -m backend.scripts.seed_demo --yes \
    && test -s /app/seed/demo.db \
    && echo "baked demo database: $(stat -c%s /app/seed/demo.db) bytes"

# ── Runtime configuration ────────────────────────────────────────────
# DATABASE_URL must be set explicitly. The application default is
# sqlite:///./db/wealthcompass.db, and seed_demo refuses any URL containing
# "wealthcompass.db" — so leaving it unset would fail the boot seed rather than
# silently run against a file named after the real database.
#
# The path is on the container's ephemeral filesystem, not a volume. That is
# deliberate: the demo cannot accumulate state across restarts, so there is
# nothing to leak, corrupt, or back up.
ENV WC_DEMO_MODE=true \
    DATABASE_URL=sqlite:////app/rundata/demo.db \
    WC_DEMO_TEMPLATE_DB=/app/seed/demo.db \
    WC_DEMO_RESET_MINUTES=720 \
    PYTHONPATH=/app

# Non-root. The app writes only to rundata/, which is chowned to match. The
# baked template stays root-owned and read-only — it is copied out of, never
# written to, so a bug that corrupted the running database still leaves a clean
# copy to restore from.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/rundata \
    && chown -R appuser:appuser /app/rundata \
    && chmod 0444 /app/seed/demo.db
USER appuser

EXPOSE 8000

# Restoring the baked database happens in the app's startup event
# (backend/app/core/demo_reset.py), not here, so a failure surfaces in
# application logs alongside everything else rather than in a separate script.
#
# Shell form so ${PORT} expands at runtime. Render, Koyeb and Cloud Run all
# inject the port they expect the container to listen on, and a hardcoded 8000
# fails their health checks. The default keeps `docker run -p 8899:8000` working
# unchanged for local testing.
#
# Single worker on purpose: prices.py serialises concurrent refreshes with a
# process-local threading.Lock, which a second worker would defeat and start
# duplicating holdings again.
CMD ["sh", "-c", "exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
