#!/bin/sh
set -e

echo "Running database migrations..."
cd /app && npx drizzle-kit migrate

echo "Starting application..."
exec node server.js
