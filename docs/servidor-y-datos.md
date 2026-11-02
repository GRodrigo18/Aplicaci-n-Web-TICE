# Dónde alojar el sistema TICE y sus datos

**Recomendación corta:** hasta terminar las prácticas, seguir con **Render + Supabase gratis**, conectando el
**script de Gmail** (que además los mantiene despiertos) y descargando un respaldo cada semana. Para que el colegio lo use de
verdad, pasar a un **servidor propio del colegio con Docker**, publicado con **Cloudflare Tunnel** y con respaldo diario.
Así los datos quedan en el colegio, no hay pago mensual y nada se pausa.

## Las tres opciones

| | A. Render + Supabase gratis (actual) | B. Render + Supabase de pago | C. Servidor propio del colegio |
| --- | --- | --- | --- |
| Costo | S/ 0 | Aprox. US$ 7 + US$ 25 al mes (Render Starter + Supabase Pro; revisar precios vigentes) | S/ 0 al mes (una PC o servidor que ya exista, más luz e internet) |
| Dónde están los datos | Supabase, en EE. UU. (us-west-2) | Supabase, en EE. UU. | En el colegio |
| Siempre encendido | No: Render se apaga a los 15 min sin visitas y tarda ~1 min en despertar | Sí | Sí, si la PC está encendida y con UPS |
| Pausa de la base | Supabase pausa el proyecto tras 7 días sin uso | No | No |
| Espacio de la base | 500 MB (alcanza para años de inventario y tickets) | 8 GB | El disco de la PC |
| Correo | SMTP bloqueado en Render gratis → usar el script de Gmail | Script de Gmail o SMTP | Script de Gmail o SMTP |
| Respaldos | Manual: *Base de datos → Descargar respaldo (.sql)* | Diarios automáticos de Supabase | Diarios automáticos (servicio `backup` de Docker, 30 días) |
| Trabajo de mantenimiento | Ninguno | Ninguno | Actualizar Windows/Linux y vigilar el disco |

Fuentes: [Render: free web services no longer allow outbound SMTP](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports),
[Supabase: pausa de proyectos gratuitos](https://supabase.com/docs/guides/platform/free-project-pausing).

## Opción A (ahora): Render + Supabase gratis, bien configurado

1. Conectar el script de Gmail del buzón: [`integraciones/gmail`](../integraciones/gmail/README.md). Llama al sistema cada
   minuto, así que Render no se apaga y Supabase no llega a los 7 días sin uso. Además los correos salen de verdad.
2. Cada viernes, el Jefe de TI descarga el respaldo en *Base de datos → Descargar respaldo* y lo guarda en el Google
   Drive del área.
3. Ojo con las horas gratis de Render (750 al mes por cuenta): un servicio encendido todo el mes usa ~744. El visor
   `visor-bd-tice` (Adminer) también consume horas cuando se abre; si hace falta, suspéndalo en Render y use el
   *Table Editor* de Supabase.

## Opción C (producción): servidor propio del colegio

Lo que se necesita: una PC o servidor del área TICE con 4 GB de RAM o más, disco SSD, UPS, conectada por cable y
encendida siempre. Windows 10/11 con Docker Desktop o, mejor, Ubuntu Server con Docker.

1. **Instalar el sistema** (ya está preparado en el repositorio):
   ```bash
   git clone https://github.com/GRodrigo18/Aplicaci-n-Web-TICE.git sistema-tice && cd sistema-tice
   cp .env.example .env      # cambiar las claves; CORREO_SALIDA=gmail e INBOUND_TOKEN como en Render
   docker compose up -d --build
   ```
   Levanta PostgreSQL 16 (datos en el volumen `datos_db`), la API, la web con HTTPS y el respaldo diario a las 02:00.
2. **Traer los datos de Supabase:** descargar el `.sql` desde *Base de datos* en Render y cargarlo en la base vacía
   **antes** de iniciar la API:
   ```bash
   docker compose up -d db
   docker compose exec -T db psql -U tice -d tice < respaldo.sql
   docker compose up -d
   ```
3. **Publicarlo con HTTPS sin abrir puertos del router:** crear un túnel gratuito de Cloudflare
   (`cloudflared tunnel`) hacia `http://localhost:8080` con un subdominio, por ejemplo `tice.nslm.edu.pe` (lo crea quien
   administre el dominio). La cámara del celular necesita HTTPS para leer QR dentro del sistema; los QR impresos ya abren
   la ficha con cualquier cámara.
4. **Cambiar la dirección** en el script de Gmail (`CONFIG.URL`) y en el ID de Google (orígenes autorizados).
5. **Respaldo fuera del colegio:** copiar cada día la carpeta de respaldos a Google Drive (por ejemplo con `rclone`) para
   no perderlos si se daña el disco.
6. Apagar los servicios de Render y, cuando todo funcione una semana, pausar el proyecto de Supabase.

Ventajas para el informe: los datos de docentes y equipos quedan en el colegio (Ley 29733 de protección de datos
personales), sin costo mensual, sin pausas y con respaldo diario verificado (RNF-07).
