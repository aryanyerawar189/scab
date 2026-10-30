#!/usr/bin/env bash
# Test migrations before `npx supabase db push`: starts a throwaway Postgres + PostGIS,
# applies every file in supabase/migrations/ in order, then runs any SQL files you pass.
#
#   supabase/local-test/run.sh                 # apply all migrations
#   supabase/local-test/run.sh my-checks.sql   # …then run checks (errors are shown, not fatal)
#   supabase/local-test/run.sh stop            # stop and delete the database
#
# The database stays up on 127.0.0.1:54329 (user postgres, no password) until you stop it.
# Needs: brew install postgresql@18 postgis
set -euo pipefail

PGBIN=${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}
DIR=${SCAB_TEST_DIR:-${TMPDIR:-/tmp}/scab-local-test}
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGOPTIONS='-c client_min_messages=error'

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)

stop() {
  if [ -d "$DIR/data" ]; then "$PGBIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; fi
  rm -rf "$DIR"
}

if [ "${1:-}" = "stop" ]; then
  stop
  echo "Stopped and deleted the test database."
  exit 0
fi

stop
mkdir -p "$DIR"
"$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust -E UTF8 >/dev/null
# TCP only: the Unix socket path inside $TMPDIR can be too long on macOS
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PGPORT -k '' -c listen_addresses=127.0.0.1" -l "$DIR/log.txt" -w start >/dev/null

"$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -f "$here/stubs.sql" >/dev/null

for f in "$root"/supabase/migrations/*.sql; do
  # Supabase-only extensions aren't available locally (stubs.sql covers cron)
  grep -vE 'CREATE EXTENSION IF NOT EXISTS "(pg_cron|pg_stat_statements|supabase_vault)"' "$f" \
    | "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 --single-transaction -f - >/dev/null
  echo "applied $(basename "$f")"
done

for f in "$@"; do
  echo "== $f"
  "$PGBIN/psql" -X -q -f "$f"
done

echo "Test database running on 127.0.0.1:$PGPORT (user postgres). Stop it with: $0 stop"
