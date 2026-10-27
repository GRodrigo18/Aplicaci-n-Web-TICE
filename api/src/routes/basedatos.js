// Visor de la base de datos para el Director de TI: tablas, conteos y filas, solo lectura.
// Los nombres de tabla se validan contra el catálogo de PostgreSQL y nunca se muestran los hashes de contraseña.
const express = require('express');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../config');
const { query, pool } = require('../db');
const { registrar } = require('../lib/bitacora');
const { h, noEncontrado, invalido, HttpError } = require('../lib/errores');
const { entero, texto } = require('../lib/util');
const { instalarDatosReales, validarInstalacion } = require('../scripts/instalar');

const router = express.Router();
const execFileP = promisify(execFile);
const OCULTAS = { usuarios: ['password_hash'] };
const POR_PAGINA = 50;

async function tablas() {
  const { rows } = await query(
    `SELECT c.relname AS tabla, obj_description(c.oid) AS descripcion
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`);
  return rows;
}

router.get('/', h(async (_req, res) => {
  const lista = await tablas();
  for (const t of lista) {
    t.filas = (await query(`SELECT count(*)::int AS n FROM public."${t.tabla}"`)).rows[0].n;
  }
  const { rows: [tam] } = await query('SELECT pg_size_pretty(pg_database_size(current_database())) AS tamano, version() AS version');
  const { rows: [demo] } = await query(`SELECT count(*)::int AS n FROM logs_auditoria WHERE accion = 'CARGA_DEMO'`);
  res.json({ tablas: lista, ...tam, datos_demo: demo.n > 0 });
}));

// Consulta SQL de solo lectura: transacción READ ONLY, una sola sentencia (sentencia preparada, que PostgreSQL
// no deja encadenar con ";"), 5 s como máximo y hasta 500 filas. Las columnas con hashes de contraseña se ocultan.
// La conexión se descarta al terminar para no dejar sentencias preparadas ni estado de sesión en el pool.
const MAX_FILAS = 500;
const HASH = /^\$2[aby]\$\d{2}\$/;
router.post('/consulta', h(async (req, res) => {
  const sql = texto(req.body?.sql, 'sql', { requerido: true, max: 5000 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');
    await c.query(`SET LOCAL statement_timeout = '5s'`);
    const inicio = Date.now();
    let r;
    try {
      r = await c.query({ name: `consulta_${crypto.randomBytes(6).toString('hex')}`, text: sql, rowMode: 'array' });
    } catch (err) {
      throw new HttpError(400, `PostgreSQL: ${err.message}`);
    }
    const ms = Date.now() - inicio;
    const campos = (r.fields || []).map((f) => f.name);
    let filas = r.rows || [];
    const ocultar = campos.map((n, i) => n === 'password_hash' || filas.some((f) => typeof f[i] === 'string' && HASH.test(f[i])));
    filas = filas.slice(0, MAX_FILAS).map((f) => f.map((v, i) => (ocultar[i] ? '••••••' : v)));
    res.json({ columnas: campos, filas, truncado: (r.rows || []).length > MAX_FILAS, comando: r.command, ms });
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release(true);
  }
}));

// Pasar de la demostración a los datos reales (borra todo y deja la sede y los dos usuarios)
router.post('/datos-reales', h(async (req, res) => {
  const { rows: [demo] } = await query(`SELECT count(*)::int AS n FROM logs_auditoria WHERE accion = 'CARGA_DEMO'`);
  if (!demo.n) throw new HttpError(409, 'La base ya tiene datos reales: esta opción solo existe mientras está la demostración');
  if (req.body?.confirmacion !== 'BORRAR DEMO') throw invalido('Escriba BORRAR DEMO para confirmar');
  validarInstalacion(req.body);
  const r = await instalarDatosReales(req.body, req.usuario);
  res.json({ ok: true, director: r.director.correo, tice: r.tice.correo, sede: r.sede.nombre });
}));

// RNF-07 Respaldo: copia completa del esquema public (estructura, datos, triggers y secuencias) en un archivo .sql
// generado con pg_dump. Se restaura ejecutándolo en una base vacía. La descarga queda en la bitácora.
router.get('/respaldo', h(async (req, res) => {
  let sql;
  try {
    const { stdout } = await execFileP('pg_dump', ['--schema=public', '--no-owner', '--no-privileges', '--encoding=UTF8', config.databaseUrl],
      { maxBuffer: 512 * 1024 * 1024, timeout: 120000 });
    // El esquema public ya existe en la base de destino (y en Supabase no se puede comentar): se omiten esas dos líneas
    sql = stdout.replace(/^CREATE SCHEMA public;\n/m, '').replace(/^COMMENT ON SCHEMA public IS .*\n/m, '');
  } catch (err) {
    if (err.code === 'ENOENT') throw new HttpError(501, 'El servidor no tiene pg_dump instalado');
    throw new HttpError(500, `No se pudo generar el respaldo: ${String(err.stderr || err.message).split('\n')[0]}`);
  }
  const archivo = `respaldo_tice_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.sql`;
  await registrar(pool, req.usuario, { entidad: 'sistema', accion: 'RESPALDO', detalle: { archivo, bytes: Buffer.byteLength(sql) } });
  res.set('Content-Type', 'application/sql; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${archivo}"`);
  res.send(sql);
}));

router.get('/:tabla', h(async (req, res) => {
  const t = (await tablas()).find((x) => x.tabla === req.params.tabla);
  if (!t) throw noEncontrado('Tabla');
  const pagina = entero(req.query.pagina, 'pagina') || 1;
  const { rows: columnas } = await query(
    `SELECT column_name AS nombre, data_type AS tipo FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [t.tabla]);
  const visibles = columnas.filter((c) => !(OCULTAS[t.tabla] || []).includes(c.nombre));
  const orden = columnas.some((c) => c.nombre === 'id') ? 'ORDER BY id DESC' : columnas.some((c) => c.nombre === 'secuencia') ? 'ORDER BY secuencia DESC' : '';
  const lista = visibles.map((c) => `"${c.nombre}"`).join(', ');
  const [{ rows }, { rows: [{ n }] }] = await Promise.all([
    query(`SELECT ${lista} FROM public."${t.tabla}" ${orden} LIMIT ${POR_PAGINA} OFFSET $1`, [(pagina - 1) * POR_PAGINA]),
    query(`SELECT count(*)::int AS n FROM public."${t.tabla}"`),
  ]);
  res.json({ tabla: t.tabla, columnas: visibles, filas: rows, total: n, pagina, por_pagina: POR_PAGINA });
}));

module.exports = router;
