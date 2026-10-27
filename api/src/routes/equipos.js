// RF-02, RF-07, RF-08, RF-09 (etiquetas) — UC-04, UC-05, UC-06, UC-12
const express = require('express');
const crypto = require('crypto');
const { query, tx } = require('../db');
const { h, invalido, noEncontrado, HttpError } = require('../lib/errores');
const { sedeDeConsulta, verificarSede, soloDirector, esDirector } = require('../lib/auth');
const { registrar, diferencias } = require('../lib/bitacora');
const { texto, entero } = require('../lib/util');

const router = express.Router();

const SELECT_EQUIPO = `
  SELECT e.*, t.nombre AS tipo, ee.nombre AS estado_nombre, s.nombre AS sede_nombre, s.codigo AS sede_codigo
    FROM equipos e
    JOIN tipos_equipo t ON t.id = e.tipo_id
    JOIN estados_equipo ee ON ee.codigo = e.estado
    JOIN sedes s ON s.id = e.sede_id`;

const CAMPOS_EDITABLES = ['tipo_id', 'marca', 'modelo', 'serie', 'fecha_adquisicion', 'estado', 'ubicacion', 'observaciones'];

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
    cond.push(`(e.codigo ILIKE ${p} OR e.marca ILIKE ${p} OR e.modelo ILIKE ${p} OR e.serie ILIKE ${p} OR e.ubicacion ILIKE ${p})`);
  }
  if (q.codigo) add('e.codigo ILIKE ?', `%${q.codigo}%`);
  if (q.marca) add('e.marca ILIKE ?', `%${q.marca}%`);
  if (q.tipo_id) add('e.tipo_id = ?', entero(q.tipo_id, 'tipo_id'));
  if (q.estado) add('e.estado = ?', String(q.estado).toUpperCase());
  else if (q.incluir_bajas !== 'true') cond.push(`e.estado <> 'BAJA'`);
  if (q.ubicacion) add('e.ubicacion ILIKE ?', `%${q.ubicacion}%`);
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
    ['Serie', 'serie'], ['Fecha de adquisición', 'fecha_adquisicion'], ['Estado', 'estado_nombre'],
    ['Ubicación', 'ubicacion'], ['Última verificación', 'ultima_verificacion'], ['Observaciones', 'observaciones'],
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
    query(`SELECT fecha, usuario_correo, accion, detalle FROM logs_auditoria
            WHERE entidad = 'equipo' AND entidad_id = $1 ORDER BY secuencia DESC LIMIT 100`, [e.id]),
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
  }
  if (!parcial || body.ubicacion !== undefined) d.ubicacion = texto(body.ubicacion, 'ubicacion', { requerido: req || body.ubicacion !== undefined, max: 80 });
  if (!parcial || body.observaciones !== undefined) d.observaciones = texto(body.observaciones, 'observaciones', { max: 1000 });
  return d;
}

// UC-04 Registrar nuevo equipo
router.post('/', h(async (req, res) => {
  const codigo = texto(req.body.codigo, 'codigo', { requerido: true, max: 40 }).toUpperCase();
  const d = leerCampos(req.body, false);
  // el TICE registra en su sede; el Director indica la sede
  const sedeId = esDirector(req.usuario) ? entero(req.body.sede_id, 'sede_id', { requerido: true }) : req.usuario.sede_id;

  const equipo = await tx(async (c) => {
    const { rows: dup } = await c.query('SELECT 1 FROM equipos WHERE sede_id = $1 AND codigo = $2', [sedeId, codigo]);
    if (dup.length) throw new HttpError(409, `El código ${codigo} ya está registrado en la sede. Modifique el código.`, { campo: 'codigo' });
    const token = crypto.randomBytes(12).toString('hex');
    const { rows: [e] } = await c.query(
      `INSERT INTO equipos (sede_id, codigo, tipo_id, marca, modelo, serie, fecha_adquisicion, estado, ubicacion, observaciones, qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [sedeId, codigo, d.tipo_id, d.marca, d.modelo, d.serie, d.fecha_adquisicion, d.estado, d.ubicacion, d.observaciones, token],
    );
    await registrar(c, req.usuario, {
      entidad: 'equipo', entidadId: e.id, accion: 'CREAR', sedeId,
      detalle: { codigo, ...d },
    });
    return e;
  });
  res.status(201).json(equipo);
}));

// UC-05 Actualizar equipo
router.put('/:id', h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const d = leerCampos(req.body, true);
  const equipo = await tx(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM equipos WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) throw noEncontrado('Equipo');
    verificarSede(req.usuario, antes.sede_id);
    if (antes.estado === 'BAJA') throw invalido('El equipo está dado de baja y no se puede modificar');
    const nuevo = { ...antes, ...d };
    const { rows: [despues] } = await c.query(
      `UPDATE equipos SET tipo_id=$2, marca=$3, modelo=$4, serie=$5, fecha_adquisicion=$6, estado=$7, ubicacion=$8,
              observaciones=$9, actualizado_en=now() WHERE id=$1 RETURNING *`,
      [id, nuevo.tipo_id, nuevo.marca, nuevo.modelo, nuevo.serie, nuevo.fecha_adquisicion, nuevo.estado, nuevo.ubicacion, nuevo.observaciones],
    );
    const cambios = diferencias(antes, despues, CAMPOS_EDITABLES);
    await registrar(c, req.usuario, {
      entidad: 'equipo', entidadId: id, accion: 'MODIFICAR', sedeId: antes.sede_id,
      detalle: { codigo: antes.codigo, cambios },
    });
    return despues;
  });
  res.json(equipo);
}));

// UC-05 Dar de baja (lógica, con motivo; no si hay un ticket abierto)
router.post('/:id/baja', h(async (req, res) => {
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
