#!/usr/bin/env bash
# Prueba de humo del sistema TICE ya desplegado: comprueba que la página, la API y la base respondan.
# Uso: scripts/prueba-humo.sh https://sistema-tice.onrender.com [commit-esperado]
# Con el commit esperado, espera (hasta ESPERA_DESPLIEGUE_MIN minutos) a que Render sirva esa versión.
# Tolera que el servicio gratuito esté dormido: reintenta durante ESPERA_DESPERTAR_S segundos.
set -euo pipefail
BASE="${1:?Indique la URL del sistema}"
BASE="${BASE%/}"
ESPERADO="${2:-}"
ESPERA_DESPERTAR_S="${ESPERA_DESPERTAR_S:-180}"
ESPERA_DESPLIEGUE_MIN="${ESPERA_DESPLIEGUE_MIN:-20}"
REQUIERE_GOOGLE="${REQUIERE_GOOGLE:-true}"   # false en la prueba de la imagen en CI (sin GOOGLE_CLIENT_ID)
fallas=0

obtener() { curl -sS --max-time 60 -o /tmp/humo_cuerpo -w '%{http_code}' "$BASE$1" 2>/dev/null || echo 000; }
ok() { echo "✔ $1"; }
mal() { echo "✘ $1"; echo "::error::$1"; fallas=$((fallas + 1)); }

# 1) despertar: /api/salud responde 200 y el arranque terminó (listo=true)
fin=$((SECONDS + ESPERA_DESPERTAR_S))
until [ "$(obtener /api/salud)" = 200 ] && grep -q '"listo":true' /tmp/humo_cuerpo; do
  [ $SECONDS -ge $fin ] && { mal "El sistema no despertó en ${ESPERA_DESPERTAR_S} s (/api/salud: $(cat /tmp/humo_cuerpo 2>/dev/null | head -c 200))"; exit 1; }
  sleep 10
done
ok "/api/salud responde y el arranque terminó: $(cat /tmp/humo_cuerpo)"

# 2) versión desplegada (solo después de un push a main)
if [ -n "$ESPERADO" ]; then
  fin=$((SECONDS + ESPERA_DESPLIEGUE_MIN * 60))
  until [ "$(obtener /api/salud)" = 200 ] && grep -q "\"version\":\"${ESPERADO:0:12}\"" /tmp/humo_cuerpo && grep -q '"listo":true' /tmp/humo_cuerpo; do
    [ $SECONDS -ge $fin ] && { mal "Render no publicó ${ESPERADO:0:12} en ${ESPERA_DESPLIEGUE_MIN} min (sirve: $(head -c 200 /tmp/humo_cuerpo))"; exit 1; }
    sleep 20
  done
  ok "Render sirve la versión ${ESPERADO:0:12}"
fi

# 3) base de datos
c=$(obtener /api/salud/bd)
[ "$c" = 200 ] && ok "La base de datos responde: $(cat /tmp/humo_cuerpo)" || mal "La base de datos no responde (HTTP $c): $(head -c 200 /tmp/humo_cuerpo)"

# 4) pantalla de ingreso: configuración y Google
c=$(obtener /api/auth/config)
if [ "$c" = 200 ]; then
  { [ "$REQUIERE_GOOGLE" != true ] || grep -q '"google_client_id":"[^"]' /tmp/humo_cuerpo; } && ok "/api/auth/config responde" \
    || mal "/api/auth/config responde pero sin GOOGLE_CLIENT_ID (nadie podría ingresar con Google)"
else
  mal "/api/auth/config devolvió HTTP $c: $(head -c 200 /tmp/humo_cuerpo)"
fi

# 5) la aplicación web carga (HTML con el contenedor de React) y una ruta interna también
for ruta in / /inventario; do
  c=$(obtener "$ruta")
  [ "$c" = 200 ] && grep -q 'id="root"' /tmp/humo_cuerpo && ok "La página $ruta carga" || mal "La página $ruta no carga (HTTP $c)"
done

# 6) la API protege los datos: sin sesión devuelve 401, no 500
c=$(obtener /api/equipos)
[ "$c" = 401 ] && ok "La API pide sesión (401) sin errores internos" || mal "/api/equipos sin sesión devolvió HTTP $c (se esperaba 401)"

[ $fallas -eq 0 ] && echo "Prueba de humo correcta" || { echo "Prueba de humo con $fallas falla(s)"; exit 1; }
