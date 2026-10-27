// RF-02, RF-07, RF-08, RF-09 (etiquetas) — UC-04, UC-05, UC-06, UC-12
const express = require('express');
const crypto = require('crypto');
const { query, tx } = require('../db');
const { h, invalido, noEncontrado, HttpError } = require('../lib/errores');
const { sedeDeConsulta, verificarSede, soloDirector, soloTice } = require('../lib/auth');
const { registrar, diferencias } = require('../lib/bitacora');
const { texto, entero, opcion } = require('../lib/util');
const { analizarExcel } = require('../lib/importar');

const router = express.Router();

const SELECT_EQUIPO = `
  SELECT e.*, t.nombre AS tipo, ee.nombre AS estado_nombre, s.nombre AS sede_nombre, s.codigo AS sede_codigo
    FROM equipos e
    JOIN tipos_equipo t ON t.id = e.tipo_id
    JOIN estados_equipo ee ON ee.codigo = e.estado
    JOIN sedes s ON s.id = e.sede_id`;

const CAMPOS_EDITABLES = ['tipo_id', 'marca', 'modelo', 'serie', 'fecha_adquisicion', 'estado', 'ubicacion', 'observaciones',
  'caracteristicas', 'mac', 'propiedad', 'responsable', 'guia_factura'];
const ESTADOS_EDITABLES = ['OPERATIVO', 'MANTENIMIENTO', 'AVERIADO', 'OBSOLETO'];

// Filtros de la vista del inventario (los mismos para la lista y para el CSV)
function filtrosInventario(req) {
  const cond = [];
  const params = [];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace('?', `$${params.length}`)); };
  const sede = sedeDeConsulta(req);
  if (sede) add('e.sede_id = ?', sede);
  const q = req.query;
  if (q.q) {
    params.push(`%${q.q}%`);
    const p = `$${params.length}`;
    cond.push(`(e.codigo ILIKE ${p} OR e.marca ILIKE ${p} OR e.modelo ILIKE ${p} OR e.serie ILIKE ${p} OR e.ubicacion ILIKE ${p}
      OR e.mac ILIKE ${p} OR e.responsable ILIKE ${p} OR e.caracteristicas ILIKE ${p})`);
  }
  if (q.codigo) add('e.codigo ILIKE ?', `%${q.codigo}%`);
  if (q.marca) add('e.marca ILIKE ?', `%${q.marca}%`);
  if (q.tipo_id) add('e.tipo_id = ?', entero(q.tipo_id, 'tipo_id'));
  if (q.estado) add('e.estado = ?', String(q.estado).toUpperCase());
  else if (q.incluir_bajas !== 'true') cond.push(`e.estado <> 'BAJA'`);
  if (q.ubicacion) add('e.ubicacion ILIKE ?', `%${q.ubicacion}%`);
  if (q.sin_verificar === 'true') cond.push('e.ultima_verificacion IS NULL');
  if (q.propiedad) add('e.propiedad = ?', String(q.propiedad).toUpperCase());
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

router.get('/', h(async (req, res) => {
  const { where, params } = filtrosInventario(req);
  const { rows } = await query(`${SELECT_EQUIPO} ${where} ORDER BY s.id, e.ubicacion, e.codigo`, params);
  res.json(rows);
}));

// UC-12: exportar el inventario filtrado a CSV (compatible con Excel)
router.get('/exportar.csv', soloDirector, h(async (req, res) => {
  const { where, params } = filtrosInventario(req);
  const { rows } = await query(`${SELECT_EQUIPO} ${where} ORDER BY s.id, e.ubicacion, e.codigo`, params);
  if (!rows.length) throw invalido('No hay datos para exportar con los filtros aplicados');
  const columnas = [
    ['Sede', 'sede_nombre'], ['Código', 'codigo'], ['Tipo', 'tipo'], ['Marca', 'marca'], ['Modelo', 'modelo'],
    ['Serie', 'serie'], ['Características', 'caracteristicas'], ['MAC', 'mac'], ['Fecha de ingreso', 'fecha_adquisicion'],
    ['Estado', 'estado_nombre'], ['Ubicación', 'ubicacion'], ['Responsable', 'responsable'], ['Propiedad', 'propiedad'],
    ['Guía/Factura', 'guia_factura'], ['Última verificación', 'ultima_verificacion'], ['Observaciones', 'observaciones'],
  ];
  const celda = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Excel en español usa ";" como separador; el BOM hace que lea bien las tildes
  const csv = '﻿' + [columnas.map((c) => c[0]).join(';'),
    ...rows.map((r) => columnas.map((c) => celda(r[c[1]])).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="inventario_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

async function obtenerEquipo(id, usuario) {
  const { rows: [e] } = await query(`${SELECT_EQUIPO} WHERE e.id = $1`, [id]);
  if (!e) throw noEncontrado('Equipo');
  verificarSede(usuario, e.sede_id);
  return e;
}

// Ficha del equipo con su historial y sus tickets
router.get('/:id', h(async (req, res) => {
  const e = await obtenerEquipo(entero(req.params.id, 'id', { requerido: true }), req.usuario);
  const [historial, tickets] = await Promise.all([
    query(`SELECT l.fecha, l.usuario_correo, u.nombre AS usuario_nombre, l.accion, l.detalle
             FROM logs_auditoria l LEFT JOIN usuarios u ON u.id = l.usuario_id
            WHERE l.entidad = 'equipo' AND l.entidad_id = $1 AND l.accion <> 'LECTURA_QR' ORDER BY l.secuencia DESC LIMIT 100`, [e.id]),
    query(`SELECT i.id, i.numero, i.asunto, i.prioridad, i.estado, i.fecha_registro, i.fecha_resolucion
             FROM incidencias i JOIN incidencia_equipos ie ON ie.incidencia_id = i.id
            WHERE ie.equipo_id = $1 ORDER BY i.fecha_registro DESC`, [e.id]),
  ]);
  res.json({ ...e, historial: historial.rows, tickets: tickets.rows });
}));

function leerCampos(body, parcial) {
  const d = {};
  const req = !parcial;
  if (!parcial || body.tipo_id !== undefined) d.tipo_id = entero(body.tipo_id, 'tipo', { requerido: true });
  if (!parcial || body.marca !== undefined) d.marca = texto(body.marca, 'marca', { requerido: true, max: 60 });
  if (!parcial || body.modelo !== undefined) d.modelo = texto(body.modelo, 'modelo', { max: 80 });
  if (!parcial || body.serie !== undefined) d.serie = texto(body.serie, 'serie', { max: 80 });
  if (!parcial || body.fecha_adquisicion !== undefined) {
    d.fecha_adquisicion = texto(body.fecha_adquisicion, 'fecha_adquisicion', { max: 10 });
    if (d.fecha_adquisicion && !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_adquisicion)) throw invalido('Fecha de adquisición inválida (AAAA-MM-DD)');
  }
  if (!parcial || body.estado !== undefined) {
    d.estado = String(body.estado || 'OPERATIVO').toUpperCase();
    if (d.estado === 'BAJA') throw invalido('Para dar de baja use la opción "Dar de baja" e indique el motivo');
    if (!ESTADOS_EDITABLES.includes(d.estado)) throw invalido('Estado de equipo inválido', { campo: 'estado' });
  }
  if (!parcial || body.ubicacion !== undefined) d.ubicacion = texto(body.ubicacion, 'ubicacion', { requerido: req || body.ubicacion !== undefined, max: 80 });
  if (!parcial || body.observaciones !== undefined) d.observaciones = texto(body.observaciones, 'observaciones', { max: 1000 });
  if (!parcial || body.caracteristicas !== undefined) d.caracteristicas = texto(body.caracteristicas, 'caracteristicas', { max: 500 });
  if (!parcial || body.mac !== undefined) d.mac = texto(body.mac, 'mac', { max: 40 });
  if (!parcial || body.propiedad !== undefined) d.propiedad = opcion(body.propiedad, 'propiedad', ['PROPIO', 'ALQUILADO'], { requerido: false });
  if (!parcial || body.responsable !== undefined) d.responsable = texto(body.responsable, 'responsable', { max: 120 });
  if (!parcial || body.guia_factura !== undefined) d.guia_factura = texto(body.guia_factura, 'guia_factura', { max: 60 });
  return d;
}

// Inserta un equipo nuevo con su token QR y deja el registro en la bitácora
async function insertarEquipo(c, usuario, sedeId, codigo, d, detalleExtra = {}) {
  const token = crypto.randomBytes(12).toString('hex');
  const { rows: [e] } = await c.query(
    `INSERT INTO equipos (sede_id, codigo, tipo_id, marca, modelo, serie, fecha_adquisicion, estado, ubicacion, observaciones,
                          caracteristicas, mac, propiedad, responsable, guia_factura, qr_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [sedeId, codigo, d.tipo_id, d.marca, d.modelo, d.serie, d.fecha_adquisicion, d.estado, d.ubicacion, d.observaciones,
      d.caracteristicas, d.mac, d.propiedad, d.responsable, d.guia_factura, token],
  );
  await registrar(c, usuario, {
    entidad: 'equipo', entidadId: e.id, accion: 'CREAR', sedeId,
    detalle: { codigo, ...d, ...detalleExtra },
  });
  return e;
}

// Actualiza los campos de un equipo y deja el registro en la bitácora.
// Con soloSiCambia (importación) no se escribe nada si los datos son iguales.
async function actualizarEquipo(c, usuario, antes, d, { detalleExtra = {}, soloSiCambia = false } = {}) {
  const n = { ...antes, ...d };
  if (soloSiCambia && !Object.keys(diferencias(antes, n, CAMPOS_EDITABLES)).length) return { despues: antes, cambios: {} };
  const { rows: [despues] } = await c.query(
    `UPDATE equipos SET tipo_id=$2, marca=$3, modelo=$4, serie=$5, fecha_adquisicion=$6, estado=$7, ubicacion=$8,
            observaciones=$9, caracteristicas=$10, mac=$11, propiedad=$12, responsable=$13, guia_factura=$14, actualizado_en=now()
      WHERE id=$1 RETURNING *`,
    [antes.id, n.tipo_id, n.marca, n.modelo, n.serie, n.fecha_adquisicion, n.estado, n.ubicacion, n.observaciones,
      n.caracteristicas, n.mac, n.propiedad, n.responsable, n.guia_factura],
  );
  const cambios = diferencias(antes, despues, CAMPOS_EDITABLES);
  await registrar(c, usuario, {
    entidad: 'equipo', entidadId: antes.id, accion: 'MODIFICAR', sedeId: antes.sede_id,
    detalle: { codigo: antes.codigo, cambios, ...detalleExtra },
  });
  return { despues, cambios };
}

// UC-04 Registrar nuevo equipo (lo hace el TICE en su sede; el Director de TI consulta)
router.post('/', soloTice, h(async (req, res) => {
  const codigo = texto(req.body.codigo, 'codigo', { requerido: true, max: 40 }).toUpperCase();
  const d = leerCampos(req.body, false);
  const sedeId = req.usuario.sede_id;

  const equipo = await tx(async (c) => {
    const { rows: dup } = await c.query('SELECT 1 FROM equipos WHERE sede_id = $1 AND codigo = $2', [sedeId, codigo]);
    if (dup.length) throw new HttpError(409, `El código ${codigo} ya está registrado en la sede. Modifique el código.`, { campo: 'codigo' });
    return insertarEquipo(c, req.usuario, sedeId, codigo, d);
  });
  res.status(201).json(equipo);
}));

// Importar el inventario desde el Excel de la sede. Sin ?confirmar=true solo muestra lo que haría.
// Los equipos nuevos se registran; los que ya existen (mismo código) se actualizan; los demás no se tocan.
router.post('/importar', soloTice, express.raw({ type: () => true, limit: '10mb' }), h(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw invalido('Adjunte el archivo Excel (.xlsx)');
  const sedeId = req.usuario.sede_id;
  const [{ rows: tipos }, { rows: [sede] }] = await Promise.all([
    query('SELECT id, nombre FROM tipos_equipo'),
    query('SELECT id, codigo, nombre FROM sedes WHERE id = $1', [sedeId]),
  ]);
  const a = await analizarExcel(req.body, { tipos, sede });
  const confirmar = req.query.confirmar === 'true';

  const resultado = await tx(async (c) => {
    const { rows: existentes } = await c.query(`SELECT * FROM equipos WHERE sede_id = $1 FOR UPDATE`, [sedeId]);
    const porCodigo = new Map(existentes.map((e) => [e.codigo, e]));
    const nuevos = [];
    const actualizados = [];
    let sinCambios = 0;
    for (const v of a.validas) {
      const antes = porCodigo.get(v.codigo);
      if (!antes) {
        nuevos.push({ fila: v.fila, codigo: v.codigo, tipo: v.tipo, ubicacion: v.datos.ubicacion });
        if (confirmar) await insertarEquipo(c, req.usuario, sedeId, v.codigo, v.datos, { origen: 'Importación Excel', fila: v.fila });
        continue;
      }
      if (antes.estado === 'BAJA') {
        a.excluidas.push({ fila: v.fila, codigo: v.codigo, motivo: 'El equipo está dado de baja en el sistema' });
        continue;
      }
      const cambios = diferencias(antes, { ...antes, ...v.datos }, CAMPOS_EDITABLES);
      if (!Object.keys(cambios).length) { sinCambios++; continue; }
      actualizados.push({ fila: v.fila, codigo: v.codigo, campos: Object.keys(cambios) });
      if (confirmar) await actualizarEquipo(c, req.usuario, antes, v.datos, { detalleExtra: { origen: 'Importación Excel', fila: v.fila } });
    }
    const enArchivo = new Set(a.validas.map((v) => v.codigo));
    const resumen = {
      hoja: a.hoja, filas_vacias: a.vacias, nuevos: nuevos.length, actualizados: actualizados.length,
      sin_cambios: sinCambios, excluidas: a.excluidas.length, avisos: a.avisos.length,
      solo_en_sistema: existentes.filter((e) => e.estado !== 'BAJA' && !enArchivo.has(e.codigo)).length,
    };
    if (confirmar) {
      await registrar(c, req.usuario, {
        entidad: 'equipo', accion: 'IMPORTAR_EXCEL', sedeId,
        detalle: { ...resumen, excluidas: a.excluidas.slice(0, 100) },
      });
    } else {
      throw Object.assign(new Error('vista previa'), { vistaPrevia: { resumen, nuevos, actualizados } });
    }
    return { resumen, nuevos, actualizados };
  }).catch((err) => {
    if (err.vistaPrevia) return err.vistaPrevia;
    throw err;
  });
  a.excluidas.sort((x, y) => x.fila - y.fila);
  res.json({ confirmado: confirmar, ...resultado, excluidas: a.excluidas, avisos: a.avisos });
}));

// UC-05 Actualizar equipo
router.put('/:id', soloTice, h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const d = leerCampos(req.body, true);
  const equipo = await tx(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM equipos WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) throw noEncontrado('Equipo');
    verificarSede(req.usuario, antes.sede_id);
    if (antes.estado === 'BAJA') throw invalido('El equipo está dado de baja y no se puede modificar');
    return (await actualizarEquipo(c, req.usuario, antes, d)).despues;
  });
  res.json(equipo);
}));

// UC-05 Dar de baja (lógica, con motivo; no si hay un ticket abierto)
router.post('/:id/baja', soloTice, h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const motivo = texto(req.body.motivo, 'motivo', { requerido: true, max: 500 });
  const equipo = await tx(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM equipos WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) throw noEncontrado('Equipo');
    verificarSede(req.usuario, antes.sede_id);
    if (antes.estado === 'BAJA') throw invalido('El equipo ya está dado de baja');
    const { rows: abiertos } = await c.query(
      `SELECT i.numero FROM incidencias i JOIN incidencia_equipos ie ON ie.incidencia_id = i.id
        WHERE ie.equipo_id = $1 AND i.estado IN ('PENDIENTE', 'EN_PROCESO')`, [id]);
    if (abiertos.length) {
      throw new HttpError(409, `No se puede dar de baja: el equipo tiene el ticket abierto ${abiertos.map((t) => t.numero).join(', ')}`,
        { tickets: abiertos.map((t) => t.numero) });
    }
    const { rows: [despues] } = await c.query(
      `UPDATE equipos SET estado='BAJA', motivo_baja=$2, fecha_baja=now(), actualizado_en=now() WHERE id=$1 RETURNING *`,
      [id, motivo],
    );
    await registrar(c, req.usuario, {
      entidad: 'equipo', entidadId: id, accion: 'BAJA', sedeId: antes.sede_id,
      detalle: { codigo: antes.codigo, motivo, estado_anterior: antes.estado },
    });
    return despues;
  });
  res.json(equipo);
}));

module.exports = router;
module.exports.insertarEquipo = insertarEquipo;
module.exports.actualizarEquipo = actualizarEquipo;
