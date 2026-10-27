#!/bin/sh
# RNF-07: respaldo diario con pg_dump a las 02:00 (hora de Lima), verificación y retención de 30 días.
set -eu
DIR=/respaldos
HORA="${HORA_RESPALDO:-02:00}"
RETENCION="${DIAS_RETENCION:-30}"
export PGPASSWORD="$POSTGRES_PASSWORD"

respaldar() {
  archivo="$DIR/tice_$(date +%Y%m%d_%H%M).dump"
  pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$archivo.tmp"
  # una copia solo se acepta si pg_restore puede leerla
  if pg_restore --list "$archivo.tmp" > /dev/null; then
    mv "$archivo.tmp" "$archivo"
    echo "$(date '+%F %T') respaldo correcto: $archivo ($(du -h "$archivo" | cut -f1))"
  else
    rm -f "$archivo.tmp"
    echo "$(date '+%F %T') ERROR: el respaldo no es legible" >&2
  fi
  find "$DIR" -name 'tice_*.dump' -mtime +"$RETENCION" -delete
}

if [ "${1:-}" = "ahora" ]; then respaldar; exit 0; fi

echo "Respaldo programado todos los días a las $HORA; retención de $RETENCION días"
while true; do
  ahora=$(date +%s)
  objetivo=$(date -d "$(date +%F) $HORA" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M' -d "$(date +%F) $HORA" +%s)
  [ "$objetivo" -le "$ahora" ] && objetivo=$((objetivo + 86400))
  sleep $((objetivo - ahora))
  respaldar || true
done
