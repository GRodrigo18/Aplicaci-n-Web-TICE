#!/bin/sh
# Si no se montó un certificado en /etc/nginx/certs, se genera uno autofirmado para HTTPS.
# La cámara del celular solo se abre en sitios con HTTPS (RNF-01, riesgo R07).
set -e
DIR=/etc/nginx/certs
if [ ! -f "$DIR/tls.crt" ] || [ ! -f "$DIR/tls.key" ]; then
  mkdir -p "$DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$DIR/tls.key" -out "$DIR/tls.crt" \
    -subj "/CN=${SERVER_NAME:-sistema-tice}" \
    -addext "subjectAltName=DNS:${SERVER_NAME:-sistema-tice},DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
  echo "Certificado autofirmado generado en $DIR"
fi
