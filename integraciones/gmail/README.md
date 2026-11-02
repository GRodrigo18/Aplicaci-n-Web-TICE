# Conectar el buzón TICE (Gmail) con el sistema

Con este script, el buzón de la sede (por ejemplo `tice.central@nslm.edu.pe`) trabaja junto al sistema sin configurar
SMTP ni reenvíos:

- **Entrada:** cada correo nuevo del buzón llega a *Mesa de ayuda → Correos por atender* (o se convierte solo en ticket
  con `AUTO_TICKET_CORREO=true`). Si el docente responde un correo del sistema, su respuesta llega **al mismo ticket**
  porque el asunto lleva el número (`[TCK-2026-00012]`).
- **Salida:** el acuse de recibo, los cambios de estado y las respuestas que el TICE escribe en el ticket salen desde
  este mismo Gmail. Render gratis bloquea el envío por SMTP, por eso se envían desde aquí.
- **Despierto:** como el script llama al sistema cada minuto, el servicio gratuito de Render no se apaga.

## Pasos (una sola vez, unos 10 minutos)

1. En Render → servicio `sistema-tice` → **Environment**, agregue:
   - `INBOUND_TOKEN`: una clave larga inventada (por ejemplo, genere una en <https://www.uuidgenerator.net/>).
   - `CORREO_SALIDA` = `gmail`
   - (opcional) `AUTO_TICKET_CORREO` = `true` para que cada correo de una cuenta @nslm.edu.pe se convierta solo en ticket.
   Guarde; Render reinicia el servicio.
2. Entre a <https://script.google.com> **con la cuenta del buzón** (la misma que recibe los reportes) → *Nuevo proyecto*.
3. Borre lo que trae el editor y pegue el contenido de [`Codigo.gs`](Codigo.gs).
4. Llene `CONFIG` arriba del archivo: la dirección del sistema, el `INBOUND_TOKEN` del paso 1, el buzón y el nombre.
5. Elija la función **`instalar`** en la barra de arriba y pulse **Ejecutar**. Google pedirá permisos para leer y enviar
   correo y para conectarse a internet: acepte (es su propia cuenta).
6. Listo. Envíe un correo de prueba al buzón desde otra cuenta del colegio y en un minuto aparecerá en el sistema.

Para ver qué hizo el script: en Apps Script → *Ejecuciones*. Para detenerlo: *Activadores* → borre el activador.

## Límites de Google

Una cuenta de Google Workspace puede enviar unos 1 500 correos al día desde Apps Script y hacer 100 000 llamadas
al día. Para una sede es de sobra: el script hace unas 3 000 llamadas al día.
