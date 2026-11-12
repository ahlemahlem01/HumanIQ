#!/bin/sh
set -e

# Apply pending migrations before serving traffic. Only one API instance should do this at a time.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
fi

exec "$@"
