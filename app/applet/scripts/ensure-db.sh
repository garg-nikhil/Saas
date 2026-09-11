#!/bin/bash

# Check if postgres is already accepting connections on port 5432
if [ -x /usr/lib/postgresql/15/bin/pg_isready ] && /usr/lib/postgresql/15/bin/pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  exit 0
fi

# Ensure postgres user exists
if ! id -u postgres >/dev/null 2>&1; then
  useradd -m -s /bin/bash postgres >/dev/null 2>&1 || true
fi

# Ensure required runtime directories exist with correct permissions
mkdir -p /var/run/postgresql /tmp/pgdata /tmp/pgsocket
chown -R postgres:postgres /var/run/postgresql /tmp/pgdata /tmp/pgsocket 2>/dev/null || true
chmod 777 /tmp/pgsocket /var/run/postgresql 2>/dev/null || true

# Initialize database cluster if not initialized
if [ ! -f /tmp/pgdata/PG_VERSION ] && [ -x /usr/lib/postgresql/15/bin/initdb ]; then
  su postgres -c "/usr/lib/postgresql/15/bin/initdb -D /tmp/pgdata --auth-local=trust --auth-host=trust -E UTF8" >/dev/null 2>&1 || true
fi

# Start postgres server
if [ -x /usr/lib/postgresql/15/bin/pg_ctl ]; then
  su postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D /tmp/pgdata -l /tmp/pgdata/pg.log -o '-p 5432 -k /tmp' start" >/dev/null 2>&1 || true

  # Wait for postgres to be ready (up to 5 seconds)
  for i in {1..25}; do
    if /usr/lib/postgresql/15/bin/pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  # Ensure postgres user password and apply migrations
  /usr/lib/postgresql/15/bin/psql -h 127.0.0.1 -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null 2>&1 || true
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres" npx tsx database/migrate.ts >/dev/null 2>&1 || true
fi
