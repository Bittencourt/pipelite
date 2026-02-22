#!/bin/sh
set -e

echo "Running database migrations..."
cd /app && npx drizzle-kit push --force

echo "Starting application..."
exec node server.js
