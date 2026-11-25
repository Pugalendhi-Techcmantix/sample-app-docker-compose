#!/bin/sh
# Apply pending migrations, seed the default roles, then start the API.
# If the DB is not ready, migrate fails, the container exits, and compose restarts it.
set -e
node_modules/.bin/prisma db migrate --no-advance-ref
node prisma/seed.js
exec node src/server.js
