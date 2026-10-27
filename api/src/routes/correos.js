// RF-10 Bandeja de correos del buzón TICE de cada sede
const express = require('express');
const { query, tx } = require('../db');
const { h, invalido, noEncontrado, HttpError } = require('../lib/errores');
const { sedeDeConsulta, verificarSede } = require('../lib/auth');
const { registrar } = require('../lib/bitacora');
const { texto, entero, correoValido, prioridadItil, dominioDe } = require('../lib/util');
const { dominiosCorreo } = require('../config');
const { proponerTicket } = require('../lib/propuesta');
const { crearTicket } = require('./incidencias');

const router = express.Router();

// Guarda un correo recibido en la bandeja de la sede dueña del buzón de destino
async function recibirCorreo(c, body, usuario) {
  const para = texto(body.para, 'para', { requerido: true, max: 150 }).toLowerCase();
  const de = texto(body.de, 'de', { requerido: true, max: 150 }).toLowerCase();
  if (!correoValido(de)) throw invalido('Remitente inválido');
  const { rows: [sede] } = await c.query('SELECT id, nombre FROM sedes WHERE lower(correo_buzon) = $1 AND activa', [para]);
  if (!sede) throw new HttpError(422, `El destinatario ${para} no es el buzón TICE de ninguna sede`);
  const { rows: [correo] } = await c.query(
    `INSERT INTO correos_entrantes (sede_id, remitente, remitente_nombre, asunto, cuerpo, recibido_en)
     VALUES ($1,$2,$3,$4,$5, coalesce($6::timestamptz, now())) RETURNING *`,
    [sede.id, de, texto(body.nombre, 'nombre', { max: 120 }), texto(body.asunto, 'asunto', { requerido: true, max: 250 }),
      texto(body.cuerpo, 'cuerpo', { requerido: true, max: 20000 }), body.fecha || null]);
  await registrar(c, usuario, {
    entidad: 'correo', entidadId: correo.id, accion: 'RECIBIR', sedeId: sede.id,
    detalle: { de, para, asunto: correo.asunto },
  });
  return correo;
}

// Webhook para el reenvío automático desde el buzón (protegido con INBOUND_TOKEN, sin sesión)
function rutaEntrante(config) {
  return h(async (req, res) => {
    if (!config.inboundToken || req.headers['x-inbound-token'] !== config.inboundToken) {
      throw new HttpError(401, 'Token de entrada inválido');
    }
    const correo = await tx((c) => recibirCorreo(c, req.body, null));
    res.status(201).json({ id: correo.id, sede_id: correo.sede_id });
  });
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
