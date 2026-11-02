/**
 * Buzón TICE ↔ Sistema TICE (Google Apps Script, en la cuenta Gmail del buzón de la sede).
 *
 * Cada minuto:
 *  1) Lleva al sistema los correos nuevos del buzón. Un correo nuevo queda en "Correos por atender"
 *     (o se convierte solo en ticket si en Render está AUTO_TICKET_CORREO=true). Una respuesta con
 *     [TCK-2026-00012] en el asunto se une a su ticket.
 *  2) Envía desde este Gmail los correos que el sistema tiene por enviar (acuses, cambios de estado,
 *     respuestas del TICE). Así no hace falta SMTP, que Render gratis bloquea.
 *  3) Mantiene despierto el servicio gratuito de Render (se apaga a los 15 minutos sin visitas).
 *
 * Instalación: ver integraciones/gmail/README.md. Solo hay que llenar CONFIG y ejecutar instalar() una vez.
 */
const CONFIG = {
  URL: 'https://sistema-tice.onrender.com',        // dirección del sistema, sin / al final
  TOKEN: 'pegue-aqui-el-INBOUND_TOKEN-de-Render',    // el mismo valor de INBOUND_TOKEN en Render
  BUZON: 'tice.central@nslm.edu.pe',                  // buzón TICE de la sede (como está en Usuarios y sedes)
  NOMBRE: 'Área TICE · Sede Central',                 // nombre que verá el docente
  ETIQUETA: 'TICE/En el sistema',                     // etiqueta de Gmail para los correos ya llevados
};

function instalar() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(1).create();
  GmailApp.getUserLabelByName(CONFIG.ETIQUETA) || GmailApp.createLabel(CONFIG.ETIQUETA);
  sincronizar();
}

function sincronizar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // la ejecución anterior sigue en curso
  try {
    traerCorreos();
    enviarPendientes();
  } finally {
    lock.releaseLock();
  }
}

function llamar(metodo, ruta, cuerpo) {
  const r = UrlFetchApp.fetch(CONFIG.URL + ruta, {
    method: metodo,
    contentType: 'application/json',
    headers: { 'X-Inbound-Token': CONFIG.TOKEN },
    payload: cuerpo ? JSON.stringify(cuerpo) : undefined,
    muteHttpExceptions: true,
  });
  const codigo = r.getResponseCode();
  if (codigo === 503) throw new Error('El sistema está despertando; se reintenta en el próximo minuto');
  return { codigo, datos: codigo < 300 ? JSON.parse(r.getContentText() || 'null') : r.getContentText() };
}

// "Ana Pérez <ana.perez@nslm.edu.pe>" → { nombre, correo }
function remitente(texto) {
  const m = String(texto).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { nombre: m[1].trim() || null, correo: m[2].trim() } : { nombre: null, correo: String(texto).trim() };
}

function traerCorreos() {
  const etiqueta = GmailApp.getUserLabelByName(CONFIG.ETIQUETA) || GmailApp.createLabel(CONFIG.ETIQUETA);
  const hilos = GmailApp.search(`in:inbox is:unread -label:"${CONFIG.ETIQUETA}" newer_than:7d`, 0, 20);
  hilos.forEach((hilo) => {
    let todoBien = true;
    hilo.getMessages().filter((m) => m.isUnread()).forEach((m) => {
      const de = remitente(m.getFrom());
      if (de.correo.toLowerCase() === CONFIG.BUZON.toLowerCase()) { m.markRead(); return; } // los que envía el propio buzón
      const r = llamar('post', '/api/correos/entrante', {
        para: CONFIG.BUZON, de: de.correo, nombre: de.nombre, asunto: m.getSubject() || '(sin asunto)',
        cuerpo: m.getPlainBody() || '(sin texto)', fecha: m.getDate().toISOString(),
      });
      if (r.codigo === 201) m.markRead();
      else { todoBien = false; console.warn('No se llevó el correo', m.getSubject(), r.codigo, r.datos); }
    });
    if (todoBien) hilo.addLabel(etiqueta);
  });
}

function enviarPendientes() {
  const r = llamar('get', '/api/correos/salida');
  if (r.codigo !== 200) { console.warn('Bandeja de salida', r.codigo, r.datos); return; }
  r.datos.forEach((n) => {
    try {
      GmailApp.sendEmail(n.destinatario, n.asunto, n.cuerpo, { name: CONFIG.NOMBRE, replyTo: CONFIG.BUZON });
      llamar('post', `/api/correos/salida/${n.id}`, { ok: true });
    } catch (e) {
      llamar('post', `/api/correos/salida/${n.id}`, { ok: false, error: String(e.message || e) });
    }
  });
}
