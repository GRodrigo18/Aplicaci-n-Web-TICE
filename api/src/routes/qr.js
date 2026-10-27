// RF-09 / UC-13 Pistolear equipo por código QR: identificar, auditar y trasladar
const express = require('express');
const { query, tx } = require('../db');
const { h, invalido, noEncontrado, HttpError, prohibido } = require('../lib/errores');
const { soloTice, esDirector } = require('../lib/auth');
const { registrar } = require('../lib/bitacora');
const { texto, entero, diasHabiles } = require('../lib/util');

const router = express.Router();

// La etiqueta contiene "TICE:<token>"; la pistola lectora la escribe como teclado
function leerToken(lectura) {
  const m = String(lectura || '').match(/([a-f0-9]{24})/i);
  if (!m) throw new HttpError(422, 'La etiqueta no pertenece al sistema TICE');
  return m[1].toLowerCase();
}

// Busca el equipo de una lectura; rechaza etiquetas ajenas o de otra sede
const SELECT_LECTURA = `SELECT e.*, t.nombre AS tipo, ee.nombre AS estado_nombre, s.nombre AS sede_nombre
       FROM equipos e JOIN tipos_equipo t ON t.id = e.tipo_id JOIN estados_equipo ee ON ee.codigo = e.estado
       JOIN sedes s ON s.id = e.sede_id`;

// Si la etiqueta está dañada, el TICE puede escribir el código del equipo (p. ej. SC-PC-0001)
async function equipoPorCodigo(c, lectura, usuario) {
  const codigo = String(lectura || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(codigo)) throw new HttpError(422, 'La etiqueta no pertenece al sistema TICE');
  const { rows } = await c.query(`${SELECT_LECTURA} WHERE upper(e.codigo) = $1 AND ($2::int IS NULL OR e.sede_id = $2)`,
    [codigo, esDirector(usuario) ? null : usuario.sede_id]);
  if (!rows.length) throw new HttpError(422, `No hay un equipo con el código ${codigo} en su sede`);
  if (rows.length > 1) throw new HttpError(422, `El código ${codigo} existe en varias sedes; lea la etiqueta QR`);
  return rows[0];
}

async function equipoDeLectura(c, lectura, usuario) {
  if (!/[a-f0-9]{24}/i.test(String(lectura || ''))) return equipoPorCodigo(c, lectura, usuario);
  const token = leerToken(lectura);
  const { rows: [e] } = await c.query(`${SELECT_LECTURA} WHERE e.qr_token = $1`, [token]);
  if (!e) throw new HttpError(422, 'La etiqueta no pertenece al sistema TICE');
  if (!esDirector(usuario) && e.sede_id !== usuario.sede_id) {
    throw new HttpError(422, `La etiqueta es de otra sede (${e.sede_nombre})`);
  }
  return e;
}

// Modo Identificar: muestra la ficha y deja la lectura en la bitácora
router.post('/identificar', h(async (req, res) => {
  const equipo = await tx(async (c) => {
    const e = await equipoDeLectura(c, req.body.lectura, req.usuario);
    await registrar(c, req.usuario, {
      entidad: 'equipo', entidadId: e.id, accion: 'LECTURA_QR', sedeId: e.sede_id, detalle: { codigo: e.codigo },
    });
    return e;
  });
  const [{ rows: tickets }, { rows: historial }] = await Promise.all([
    query(`SELECT i.id, i.numero, i.asunto, i.prioridad, i.estado, i.fecha_registro FROM incidencias i
             JOIN incidencia_equipos ie ON ie.incidencia_id = i.id WHERE ie.equipo_id = $1 ORDER BY i.fecha_registro DESC LIMIT 10`,
    [equipo.id]),
    query(`SELECT l.fecha, l.usuario_correo, u.nombre AS usuario_nombre, l.accion, l.detalle
             FROM logs_auditoria l LEFT JOIN usuarios u ON u.id = l.usuario_id
            WHERE l.entidad = 'equipo' AND l.entidad_id = $1 AND l.accion <> 'LECTURA_QR' ORDER BY l.secuencia DESC LIMIT 50`, [equipo.id]),
  ]);
  res.json({ ...equipo, tickets, historial });
}));

// Modo Traslado: varios equipos leídos se mueven juntos a un nuevo ambiente
router.post('/traslado', soloTice, h(async (req, res) => {
  const destino = texto(req.body.ubicacion, 'ubicacion', { requerido: true, max: 80 });
  const lecturas = Array.isArray(req.body.lecturas) ? req.body.lecturas : [];
  if (!lecturas.length) throw invalido('Lea al menos un equipo');
  const movidos = await tx(async (c) => {
    const vistos = new Set();
    const lista = [];
    for (const l of lecturas) {
      const e = await equipoDeLectura(c, l, req.usuario);
      if (vistos.has(e.id)) continue;
      vistos.add(e.id);
      if (e.estado === 'BAJA') throw invalido(`El equipo ${e.codigo} está dado de baja`);
      await c.query('UPDATE equipos SET ubicacion = $2, actualizado_en = now() WHERE id = $1', [e.id, destino]);
      await registrar(c, req.usuario, {
        entidad: 'equipo', entidadId: e.id, accion: 'TRASLADO', sedeId: e.sede_id,
        detalle: { codigo: e.codigo, cambios: { ubicacion: { antes: e.ubicacion, despues: destino } } },
      });
      lista.push({ id: e.id, codigo: e.codigo, desde: e.ubicacion, hacia: destino });
    }
    return lista;
  });
  res.json({ trasladados: movidos.length, equipos: movidos });
}));

// ------------------------------------------------------------------
// Auditoría física del inventario de la sede (equipos localizados y TAI)
// ------------------------------------------------------------------
async function auditoriaConDetalle(id, usuario) {
  const { rows: [a] } = await query(
    `SELECT a.*, s.nombre AS sede_nombre, u.nombre AS usuario_nombre FROM auditorias_inventario a
       JOIN sedes s ON s.id = a.sede_id JOIN usuarios u ON u.id = a.usuario_id WHERE a.id = $1`, [id]);
  if (!a) throw noEncontrado('Auditoría');
  if (!esDirector(usuario) && a.sede_id !== usuario.sede_id) throw prohibido('La auditoría es de otra sede');
  const { rows: items } = await query(
    `SELECT ai.*, e.codigo, t.nombre AS tipo, e.marca FROM auditoria_items ai
       JOIN equipos e ON e.id = ai.equipo_id JOIN tipos_equipo t ON t.id = e.tipo_id
      WHERE ai.auditoria_id = $1 ORDER BY ai.leido_en DESC`, [id]);
  // faltantes: equipos activos de la sede (al inicio) que no se leyeron
  const { rows: faltantes } = await query(
    `SELECT e.id, e.codigo, t.nombre AS tipo, e.marca, e.ubicacion FROM equipos e JOIN tipos_equipo t ON t.id = e.tipo_id
      WHERE e.sede_id = $1 AND e.creado_en <= $2 AND (e.estado <> 'BAJA' OR e.fecha_baja > $2)
        AND NOT EXISTS (SELECT 1 FROM auditoria_items ai WHERE ai.auditoria_id = $3 AND ai.equipo_id = e.id)
      ORDER BY e.ubicacion, e.codigo`, [a.sede_id, a.fecha_inicio, id]);
  return { ...a, items, faltantes };
}

router.get('/auditorias', h(async (req, res) => {
  const params = [];
  let where = '';
  if (!esDirector(req.usuario)) { params.push(req.usuario.sede_id); where = 'WHERE a.sede_id = $1'; }
  else if (req.query.sede_id) { params.push(entero(req.query.sede_id, 'sede_id')); where = 'WHERE a.sede_id = $1'; }
  const { rows } = await query(
    `SELECT a.*, s.nombre AS sede_nombre, u.nombre AS usuario_nombre,
            (SELECT count(*) FROM auditoria_items ai WHERE ai.auditoria_id = a.id)::int AS leidos
       FROM auditorias_inventario a JOIN sedes s ON s.id = a.sede_id JOIN usuarios u ON u.id = a.usuario_id
      ${where} ORDER BY a.fecha_inicio DESC`, params);
  res.json(rows);
}));

router.get('/auditorias/:id', h(async (req, res) => {
  res.json(await auditoriaConDetalle(entero(req.params.id, 'id', { requerido: true }), req.usuario));
}));

router.post('/auditorias', soloTice, h(async (req, res) => {
  const sedeId = req.usuario.sede_id;
  const a = await tx(async (c) => {
    const { rows: [{ n }] } = await c.query(
      `SELECT count(*)::int AS n FROM equipos WHERE sede_id = $1 AND estado <> 'BAJA'`, [sedeId]);
    if (!n) throw invalido('La sede no tiene equipos registrados para auditar');
    const { rows: [nueva] } = await c.query(
      `INSERT INTO auditorias_inventario (sede_id, usuario_id, equipos_esperados) VALUES ($1,$2,$3) RETURNING *`,
      [sedeId, req.usuario.id, n]).catch((err) => {
      if (err.code === '23505') throw new HttpError(409, 'Ya hay una auditoría en curso en la sede');
      throw err;
    });
    await registrar(c, req.usuario, {
      entidad: 'auditoria', entidadId: nueva.id, accion: 'INICIAR', detalle: { equipos_esperados: n },
    });
    return nueva;
  });
  res.status(201).json(a);
}));

// Cada lectura marca el equipo como verificado; si estaba en otro ambiente, corrige su ubicación
router.post('/auditorias/:id/lectura', soloTice, h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const ambiente = texto(req.body.ambiente, 'ambiente', { requerido: true, max: 80 });
  const item = await tx(async (c) => {
    const { rows: [a] } = await c.query('SELECT * FROM auditorias_inventario WHERE id = $1 FOR UPDATE', [id]);
    if (!a) throw noEncontrado('Auditoría');
    if (a.sede_id !== req.usuario.sede_id) throw prohibido('La auditoría es de otra sede');
    if (a.estado !== 'EN_CURSO') throw invalido('La auditoría ya finalizó');
    const e = await equipoDeLectura(c, req.body.lectura, req.usuario);
    if (e.estado === 'BAJA') throw invalido(`El equipo ${e.codigo} está dado de baja`);
    const { rows: ya } = await c.query('SELECT 1 FROM auditoria_items WHERE auditoria_id = $1 AND equipo_id = $2', [id, e.id]);
    if (ya.length) throw new HttpError(409, `El equipo ${e.codigo} ya fue verificado en esta auditoría`);
    const coincide = e.ubicacion.trim().toLowerCase() === ambiente.toLowerCase();
    const resultado = coincide ? 'ENCONTRADO' : 'REUBICADO';
    const { rows: [it] } = await c.query(
      `INSERT INTO auditoria_items (auditoria_id, equipo_id, ambiente, ubicacion_anterior, resultado)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`, [id, e.id, ambiente, e.ubicacion, resultado]);
    await c.query(
      `UPDATE equipos SET ultima_verificacion = now(), ubicacion = $2, actualizado_en = now() WHERE id = $1`,
      [e.id, coincide ? e.ubicacion : ambiente]);
    await registrar(c, req.usuario, {
      entidad: 'equipo', entidadId: e.id, accion: coincide ? 'VERIFICADO' : 'REUBICADO_EN_AUDITORIA',
      detalle: { codigo: e.codigo, auditoria_id: id, ...(coincide ? {} : { cambios: { ubicacion: { antes: e.ubicacion, despues: ambiente } } }) },
    });
    return { ...it, codigo: e.codigo, tipo: e.tipo, marca: e.marca };
  });
  res.status(201).json(item);
}));

router.post('/auditorias/:id/finalizar', soloTice, h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  await tx(async (c) => {
    const { rows: [a] } = await c.query('SELECT * FROM auditorias_inventario WHERE id = $1 FOR UPDATE', [id]);
    if (!a) throw noEncontrado('Auditoría');
    if (a.sede_id !== req.usuario.sede_id) throw prohibido('La auditoría es de otra sede');
    if (a.estado !== 'EN_CURSO') throw invalido('La auditoría ya finalizó');
    const { rows: [r] } = await c.query(
      `SELECT count(*) FILTER (WHERE resultado = 'ENCONTRADO')::int AS encontrados,
              count(*) FILTER (WHERE resultado = 'REUBICADO')::int AS reubicados
         FROM auditoria_items WHERE auditoria_id = $1`, [id]);
    const fin = new Date();
    // Localizados = equipos encontrados en su ubicación ÷ equipos registrados en la sede × 100
    const tel = Math.round((r.encontrados / a.equipos_esperados) * 10000) / 100;
    // TAI = días hábiles desde el inicio hasta el fin, contando ambos
    const tai = diasHabiles(a.fecha_inicio, fin);
    const faltantes = a.equipos_esperados - r.encontrados - r.reubicados;
    await c.query(
      `UPDATE auditorias_inventario SET estado='FINALIZADA', fecha_fin=$2, equipos_encontrados=$3,
              equipos_reubicados=$4, equipos_faltantes=$5, tel=$6, tai_dias=$7 WHERE id=$1`,
      [id, fin, r.encontrados, r.reubicados, faltantes, tel, tai]);
    await registrar(c, req.usuario, {
      entidad: 'auditoria', entidadId: id, accion: 'FINALIZAR',
      detalle: { esperados: a.equipos_esperados, encontrados: r.encontrados, reubicados: r.reubicados, faltantes, tel, tai_dias: tai },
    });
  });
  res.json(await auditoriaConDetalle(id, req.usuario));
}));

module.exports = router;
module.exports.leerToken = leerToken;
