# Continuidad del sistema TICE: qué hacer si se cae

Sistema: https://sistema-tice.onrender.com · Servidor: Render (gratis) · Base: Supabase (gratis, us-west-2)

## Qué está protegido

| Riesgo | Protección |
| --- | --- |
| Un cambio con errores llega a producción | **CI** (`.github/workflows/ci.yml`): pruebas de la API, compilación de la web y la misma imagen de Render probada contra PostgreSQL. Render solo publica si pasa (*After CI Checks Pass*). |
| Render publica pero algo no funciona | **Despliegue** (`despliegue.yml`): espera a que Render sirva el commit nuevo y prueba página, API, base y Google. |
| El sistema se cae sin que nadie lo note | **Monitor** (`monitor.yml`): cada 10 min, lunes a sábado de 6:00 a 19:00 (Lima). Si falla, GitHub envía un correo. |
| El servicio gratis se duerme o Supabase se pausa (7 días sin uso) | El script de Gmail (cada minuto) y el Monitor (horario escolar) lo mantienen despierto. |
| Se pierden datos | **Respaldo** (`respaldo.yml`): todos los días a las 02:00, cifrado, 30 días en GitHub. Además *Base de datos → Descargar respaldo*. |
| Supabase no responde al arrancar | El servidor ya no se apaga: reintenta solo y la web muestra "se está preparando". |
| Supabase corta una conexión inactiva | Se registra en el log y se abre otra; antes podía tumbar el servidor. |
| Se cae la conexión con la sesión abierta | La web muestra un aviso, reintenta sola y **no cierra la sesión**. |

Para ver el estado: https://sistema-tice.onrender.com/api/salud (servidor) y `/api/salud/bd` (base de datos).

## Si el sistema no carga: diagnóstico en 5 minutos

1. **Espere 1 minuto y recargue.** En el plan gratis el servicio se duerme y tarda en despertar.
2. **Abra `/api/salud`.**
   - No carga o muestra una página de Render → el servicio está caído o suspendido: vaya al paso 3.
   - `"listo":false` → el servidor arrancó pero no llega a la base: vaya al paso 4.
   - `"listo":true` → el servidor está bien; abra `/api/salud/bd`. Si dice `sin conexión`, paso 4.
3. **Render** (https://dashboard.render.com → `sistema-tice`):
   - *Events*: ¿el último deploy dice **Deploy failed**? Abra *Logs*. Para volver a la versión anterior:
     *Events* → el último deploy correcto → **Rollback**.
   - Aviso de **horas gratis agotadas** (750 al mes por cuenta) o servicio **Suspended**: suspenda `visor-bd-tice`
     (*Settings → Suspend Web Service*) para que no consuma horas. Las horas se renuevan el día 1 de cada mes; si
     falta mucho, la salida inmediata es pasar `sistema-tice` a *Starter* (*Settings → Instance Type*).
   - Si nada de lo anterior: **Manual Deploy → Deploy latest commit**.
4. **Supabase** (https://supabase.com/dashboard → el proyecto):
   - Si dice **Paused**: botón **Restore project** (tarda unos minutos). Luego en Render: *Manual Deploy → Restart service*.
   - Si cambió la contraseña de la base: copie la nueva cadena de *Connect → Session pooler* en Render →
     *Environment* → `DATABASE_URL` y en GitHub → secreto `SUPABASE_DB_URL`.
5. **"Demasiadas solicitudes" al ingresar:** en Render → *Environment* agregue `RATE_LIMIT=off` (desactiva el límite
   mientras se revisa) y quítelo después.

Avise al Jefe de TI si la caída pasa de 30 minutos. Mientras tanto los docentes pueden reportar fallas por correo
al buzón TICE: el script de Gmail las convierte en tickets cuando el sistema vuelve.

## Configuración (una sola vez)

### GitHub: respaldo automático
1. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**.
2. Secreto `SUPABASE_DB_URL`: en Supabase **Connect → Session pooler**, copie la cadena y reemplace
   `[YOUR-PASSWORD]` por la contraseña de la base. Es la misma `DATABASE_URL` que tiene Render.
3. Secreto `RESPALDO_CLAVE`: una frase larga que invente (por ejemplo cinco palabras al azar).
   **Guárdela también fuera de GitHub** (el gestor de contraseñas del área o un sobre cerrado): sin ella el respaldo
   no se puede abrir.
4. Pruebe: **Actions → Respaldo → Run workflow**. Al terminar, el archivo `tice_AAAAMMDD_HHMM.dump.gpg` aparece
   al pie de la ejecución, en *Artifacts*.

El repositorio es público: cualquiera puede ver que existe el archivo, pero está cifrado con AES-256 y sin la clave
no se puede leer.

### GitHub: correos cuando algo falla
- **Settings** de su cuenta (no del repositorio) → **Notifications → Actions**: marque *Email* y
  *Only notify for failed workflows*.
- GitHub pausa los horarios (Monitor y Respaldo) si el repositorio pasa **60 días sin cambios**; le avisa por correo
  y se reactivan en *Actions → el flujo → Enable workflow*.
- Si algún día cambia la dirección del sistema: **Settings → Secrets and variables → Actions → Variables** →
  `URL_SISTEMA` con la nueva dirección.

### Render
1. `sistema-tice` → **Settings → Build & Deploy → Auto-Deploy**: elija **After CI Checks Pass**. Así un commit
   que rompe las pruebas no se publica. (Si el servicio está enlazado al Blueprint, `render.yaml` ya lo pide.)
2. En la misma página, **Health Check Path**: `/api/salud`.
3. **Settings → Notifications** (de la cuenta): active el correo para *Deploy failed* y *Service unhealthy*.

### Supabase
- **Organization → Settings → Billing/Usage**: revise de vez en cuando que la base esté lejos de 500 MB.
- El plan gratis no deja descargar los respaldos de Supabase; por eso existe el flujo *Respaldo* de GitHub.

## Restaurar un respaldo

En una PC con PostgreSQL 17 (cliente) y GnuPG:

```bash
gpg -d tice_AAAAMMDD_HHMM.dump.gpg > tice.dump        # pide RESPALDO_CLAVE
pg_restore --list tice.dump | head                     # comprobar que se lee
# en Render: Settings → Suspend Web Service (que nadie escriba mientras tanto)
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
  -d "postgresql://postgres.<ref>:<clave>@aws-0-us-west-2.pooler.supabase.com:5432/postgres" tice.dump
# en Render: Resume Web Service y abrir /api/salud/bd
```

Con `--single-transaction` se aplica todo o nada. Para practicar sin riesgo, restaure primero en un proyecto nuevo de
Supabase y abra sus tablas en el *Table Editor*.

## Pruebas de humo a mano

```bash
scripts/prueba-humo.sh https://sistema-tice.onrender.com
```

Comprueba que el sistema despierte, que la base responda, que el ingreso con Google esté activo, que la página cargue
y que la API pida sesión.
