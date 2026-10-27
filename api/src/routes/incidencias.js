// RF-03, RF-04 — UC-07, UC-08, UC-09
const express = require('express');
const { query, tx } = require('../db');
const { h, invalido, noEncontrado, HttpError } = require('../lib/errores');
const { sedeDeConsulta, verificarSede, soloDirector, esDirector } = require('../lib/auth');
const { registrar } = require('../lib/bitacora');
const { texto, entero, opcion, correoValido, prioridadItil } = require('../lib/util');
const notificaciones = require('../lib/notificaciones');
const { NIVELES, escalar, avisarNivel2, ticketConSla } = require('../lib/escalamiento');

const router = express.Router();

const SELECT_TICKET = `
  SELECT i.*, p.nombre AS prioridad_nombre, p.sla_minutos, ei.nombre AS estado_nombre,
         s.nombre AS sede_nombre, u.nombre AS asignado_nombre,
         -- el SLA está en riesgo desde el 75 % del tiempo objetivo
         (i.estado IN ('PENDIENTE', 'EN_PROCESO')
          AND extract(epoch FROM (now() - i.fecha_registro)) / 60 >= p.sla_minutos * 0.75) AS sla_en_riesgo,
         -- minutos transcurridos hasta la resolución (o hasta ahora si sigue abierto)
         round(extract(epoch FROM (coalesce(i.fecha_resolucion, now()) - i.fecha_registro)) / 60)::int AS minutos,
         (extract(epoch FROM (coalesce(i.fecha_resolucion, now()) - i.fecha_registro)) / 60 > p.sla_minutos) AS fuera_de_sla,
         coalesce((SELECT json_agg(json_build_object('id', e.id, 'codigo', e.codigo, 'ubicacion', e.ubicacion) ORDER BY e.codigo)
                     FROM incidencia_equipos ie JOIN equipos e ON e.id = ie.equipo_id WHERE ie.incidencia_id = i.id), '[]') AS equipos
    FROM incidencias i
    JOIN prioridades p ON p.codigo = i.prioridad
    JOIN estados_incidencia ei ON ei.codigo = i.estado
    JOIN sedes s ON s.id = i.sede_id
    LEFT JOIN usuarios u ON u.id = i.asignado_a`;

const IMPACTOS = ['ALTO', 'MEDIO', 'BAJO'];
const URGENCIAS = ['ALTA', 'MEDIA', 'BAJA'];
const SIGUIENTE = { PENDIENTE: ['EN_PROCESO'], EN_PROCESO: ['RESUELTO'], RESUELTO: ['CERRADO'], CERRADO: [] };

async function ticketPorId(cOrQuery, id) {
  const run = cOrQuery.query ? cOrQuery.query.bind(cOrQuery) : query;
  const { rows: [t] } = await run(`${SELECT_TICKET} WHERE i.id = $1`, [id]);
  return t;
}

router.get('/', h(async (req, res) => {
  const cond = [];
  const params = [];
  const sede = sedeDeConsulta(req);
  if (sede) { params.push(sede); cond.push(`i.sede_id = $${params.length}`); }
  if (req.query.estado) { params.push(String(req.query.estado).toUpperCase()); cond.push(`i.estado = $${params.length}`); }
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    cond.push(`(i.numero ILIKE $${params.length} OR i.asunto ILIKE $${params.length} OR i.solicitante_correo ILIKE $${params.length})`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_TICKET} ${where} ORDER BY p.orden, i.fecha_registro LIMIT 500`, params);
  res.json(rows);
}));

router.get('/:id', h(async (req, res) => {
  const t = await ticketPorId(query, entero(req.params.id, 'id', { requerido: true }));
  if (!t) throw noEncontrado('Ticket');
  verificarSede(req.usuario, t.sede_id);
  const [historial, avisos] = await Promise.all([
    query(`SELECT fecha, usuario_correo, accion, detalle FROM logs_auditoria
            WHERE entidad = 'incidencia' AND entidad_id = $1 ORDER BY secuencia`, [t.id]),
    query('SELECT id, destinatario, asunto, estado, creado_en, enviado_en FROM notificaciones WHERE incidencia_id = $1 ORDER BY id', [t.id]),
  ]);
  res.json({ ...t, historial: historial.rows, notificaciones: avisos.rows });
}));

// Valida los equipos que se vinculan: deben existir y ser de la sede del ticket
async function validarEquipos(c, ids, sedeId) {
  const lista = [...new Set((ids || []).map((x) => entero(x, 'equipo')))];
  if (!lista.length) return [];
  const { rows } = await c.query('SELECT id, codigo, sede_id, estado FROM equipos WHERE id = ANY($1)', [lista]);
  if (rows.length !== lista.length) throw invalido('Alguno de los equipos no existe');
  const ajeno = rows.find((e) => e.sede_id !== sedeId);
  if (ajeno) throw invalido(`El equipo ${ajeno.codigo} pertenece a otra sede`);
  const baja = rows.find((e) => e.estado === 'BAJA');
  if (baja) throw invalido(`El equipo ${baja.codigo} está dado de baja`);
  return rows;
}

// Crea un ticket (desde el formulario o desde un correo de la bandeja) dentro de la transacción c
async function crearTicket(c, usuario, body, { sedeId, correoId = null }) {
  const datos = {
    solicitante_correo: texto(body.solicitante_correo, 'correo del solicitante', { requerido: true, max: 150 }).toLowerCase(),
    solicitante_nombre: texto(body.solicitante_nombre, 'nombre del solicitante', { max: 120 }),
    asunto: texto(body.asunto, 'asunto', { requerido: true, max: 250 }),
    descripcion: texto(body.descripcion, 'descripción', { requerido: true, max: 5000 }),
    categoria: texto(body.categoria, 'categoría', { requerido: true, max: 40 }),
    impacto: opcion(body.impacto, 'impacto', IMPACTOS),
    urgencia: opcion(body.urgencia, 'urgencia', URGENCIAS),
  };
  if (!correoValido(datos.solicitante_correo)) throw invalido('Correo del solicitante inválido', { campo: 'solicitante_correo' });
  const prioridad = prioridadItil(datos.impacto, datos.urgencia);
  if (body.prioridad && String(body.prioridad).toUpperCase() !== prioridad) {
    throw invalido(`La prioridad no corresponde a la matriz de impacto y urgencia: debe ser ${prioridad}`);
  }
  const equipos = await validarEquipos(c, body.equipo_ids, sedeId);
  // asignación automática al único TICE activo de la sede
  const { rows: [tice] } = await c.query(`SELECT id FROM usuarios WHERE rol='TICE' AND activo AND sede_id=$1`, [sedeId]);
  const { rows: [nuevo] } = await c.query(
    `INSERT INTO incidencias (sede_id, correo_id, solicitante_correo, solicitante_nombre, asunto, descripcion, categoria,
                              impacto, urgencia, prioridad, asignado_a)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [sedeId, correoId, datos.solicitante_correo, datos.solicitante_nombre, datos.asunto, datos.descripcion, datos.categoria,
      datos.impacto, datos.urgencia, prioridad, tice?.id ?? null]);
  for (const e of equipos) {
    await c.query('INSERT INTO incidencia_equipos (incidencia_id, equipo_id) VALUES ($1,$2)', [nuevo.id, e.id]);
  }
  const ticket = await ticketPorId(c, nuevo.id);
  await registrar(c, usuario, {
    entidad: 'incidencia', entidadId: ticket.id, accion: 'CREAR', sedeId,
    detalle: { numero: ticket.numero, ...datos, prioridad, sla_minutos: ticket.sla_minutos, equipos: equipos.map((e) => e.codigo), correo_id: correoId },
  });
  await notificaciones.encolar(c, ticket, 'ACUSE');
  return ticket;
}

// UC-07 Registrar ticket
router.post('/', h(async (req, res) => {
  const sedeId = esDirector(req.usuario) ? entero(req.body.sede_id, 'sede_id', { requerido: true }) : req.usuario.sede_id;
  const ticket = await tx((c) => crearTicket(c, req.usuario, req.body, { sedeId }));
  res.status(201).json(ticket);
}));

async function bloquearTicket(c, id, usuario) {
  const { rows: [t] } = await c.query('SELECT * FROM incidencias WHERE id = $1 FOR UPDATE', [id]);
  if (!t) throw noEncontrado('Ticket');
  verificarSede(usuario, t.sede_id);
  return t;
}

// UC-08 Cambiar estado (solo hacia adelante: Pendiente → En proceso → Resuelto → Cerrado)
router.patch('/:id/estado', h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const nuevo = opcion(req.body.estado, 'estado', Object.keys(SIGUIENTE));
  const ticket = await tx(async (c) => {
    const t = await bloquearTicket(c, id, req.usuario);
    if (t.estado === nuevo) throw invalido('El ticket ya está en ese estado');
    if (!SIGUIENTE[t.estado].includes(nuevo)) {
      if (['RESUELTO', 'CERRADO'].includes(t.estado)) {
        throw new HttpError(409, 'Un ticket resuelto o cerrado no puede volver a un estado anterior');
      }
      throw new HttpError(409, `No se puede pasar de ${t.estado} a ${nuevo}`);
    }
    if (nuevo === 'RESUELTO') throw invalido('Para resolver el ticket registre la solución técnica');
    const campoFecha = { EN_PROCESO: 'fecha_inicio', CERRADO: 'fecha_cierre' }[nuevo];
    await c.query(`UPDATE incidencias SET estado=$2, ${campoFecha}=now(), actualizado_en=now() WHERE id=$1`, [id, nuevo]);
    await registrar(c, req.usuario, {
      entidad: 'incidencia', entidadId: id, accion: 'CAMBIO_ESTADO', sedeId: t.sede_id,
      detalle: { numero: t.numero, cambios: { estado: { antes: t.estado, despues: nuevo } } },
    });
    const actualizado = await ticketPorId(c, id);
    await notificaciones.encolar(c, actualizado, 'ESTADO');
    return actualizado;
  });
  res.json(ticket);
}));

// UC-09 Registrar solución técnica (En proceso → Resuelto)
router.post('/:id/solucion', h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const solucion = texto(req.body.solucion, 'solución', { requerido: true, max: 5000 });
  const diagnostico = texto(req.body.diagnostico, 'diagnóstico', { max: 5000 });
  const ticket = await tx(async (c) => {
    const t = await bloquearTicket(c, id, req.usuario);
    if (t.estado !== 'EN_PROCESO') throw new HttpError(409, 'Solo se registra la solución de un ticket En proceso');
    await c.query(
      `UPDATE incidencias SET estado='RESUELTO', diagnostico=$2, solucion=$3, fecha_resolucion=now(), actualizado_en=now()
        WHERE id=$1`, [id, diagnostico, solucion]);
    // opcional: actualizar el estado de los equipos afectados
    const estadoEquipo = req.body.estado_equipo ? String(req.body.estado_equipo).toUpperCase() : null;
    if (estadoEquipo) {
      if (!['OPERATIVO', 'MANTENIMIENTO', 'AVERIADO'].includes(estadoEquipo)) throw invalido('Estado de equipo inválido');
      const { rows: eqs } = await c.query(
        `SELECT e.id, e.codigo, e.estado FROM equipos e JOIN incidencia_equipos ie ON ie.equipo_id = e.id
          WHERE ie.incidencia_id = $1 AND e.estado <> 'BAJA' FOR UPDATE OF e`, [id]);
      for (const e of eqs.filter((x) => x.estado !== estadoEquipo)) {
        await c.query('UPDATE equipos SET estado=$2, actualizado_en=now() WHERE id=$1', [e.id, estadoEquipo]);
        await registrar(c, req.usuario, {
          entidad: 'equipo', entidadId: e.id, accion: 'MODIFICAR', sedeId: t.sede_id,
          detalle: { codigo: e.codigo, ticket: t.numero, cambios: { estado: { antes: e.estado, despues: estadoEquipo } } },
        });
      }
    }
    const actualizado = await ticketPorId(c, id);
    await registrar(c, req.usuario, {
      entidad: 'incidencia', entidadId: id, accion: 'RESOLVER', sedeId: t.sede_id,
      detalle: { numero: t.numero, diagnostico, solucion, minutos: actualizado.minutos, dentro_de_sla: !actualizado.fuera_de_sla,
        cambios: { estado: { antes: 'EN_PROCESO', despues: 'RESUELTO' } } },
    });
    await notificaciones.encolar(c, actualizado, 'ESTADO');
    return actualizado;
  });
  res.json(ticket);
}));

// RF-04 Vincular equipos a un ticket abierto
router.post('/:id/equipos', h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const ticket = await tx(async (c) => {
    const t = await bloquearTicket(c, id, req.usuario);
    if (['RESUELTO', 'CERRADO'].includes(t.estado)) throw invalido('El ticket ya está resuelto');
    const equipos = await validarEquipos(c, req.body.equipo_ids, t.sede_id);
    if (!equipos.length) throw invalido('Indique al menos un equipo');
    const agregados = [];
    for (const e of equipos) {
      const r = await c.query(
        'INSERT INTO incidencia_equipos (incidencia_id, equipo_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, e.id]);
      if (r.rowCount) agregados.push(e.codigo);
    }
    // toca la fila para que la operación quede contada y registrada
    await c.query('UPDATE incidencias SET actualizado_en = now() WHERE id = $1', [id]);
    await registrar(c, req.usuario, {
      entidad: 'incidencia', entidadId: id, accion: 'VINCULAR_EQUIPOS', sedeId: t.sede_id,
      detalle: { numero: t.numero, equipos: agregados },
    });
    return ticketPorId(c, id);
  });
  res.json(ticket);
}));

// Escalamiento funcional (ITIL 4): sube el ticket al nivel 2 (Coordinación TICE / Director de TI)
// o al nivel 3 (proveedor externo). Solo hacia arriba y solo con el ticket abierto.
router.post('/:id/escalar', h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const nivel = entero(req.body.nivel, 'nivel', { requerido: true });
  const motivo = texto(req.body.motivo, 'motivo', { requerido: true, max: 1000 });
  const proveedor = texto(req.body.proveedor, 'proveedor', { max: 120 });
  const caso = texto(req.body.caso_proveedor, 'número de caso del proveedor', { max: 60 });
  if (![2, 3].includes(nivel)) throw invalido('El nivel de escalamiento debe ser 2 o 3');
  if (nivel === 3 && !proveedor) throw invalido('Para escalar al nivel 3 indique el proveedor externo', { campo: 'proveedor' });
  const ticket = await tx(async (c) => {
    const t = await bloquearTicket(c, id, req.usuario);
    if (!['PENDIENTE', 'EN_PROCESO'].includes(t.estado)) throw new HttpError(409, 'Solo se escala un ticket abierto');
    if (nivel <= t.nivel_escalamiento) {
      throw new HttpError(409, `El ticket ya está en el nivel ${t.nivel_escalamiento} (${NIVELES[t.nivel_escalamiento]})`);
    }
    await escalar(c, req.usuario, t, { nivel, motivo, proveedor, caso });
    const info = await ticketConSla(c, id);
    await avisarNivel2(c, info, `Escalado al nivel ${nivel}: ${NIVELES[nivel]}`, `Motivo: ${motivo}`
      + (proveedor ? `\nProveedor: ${proveedor}${caso ? ` (caso ${caso})` : ''}` : ''));
    if (nivel === 3) {
      await notificaciones.encolarInterno(c, id, t.solicitante_correo, `[${t.numero}] Su reporte fue derivado al proveedor`,
        `Hola${t.solicitante_nombre ? ' ' + t.solicitante_nombre : ''}:\n\nPara resolver el ticket ${t.numero} (${t.asunto}) `
        + `se requiere la atención de ${proveedor}. Le avisaremos cuando quede resuelto.\n\nÁrea TICE`);
    }
    return ticketPorId(c, id);
  });
  res.json(ticket);
}));

// El Director puede reasignar un ticket a otro TICE (apoyo de otra sede)
router.patch('/:id/asignar', soloDirector, h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const usuarioId = entero(req.body.usuario_id, 'usuario_id', { requerido: true });
  const ticket = await tx(async (c) => {
    const t = await bloquearTicket(c, id, req.usuario);
    const { rows: [u] } = await c.query(`SELECT id, nombre FROM usuarios WHERE id=$1 AND rol='TICE' AND activo`, [usuarioId]);
    if (!u) throw invalido('El usuario no es un TICE activo');
    await c.query('UPDATE incidencias SET asignado_a=$2, actualizado_en=now() WHERE id=$1', [id, usuarioId]);
    await registrar(c, req.usuario, {
      entidad: 'incidencia', entidadId: id, accion: 'REASIGNAR', sedeId: t.sede_id,
      detalle: { numero: t.numero, cambios: { asignado_a: { antes: t.asignado_a, despues: usuarioId } } },
    });
    return ticketPorId(c, id);
  });
  res.json(ticket);
}));

module.exports = router;
module.exports.crearTicket = crearTicket;
