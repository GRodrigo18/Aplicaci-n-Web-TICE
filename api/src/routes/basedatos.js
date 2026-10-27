// Visor de la base de datos para el Director de TI: tablas, conteos y filas, solo lectura.
// Los nombres de tabla se validan contra el catálogo de PostgreSQL y nunca se muestran los hashes de contraseña.
const express = require('express');
const { query } = require('../db');
const { h, noEncontrado } = require('../lib/errores');
const { entero } = require('../lib/util');

const router = express.Router();
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
  res.json({ tablas: lista, ...tam });
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
