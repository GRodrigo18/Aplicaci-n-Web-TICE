# Sistema web TICE

Sistema web de inventario de equipos tecnológicos y gestión de incidencias del área TICE.
Proyecto de Práctica Preprofesional II — Rodrigo Javier Grados Alvarez.

| Capa | Tecnología |
| --- | --- |
| Presentación | React 18 + Vite + Tailwind, adaptable a celular, servida por Nginx (HTTP 8080 y HTTPS 8443) |
| Lógica de negocio | API REST en Node.js 22 + Express, autenticación JWT (8 h), bcrypt |
| Datos | PostgreSQL 16 con triggers (bitácora inmutable con cadena SHA-256, conteo de operaciones) |
| Despliegue | Docker Compose: `db`, `api`, `web` y `backup` (respaldo diario con `pg_dump`) |

## Instalación (Anexo 2)

Requisito: un servidor con Docker.

```bash
cp .env.example .env          # cambiar POSTGRES_PASSWORD y JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build  # la primera vez crea las tablas, los triggers y los catálogos
docker compose exec api node src/scripts/crear-director.js "Nombre del Director" director.ti@colegio.edu.pe "<clave segura>"
```

- Sistema: `http://<servidor>:8080` o `https://<servidor>:8443`. La cámara del celular solo lee QR con **HTTPS**.
  Si no se monta un certificado propio en el volumen `certificados` (`tls.crt` y `tls.key`), Nginx genera uno autofirmado
  y el navegador pedirá aceptarlo la primera vez.
- Datos de demostración (opcional, solo en una base vacía): `docker compose exec api npm run seed`.
  Crea 5 sedes, un TICE por sede, 92 equipos, 6 tickets y 3 correos. Contraseña de todas las cuentas: `Tice2026!`
  (Director: `director.ti@colegio.edu.pe`; TICE Sede Central: `tice.cen.usuario@colegio.edu.pe`).

### Respaldo y restauración (RNF-07)

El servicio `backup` ejecuta `pg_dump` todos los días a las 02:00, verifica que la copia sea legible con `pg_restore --list`
y borra las de más de 30 días. Las copias quedan en `./respaldos`.

```bash
docker compose exec backup /respaldo.sh ahora                       # respaldo manual
docker compose stop api
docker compose exec backup /restaurar.sh /respaldos/tice_20261027_0200.dump   # restauración en una sola transacción
docker compose start api
```

### Correo

- **Entrada (bandeja por sede):** cada sede tiene su buzón TICE (`correo_buzon`). Un reenvío automático del buzón
  puede publicar cada correo en `POST /api/correos/entrante` con la cabecera `X-Inbound-Token: <INBOUND_TOKEN>` y el cuerpo
  `{ "para", "de", "nombre", "asunto", "cuerpo" }`. Mientras no exista ese reenvío, el TICE registra el correo con
  "Registrar correo recibido".
- **Salida (acuse y avisos):** con `SMTP_HOST` configurado se envían por SMTP; sin él quedan en la bandeja de salida
  con estado `SIMULADO` (riesgo R08).

## Desarrollo

```bash
# PostgreSQL local con una base "tice" y otra "tice_test"
cd api && npm install && npm run seed && npm run dev        # API en :3000
cd web && npm install && npm run dev                        # web en :5173 (redirige /api a :3000)
cd api && npm test                                          # 22 pruebas CP-01 a CP-22 contra tice_test
```

Variables: `DATABASE_URL` (por defecto `postgres://tice:tice@localhost:5432/tice`) y `TEST_DATABASE_URL`
(por defecto `.../tice_test`). Las pruebas **borran y recrean** la base de prueba.

## Módulos y requerimientos

| Módulo | Requerimientos | Casos de uso | Pruebas |
| --- | --- | --- | --- |
| Inicio de sesión (JWT 8 h, bloqueo 15 min tras 5 intentos) | RF-01, RNF-01 | UC-01 | CP-01, CP-02, CP-13 |
| Usuarios y sedes (un solo TICE activo por sede) | RF-01 | UC-02 | CP-18 |
| Bitácora inmutable con cadena SHA-256 y verificación | RF-05, RNF-05 | UC-03 | CP-15, CP-16 |
| Inventario: registro, edición, baja lógica, filtros | RF-02, RF-07 | UC-04, UC-05, UC-06 | CP-03 a CP-06 |
| Exportación CSV (Director) | RF-08 | UC-12 | CP-12 |
| Etiquetas QR en A4 y pistoleo (identificar, auditar, trasladar) | RF-09 | UC-13 | CP-17 |
| Bandeja de correos por sede (convertir o descartar) | RF-10 | UC-07 | CP-19, CP-20 |
| Tickets con prioridad ITIL 4 y SLA, Kanban, solución | RF-03, RF-04 | UC-07, UC-08, UC-09 | CP-07 a CP-11 |
| Escalamiento ITIL 4 (niveles 1 a 3, alerta al 75 % del SLA, escalado automático) | RF-03 | UC-08 | CP-21, CP-22 |
| Acuse y avisos al solicitante (bandeja de salida) | RF-10 | UC-10 | CP-19 |
| Dashboard: MTTR, CSLA, DT, TEL, TAI | RF-06, RNF-02 | UC-11 | CP-14 |

### Escalamiento (ITIL 4)

| Nivel | Quién atiende | Cuándo llega el ticket |
| --- | --- | --- |
| N1 | TICE de la sede (asignado automáticamente) | Al registrarse el ticket |
| N2 | Coordinación General TICE / Director de TI (rol Director) | El TICE lo escala (funcional) o vence el SLA sin resolverse (jerárquico, automático) |
| N3 | Proveedor externo: garantía del fabricante, proveedor de internet, servicio técnico | El TICE o el Director lo escala indicando el proveedor y el número de caso |

- Al llegar al **75 % del SLA** sin resolverse, el sistema avisa por correo al nivel 2 y marca el ticket "en riesgo".
- Al **vencer el SLA** en el nivel 1, el ticket pasa solo al nivel 2 y se avisa al Director, que puede reasignarlo a otro TICE.
- El escalamiento solo sube de nivel, exige un motivo y queda en la bitácora (`ESCALAR`, `ALERTA_SLA`). En el nivel 3 se
  avisa además al solicitante. La revisión corre cada minuto (`ESCALAMIENTO_INTERVALO_MS`).
- Las bases creadas antes de esta versión se actualizan solas al iniciar la API (`api/db/escalamiento.sql`).

### Indicadores

- **MTTR** = promedio de (fecha de resolución − fecha de registro) de los tickets resueltos del periodo, en minutos.
- **CSLA** = tickets resueltos dentro del SLA de su prioridad ÷ tickets resueltos × 100 (Crítica 20 min, Alta 45, Media 120, Baja 480).
- **DT** = equipos operativos ÷ equipos activos × 100. Activos = sin los dados de baja; operativos = estado Operativo y sin ticket abierto.
- **TEL** = equipos leídos en el ambiente que indica el sistema ÷ equipos registrados de la sede al iniciar la auditoría × 100.
- **TAI** = días hábiles (lunes a viernes) desde el inicio hasta el fin de la auditoría, contando ambos días.

Las líneas base que aún no se midieron (TEL, CSLA, DT) se cargan en `.env` (`LB_TEL`, `LB_CSLA`, `LB_DT`) cuando se
tenga el pre-test; hasta entonces el dashboard muestra "por medir".

## Base de datos

15 tablas: `sedes`, `usuarios`, `tipos_equipo`, `estados_equipo`, `prioridades`, `estados_incidencia`, `equipos`,
`correos_entrantes`, `incidencias`, `incidencia_equipos`, `notificaciones`, `auditorias_inventario`, `auditoria_items`,
`logs_auditoria` y `operaciones_bd`. El esquema está en [`api/db/schema.sql`](api/db/schema.sql). Reglas que exige la base:

- Prioridad = matriz de impacto y urgencia (`CHECK prioridad = prioridad_itil(impacto, urgencia)`).
- Un ticket resuelto o cerrado debe tener solución y fecha de resolución.
- Código de equipo único por sede; baja solo con motivo; un TICE activo por sede; correo de usuario único.
- `logs_auditoria`: un trigger calcula la secuencia y el hash SHA-256 encadenado; otros triggers rechazan UPDATE, DELETE y TRUNCATE.
- `operaciones_bd`: triggers cuentan cada escritura en `equipos` e `incidencias`; la vista `operaciones_sin_bitacora`
  muestra las transacciones que escribieron sin dejar registro (por ejemplo, un cambio hecho por fuera del sistema).
