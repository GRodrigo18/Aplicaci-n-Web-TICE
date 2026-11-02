// RF-10 Bandeja de correos del buzón TICE de cada sede
const express = require('express');
const { query, tx } = require('../db');
const { h, invalido, noEncontrado, HttpError } = require('../lib/errores');
const { sedeDeConsulta, verificarSede } = require('../lib/auth');
const { registrar } = require('../lib/bitacora');
const { texto, entero, correoValido, prioridadItil, dominioDe } = require('../lib/util');
const config = require('../config');
const { dominiosCorreo } = config;
const { proponerTicket } = require('../lib/propuesta');
const { crearTicket } = require('./incidencias');

const router = express.Router();

// Quita del cuerpo de una respuesta el mensaje citado ("El lun., ... escribió:" / "On ... wrote:" / líneas con ">")
function sinCita(cuerpo) {
  const lineas = String(cuerpo).split(/\r?\n/);
  const corte = lineas.findIndex((l) => /^\s*(El .{3,120} escribi[oó]:|On .{3,120} wrote:|-{2,} ?Mensaje original|-{2,} ?Original Message|De: .+<.+@.+>)\s*$/i.test(l));
  const util = (corte > 0 ? lineas.slice(0, corte) : lineas).filter((l) => !/^\s*>/.test(l));
  const t = util.join('\n').trim();
  return t || String(cuerpo).trim();
}

const NUMERO_TICKET = /\b(TCK-\d{4}-\d{5})\b/i;

// Guarda un correo recibido en la bandeja de la sede dueña del buzón de destino.
// Si el asunto trae el número de un ticket de la sede ([TCK-2026-00012]), es una respuesta y se une a ese ticket.
async function recibirCorreo(c, body, usuario) {
  const para = texto(body.para, 'para', { requerido: true, max: 150 }).toLowerCase();
  const de = texto(body.de, 'de', { requerido: true, max: 150 }).toLowerCase();
  if (!correoValido(de)) throw invalido('Remitente inválido');
  const { rows: [sede] } = await c.query('SELECT id, nombre FROM sedes WHERE lower(correo_buzon) = $1 AND activa', [para]);
  if (!sede) throw new HttpError(422, `El destinatario ${para} no es el buzón TICE de ninguna sede`);
  const asunto = texto(body.asunto, 'asunto', { requerido: true, max: 250 });
  let cuerpo = texto(body.cuerpo, 'cuerpo', { requerido: true, max: 20000 });
  const m = asunto.match(NUMERO_TICKET);
  const { rows: [ticket] } = m
    ? await c.query('SELECT id, numero, estado FROM incidencias WHERE upper(numero) = $1 AND sede_id = $2', [m[1].toUpperCase(), sede.id])
    : { rows: [] };
  if (ticket) cuerpo = sinCita(cuerpo);
  const { rows: [correo] } = await c.query(
    `INSERT INTO correos_entrantes (sede_id, remitente, remitente_nombre, asunto, cuerpo, recibido_en, estado, incidencia_id, atendido_en)
     VALUES ($1,$2,$3,$4,$5, coalesce($6::timestamptz, now()), $7, $8, CASE WHEN $8::int IS NULL THEN NULL ELSE now() END) RETURNING *`,
    [sede.id, de, texto(body.nombre, 'nombre', { max: 120 }), asunto, cuerpo, body.fecha || null,
      ticket ? 'RESPUESTA' : 'POR_ATENDER', ticket?.id ?? null]);
  await registrar(c, usuario, {
    entidad: 'correo', entidadId: correo.id, accion: 'RECIBIR', sedeId: sede.id,
    detalle: { de, para, asunto: correo.asunto, ...(ticket ? { ticket: ticket.numero } : {}) },
  });
  if (ticket) {
    await registrar(c, usuario, {
      entidad: 'incidencia', entidadId: ticket.id, accion: 'CORREO_RECIBIDO', sedeId: sede.id,
      detalle: { numero: ticket.numero, de, mensaje: cuerpo.slice(0, 1000), estado_ticket: ticket.estado },
    });
  }
  return { ...correo, ticket_numero: ticket?.numero ?? null };
}

// Webhook para el reenvío automático desde el buzón (protegido con INBOUND_TOKEN, sin sesión)
function rutaEntrante(config) {
  return h(async (req, res) => {
    if (!config.inboundToken || req.headers['x-inbound-token'] !== config.inboundToken) {
      throw new HttpError(401, 'Token de entrada inválido');
    }
    const resultado = await tx(async (c) => {
      const correo = await recibirCorreo(c, req.body, null);
      // AUTO_TICKET_CORREO=true: un correo nuevo de una cuenta institucional se convierte solo en ticket con la propuesta
      if (config.autoTicketCorreo && correo.estado === 'POR_ATENDER' && dominiosCorreo.includes(dominioDe(correo.remitente))) {
        const { rows: equipos } = await c.query(
          `SELECT id, codigo, ubicacion FROM equipos WHERE sede_id = $1 AND estado <> 'BAJA'`, [correo.sede_id]);
        const p = proponerTicket(correo, equipos);
        const t = await crearTicket(c, null, { ...p, equipo_ids: p.equipos.map((e) => e.id) }, { sedeId: correo.sede_id, correoId: correo.id });
        await c.query(`UPDATE correos_entrantes SET estado='CONVERTIDO', atendido_en=now() WHERE id=$1`, [correo.id]);
        await registrar(c, null, {
          entidad: 'correo', entidadId: correo.id, accion: 'CONVERTIR', sedeId: correo.sede_id, detalle: { ticket: t.numero, automatico: true },
        });
        return { ...correo, estado: 'CONVERTIDO', ticket_numero: t.numero };
      }
      return correo;
    });
    res.status(201).json({ id: resultado.id, sede_id: resultado.sede_id, estado: resultado.estado, ticket: resultado.ticket_numero });
  });
}

// Bandeja de salida para el script del buzón (Google Apps Script en la cuenta Gmail del TICE).
// Render gratis bloquea el envío por SMTP; así los correos salen desde Gmail. Protegido con INBOUND_TOKEN.
function verificarToken(cfg, req) {
  if (!cfg.inboundToken || req.headers['x-inbound-token'] !== cfg.inboundToken) throw new HttpError(401, 'Token de entrada inválido');
}

function rutasSalida(cfg) {
  const r = express.Router();
  // Entrega hasta 20 correos por enviar y los marca ENVIANDO; si el script no confirma en 10 minutos, vuelven a la cola
  r.get('/', h(async (req, res) => {
    verificarToken(cfg, req);
    const { rows } = await query(
      `UPDATE notificaciones SET estado = 'ENVIANDO', tomado_en = now()
        WHERE id IN (SELECT id FROM notificaciones
                      WHERE estado = 'PENDIENTE' OR (estado = 'ERROR' AND intentos < 3)
                         OR (estado = 'ENVIANDO' AND tomado_en < now() - interval '10 minutes')
                      ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED)
        RETURNING id, destinatario, asunto, cuerpo`);
    res.json(rows.sort((a, b) => a.id - b.id));
  }));
  r.post('/:id', h(async (req, res) => {
    verificarToken(cfg, req);
    const id = entero(req.params.id, 'id', { requerido: true });
    const ok = req.body.ok === true;
    const { rowCount } = await query(
      `UPDATE notificaciones SET estado = $2::varchar, intentos = intentos + 1, enviado_en = CASE WHEN $2::varchar = 'ENVIADO' THEN now() END,
              error = $3 WHERE id = $1 AND estado = 'ENVIANDO'`,
      [id, ok ? 'ENVIADO' : 'ERROR', ok ? null : String(req.body.error || 'Error al enviar').slice(0, 500)]);
    if (!rowCount) throw noEncontrado('Correo por enviar');
    res.json({ ok: true });
  }));
  return r;
}

router.get('/', h(async (req, res) => {
  const params = [];
  const cond = [];
  const sede = sedeDeConsulta(req);
  if (sede) { params.push(sede); cond.push(`c.sede_id = $${params.length}`); }
  const estado = String(req.query.estado || 'POR_ATENDER').toUpperCase();
  if (estado !== 'TODOS') { params.push(estado); cond.push(`c.estado = $${params.length}`); }
  const { rows } = await query(
    `SELECT c.*, s.nombre AS sede_nombre, i.numero AS ticket_numero, i.id AS ticket_id
       FROM correos_entrantes c JOIN sedes s ON s.id = c.sede_id LEFT JOIN incidencias i ON i.correo_id = c.id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY c.recibido_en DESC LIMIT 300`, params);
  // remitentes fuera del dominio institucional: se muestran marcados para revisarlos antes de abrir un ticket
  res.json(rows.map((r) => ({ ...r, externo: !dominiosCorreo.includes(dominioDe(r.remitente)) })));
}));

// Registrar a mano un correo recibido (cuando el buzón aún no reenvía automáticamente)
router.post('/', h(async (req, res) => {
  const body = { ...req.body };
  if (req.usuario.rol === 'TICE') {
    const { rows: [s] } = await query('SELECT correo_buzon FROM sedes WHERE id = $1', [req.usuario.sede_id]);
    body.para = s.correo_buzon;
  }
  const correo = await tx((c) => recibirCorreo(c, body, req.usuario));
  res.status(201).json(correo);
}));

async function correoDeSede(c, id, usuario, bloquear = false) {
  const { rows: [correo] } = await c.query(
    `SELECT * FROM correos_entrantes WHERE id = $1 ${bloquear ? 'FOR UPDATE' : ''}`, [id]);
  if (!correo) throw noEncontrado('Correo');
  verificarSede(usuario, correo.sede_id);
  return correo;
}

router.get('/:id/propuesta', h(async (req, res) => {
  const correo = await correoDeSede({ query }, entero(req.params.id, 'id', { requerido: true }), req.usuario);
  const { rows: equipos } = await query(
    `SELECT id, codigo, ubicacion FROM equipos WHERE sede_id = $1 AND estado <> 'BAJA'`, [correo.sede_id]);
  const p = proponerTicket(correo, equipos);
  res.json({ correo, propuesta: { ...p, prioridad: prioridadItil(p.impacto, p.urgencia) } });
}));

router.post('/:id/convertir', h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const ticket = await tx(async (c) => {
    const correo = await correoDeSede(c, id, req.usuario, true);
    if (correo.estado !== 'POR_ATENDER') throw new HttpError(409, 'El correo ya fue atendido');
    const body = {
      solicitante_correo: correo.remitente,
      solicitante_nombre: correo.remitente_nombre,
      asunto: correo.asunto,
      descripcion: correo.cuerpo,
      ...req.body,
    };
    const t = await crearTicket(c, req.usuario, body, { sedeId: correo.sede_id, correoId: correo.id });
    await c.query(`UPDATE correos_entrantes SET estado='CONVERTIDO', atendido_en=now() WHERE id=$1`, [id]);
    await registrar(c, req.usuario, {
      entidad: 'correo', entidadId: id, accion: 'CONVERTIR', sedeId: correo.sede_id, detalle: { ticket: t.numero },
    });
    return t;
  });
  res.status(201).json(ticket);
}));

router.post('/:id/descartar', h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const motivo = texto(req.body.motivo, 'motivo', { requerido: true, max: 500 });
  const correo = await tx(async (c) => {
    const actual = await correoDeSede(c, id, req.usuario, true);
    if (actual.estado !== 'POR_ATENDER') throw new HttpError(409, 'El correo ya fue atendido');
    const { rows: [r] } = await c.query(
      `UPDATE correos_entrantes SET estado='DESCARTADO', motivo_descarte=$2, atendido_en=now() WHERE id=$1 RETURNING *`,
      [id, motivo]);
    await registrar(c, req.usuario, {
      entidad: 'correo', entidadId: id, accion: 'DESCARTAR', sedeId: actual.sede_id,
      detalle: { asunto: actual.asunto, motivo },
    });
    return r;
  });
  res.json(correo);
}));

module.exports = router;
module.exports.rutaEntrante = rutaEntrante;
module.exports.rutasSalida = rutasSalida;
module.exports.sinCita = sinCita;
