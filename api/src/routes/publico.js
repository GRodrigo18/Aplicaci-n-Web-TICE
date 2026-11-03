// Reporte de fallas por QR para docentes (sin cuenta en el sistema).
// El docente escanea la etiqueta del equipo, ve sus datos básicos e ingresa con su Google institucional:
// Google confirma quién es y el ticket se crea a su nombre con el equipo ya vinculado.
const express = require('express');
const config = require('../config');
const { query, tx } = require('../db');
const { h, invalido, HttpError } = require('../lib/errores');
const { registrar } = require('../lib/bitacora');
const { verificarTokenGoogle } = require('../lib/google');
const { texto, opcion, dominioDe } = require('../lib/util');
const { proponerTicket } = require('../lib/propuesta');
const { crearTicket } = require('./incidencias');

const router = express.Router();

const token = (v) => {
  const m = String(v || '').match(/^[a-f0-9]{24}$/i);
  if (!m) throw new HttpError(404, 'Etiqueta no reconocida');
  return m[0].toLowerCase();
};

// Solo lo que el docente necesita ver: qué equipo es y dónde está (nada de series, MAC ni proveedor)
async function equipoPublico(run, t) {
  const { rows: [e] } = await run(
    `SELECT e.id, e.codigo, e.marca, e.modelo, e.ubicacion, e.estado, e.sede_id, t.nombre AS tipo,
            s.nombre AS sede_nombre, s.correo_buzon AS buzon
       FROM equipos e JOIN tipos_equipo t ON t.id = e.tipo_id JOIN sedes s ON s.id = e.sede_id
      WHERE e.qr_token = $1`, [t]);
  if (!e) throw new HttpError(404, 'Etiqueta no reconocida');
  return e;
}

router.get('/equipos/:token', h(async (req, res) => {
  const e = await equipoPublico(query, token(req.params.token));
  const { rows: [{ n }] } = await query(
    `SELECT count(*)::int AS n FROM incidencias i JOIN incidencia_equipos ie ON ie.incidencia_id = i.id
      WHERE ie.equipo_id = $1 AND i.estado IN ('PENDIENTE', 'EN_PROCESO')`, [e.id]);
  const { id, sede_id, ...visible } = e;
  res.json({ ...visible, reportes_abiertos: n, google_client_id: config.googleClientId || null, dominios: config.qrSoloInstitucional ? config.dominiosCorreo : [] });
}));

// Urgencia: ¿la falla impide la clase ahora? Impacto: ¿a cuántos afecta?
const URGENCIA = { AHORA: 'ALTA', HOY: 'MEDIA', PUEDE_ESPERAR: 'BAJA' };
const IMPACTO = { TODOS: 'ALTO', VARIOS: 'MEDIO', SOLO_YO: 'BAJO' };

router.post('/equipos/:token/reportes', h(async (req, res) => {
  const t = token(req.params.token);
  if (!config.googleClientId) throw new HttpError(404, 'El reporte con Google no está activado; escriba al buzón TICE de la sede');
  const credencial = String(req.body?.credential || '');
  if (!credencial) throw invalido('Ingrese con su cuenta de Google');
  const descripcion = texto(req.body.descripcion, 'descripción', { requerido: true, max: 2000 });
  const cuando = opcion(req.body.cuando, '¿cuándo lo necesita?', Object.keys(URGENCIA));
  const aQuien = opcion(req.body.a_quien, '¿a quiénes afecta?', Object.keys(IMPACTO));
  const g = await verificarTokenGoogle(credencial, config.googleClientId);
  if (config.qrSoloInstitucional && !config.dominiosCorreo.includes(dominioDe(g.correo))) {
    throw new HttpError(403, `Use su cuenta institucional (@${config.dominiosCorreo.join(' o @')})`);
  }
  const resultado = await tx(async (c) => {
    const e = await equipoPublico((sql, p) => c.query(sql, p), t);
    if (e.estado === 'BAJA') throw new HttpError(410, `El equipo ${e.codigo} está dado de baja`);
    // si la misma persona ya reportó este equipo y sigue abierto, no se duplica
    const { rows: [previo] } = await c.query(
      `SELECT i.numero FROM incidencias i JOIN incidencia_equipos ie ON ie.incidencia_id = i.id
        WHERE ie.equipo_id = $1 AND i.estado IN ('PENDIENTE', 'EN_PROCESO') AND lower(i.solicitante_correo) = $2
        ORDER BY i.id DESC LIMIT 1`, [e.id, g.correo]);
    if (previo) return { numero: previo.numero, repetido: true };
    const asunto = `Falla en ${e.codigo} (${e.tipo}, ${e.ubicacion})`.slice(0, 250);
    const p = proponerTicket({ asunto: `${e.tipo} ${asunto}`, cuerpo: descripcion }, []);
    const ticket = await crearTicket(c, null, {
      solicitante_correo: g.correo, solicitante_nombre: g.nombre, asunto, descripcion,
      categoria: p.categoria === 'Otro' ? 'Hardware' : p.categoria,
      impacto: IMPACTO[aQuien], urgencia: URGENCIA[cuando], equipo_ids: [e.id],
    }, { sedeId: e.sede_id });
    await registrar(c, null, {
      entidad: 'incidencia', entidadId: ticket.id, accion: 'REPORTE_QR', sedeId: e.sede_id,
      detalle: { numero: ticket.numero, equipo: e.codigo, docente: g.correo },
    });
    return { numero: ticket.numero, prioridad: ticket.prioridad_nombre, sla_minutos: ticket.sla_minutos, repetido: false };
  });
  res.status(resultado.repetido ? 200 : 201).json({ ...resultado, correo: g.correo });
}));

module.exports = router;
