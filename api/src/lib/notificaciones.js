// UC-10 Notificar por correo: los mensajes se guardan en una bandeja de salida y un proceso
// en segundo plano los envía, sin demorar el registro del ticket.
const nodemailer = require('nodemailer');
const config = require('../config');
const { query } = require('../db');

const ESTADOS = { PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', RESUELTO: 'Resuelto', CERRADO: 'Cerrado' };

async function encolar(c, ticket, tipo) {
  let asunto;
  let cuerpo;
  if (tipo === 'ACUSE') {
    asunto = `[${ticket.numero}] Recibimos su reporte: ${ticket.asunto}`;
    cuerpo = `Hola${ticket.solicitante_nombre ? ' ' + ticket.solicitante_nombre : ''}:\n\n`
      + `Registramos su reporte con el número ${ticket.numero}.\n`
      + `Prioridad: ${ticket.prioridad_nombre} (tiempo objetivo de atención: ${ticket.sla_minutos} minutos).\n`
      + `Estado: ${ESTADOS[ticket.estado]}.\n\nDescripción:\n${ticket.descripcion}\n\n`
      + 'Le avisaremos por este medio cada vez que cambie el estado.\n\nÁrea TICE';
  } else {
    asunto = `[${ticket.numero}] Su ticket pasó a ${ESTADOS[ticket.estado]}`;
    cuerpo = `Hola${ticket.solicitante_nombre ? ' ' + ticket.solicitante_nombre : ''}:\n\n`
      + `El ticket ${ticket.numero} (${ticket.asunto}) cambió al estado ${ESTADOS[ticket.estado]}.\n`
      + (ticket.estado === 'RESUELTO' && ticket.solucion ? `\nSolución aplicada:\n${ticket.solucion}\n\nSi el problema continúa, responda este correo.\n` : '')
      + '\nÁrea TICE';
  }
  await c.query(
    'INSERT INTO notificaciones (incidencia_id, destinatario, asunto, cuerpo) VALUES ($1,$2,$3,$4)',
    [ticket.id, ticket.solicitante_correo, asunto, cuerpo]);
}

// Aviso interno (nivel 2 de escalamiento) o al solicitante con un texto propio
async function encolarInterno(c, incidenciaId, destinatario, asunto, cuerpo) {
  await c.query(
    'INSERT INTO notificaciones (incidencia_id, destinatario, asunto, cuerpo) VALUES ($1,$2,$3,$4)',
    [incidenciaId, destinatario, asunto, cuerpo]);
}

let transporte = null;
function obtenerTransporte() {
  if (!config.smtp.host) return null;
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporte;
}

// Procesa la bandeja de salida. Sin servidor SMTP configurado, los correos quedan como simulados.
async function procesarPendientes(limite = 20) {
  const { rows } = await query(
    `SELECT * FROM notificaciones WHERE estado = 'PENDIENTE' OR (estado = 'ERROR' AND intentos < 3)
      ORDER BY id LIMIT $1`, [limite]);
  const t = obtenerTransporte();
  for (const n of rows) {
    if (!t) {
      await query(`UPDATE notificaciones SET estado='SIMULADO', enviado_en=now(), intentos=intentos+1 WHERE id=$1`, [n.id]);
      continue;
    }
    try {
      await t.sendMail({ from: config.smtp.from, to: n.destinatario, subject: n.asunto, text: n.cuerpo });
      await query(`UPDATE notificaciones SET estado='ENVIADO', enviado_en=now(), intentos=intentos+1, error=NULL WHERE id=$1`, [n.id]);
    } catch (err) {
      // el ticket sigue sin cambios; se registra el error y se reintenta hasta 3 veces
      await query(`UPDATE notificaciones SET estado='ERROR', intentos=intentos+1, error=$2 WHERE id=$1`, [n.id, String(err.message).slice(0, 500)]);
    }
  }
  return rows.length;
}

function iniciarProceso() {
  const tick = () => procesarPendientes().catch((err) => console.error('Notificaciones:', err.message));
  return setInterval(tick, config.notificacionesIntervaloMs);
}

module.exports = { encolar, encolarInterno, procesarPendientes, iniciarProceso };
