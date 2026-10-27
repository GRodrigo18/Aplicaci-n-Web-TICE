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

### En la nube (Render, plan gratuito)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/GRodrigo18/Aplicaci-n-Web-TICE)

`render.yaml` crea una base PostgreSQL 16 y un servicio Docker (`Dockerfile.render`) en el que la API sirve también
la aplicación web, con `JWT_SECRET` generado y los datos de demostración (`DATOS_DEMO=true`, solo si la base está vacía).
En el plan gratuito el servicio se duerme tras 15 minutos sin uso (la primera visita tarda ~1 minuto) y la base
gratuita vence a los 30 días.

### Datos reales, dominio y Google

- **Pasar a datos reales:** el Director entra a *Base de datos → Pasar a datos reales* (solo aparece mientras la base
  tiene la demostración). Se borra todo y se crean la sede, el Jefe de TI y el TICE con una contraseña inicial.
- **Arrancar directamente con las cuentas reales (sin demostración):** en *Render → Environment* se ponen
  `CORREO_JEFE`, `CORREO_TICE` (y opcionalmente `NOMBRE_JEFE`, `NOMBRE_TICE`, `SEDE_CODIGO`=CEN, `SEDE_NOMBRE`=Sede
  Central). Al arrancar, si la base está vacía o tiene la demostración, se borra y quedan solo la sede y esas dos
  cuentas (Jefe de TI y TICE). Sin `CLAVE_INICIAL` la contraseña es aleatoria y se entra solo con Google
  (`GOOGLE_CLIENT_ID` es obligatorio en ese caso). Con `INVENTARIO_INICIAL` (ruta a un Excel accesible para el
  servidor, por ejemplo un volumen de Docker) se importa el inventario con las mismas reglas que *Importar Excel*; en
  Render el Excel se sube desde *Inventario → Importar Excel*, porque sus *Secret Files* solo admiten texto.
  Si la base ya tiene datos reales no se toca; si un correo no es del dominio no se instala nada. Los correos no van
  en el código porque el repositorio es público.
- **Inventario desde Excel:** el TICE usa *Inventario → Importar Excel* con el formato «INVENTARIO 2026»
  (CÓDIGO, CATEGORÍA, MARCA, MODELO, NÚMERO DE SERIE, CARACTERÍSTICAS, MAC, ESTADO ACTUAL, UBICACIÓN, RESPONSABLE,
  PROPIEDAD, FECHA DE INGRESO, GUIA/FACTURA, OBSERVACION, SEDE). Primero muestra la vista previa; las filas sin código
  completo, estado, ubicación, categoría reconocida o de otra sede se excluyen con su motivo. No se completa ningún dato.
- **Dominio:** `DOMINIOS_CORREO` (por defecto `nslm.edu.pe`) limita los correos de usuarios y buzones.
- **Iniciar sesión con Google:** crear un *ID de cliente OAuth* (aplicación web) en Google Cloud con el origen
  autorizado de la URL del sistema y ponerlo en `GOOGLE_CLIENT_ID`. Solo entran cuentas del dominio que estén
  registradas y activas en el sistema. Con `SOLO_GOOGLE=true` (y `GOOGLE_CLIENT_ID` puesto) se desactiva la
  contraseña y solo se entra con Google. La tabla de usuarios muestra el último ingreso de cada cuenta y si fue con
  contraseña o con Google.
- **Consulta SQL:** *Base de datos → Consulta SQL* ejecuta `SELECT` en una transacción de solo lectura (5 s, 500 filas).

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
cd api && npm test                                          # 29 pruebas CP-01 a CP-29 contra tice_test
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
| Dashboard: TRI, TAI, ICI, PIR, DT | RF-06, RNF-02 | UC-11 | CP-14, CP-28 |
| Importación del inventario desde Excel, correos del dominio, Google, roles | RF-01, RF-02 | UC-01, UC-04 | CP-23 a CP-27 |
| Respaldo diario (Docker) y descargable desde la web (.sql con pg_dump) | RNF-07 | — | CP-29 |

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

Los cinco KPI de la matriz vigente (27/10/2026), con su línea base del pre-test y su meta:

- **TRI** (base 240 min, meta ≤ 45) = promedio de (fecha de resolución − fecha de registro) de los tickets resueltos del periodo, en minutos.
- **TAI** (base 10 días hábiles, meta ≤ 3) = días hábiles (lunes a viernes) desde el inicio hasta el fin de la auditoría, contando ambos días.
- **ICI** (base 88,7 %, meta ≥ 98 %) = registros completos ÷ equipos activos × 100. Completo = código con correlativo, tipo,
  marca, modelo, número de serie, estado y ubicación.
- **PIR** (base 0 %, meta ≥ 95 %) = fallas recibidas por correo en el periodo que terminaron en un ticket con número,
  prioridad, SLA y fecha de cierre ÷ fallas recibidas por correo × 100. Los correos descartados con motivo no son fallas.
- **DT** (base 97,1 %, meta ≥ 95 %) = equipos operativos ÷ equipos activos × 100. Activos = sin los dados de baja;
  operativos = estado Operativo u Obsoleto (equipos que funcionan).

Las líneas base se pueden cambiar con `LB_TRI`, `LB_TAI`, `LB_ICI`, `LB_PIR` y `LB_DT`. El cumplimiento del SLA y el
porcentaje de equipos localizados en cada auditoría se siguen mostrando como datos de apoyo.

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

### Respaldo desde la web (Render + Supabase)

En Render no corre el servicio `backup` de Docker Compose. Por eso, en **Base de datos → Descargar respaldo** el Jefe de TI baja un archivo `.sql` con la estructura, los datos, los
triggers y las secuencias del esquema `public` (pg_dump). Cada descarga queda en la bitácora (`RESPALDO`). Para
restaurarlo, se ejecuta el archivo en una base vacía (por ejemplo, en el SQL Editor de un proyecto nuevo de Supabase o
con `psql "<cadena de conexión>" -f respaldo.sql`). La cadena de la bitácora se conserva igual. Conviene descargarlo al
final de cada día de trabajo y guardarlo fuera del servidor.

### Base de datos que no vence (Supabase)

La base gratuita de Render se borra a los 30 días. `DATABASE_URL` se define a mano en *sistema-tice → Environment*,
así que puede apuntar a otro PostgreSQL, por ejemplo un proyecto gratuito de Supabase. Use la cadena del
**Session pooler** (la conexión directa de Supabase es solo IPv6). Al arrancar con una base vacía el sistema crea
las tablas solo. El Table Editor y el SQL Editor de Supabase sirven para ver y editar los datos en la web.

### Administrador de la base de datos aparte (Adminer)

`render.yaml` crea el servicio `visor-bd-tice` con [Adminer](https://www.adminer.org/) (`Dockerfile.adminer`): una
página aparte del sistema para ver las tablas y su estructura, buscar, agregar, editar y borrar filas y hacer
consultas SQL. Se entra eligiendo *PostgreSQL* con el usuario, la contraseña y la base de `tice-db`
(*Connect → Internal* en Render). Los cambios hechos ahí no pasan por la API: no quedan en la bitácora y la
verificación de integridad muestra los de `equipos` e `incidencias` como operaciones sin bitácora. `logs_auditoria` no se puede modificar.
