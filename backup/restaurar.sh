#!/bin/sh
# Restauración transaccional: todo el respaldo se aplica en una sola transacción o no se aplica nada.
# Uso: docker compose exec backup /restaurar.sh /respaldos/tice_AAAAMMDD_HHMM.dump
set -eu
[ -f "${1:-}" ] || { echo "Indique el archivo de respaldo"; ls -1 /respaldos; exit 1; }
export PGPASSWORD="$POSTGRES_PASSWORD"
echo "Se reemplazarán los datos actuales con $1. Detenga la API antes de continuar (docker compose stop api)."
psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pg_restore -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --exit-on-error "$1"
echo "Restauración completa. Inicie la API: docker compose start api"
