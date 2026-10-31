#!/bin/sh
set -eu
: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD}"
# Runs once for a new volume. Never expand SQL or credentials in the shell.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_DB_PASSWORD
CREATE ROLE cognexus_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
GRANT CONNECT ON DATABASE cognexus TO cognexus_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO cognexus_app;
SQL
