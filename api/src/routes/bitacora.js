// UC-03 Consulta y verificación de la bitácora de auditoría (Director de TI)
const express = require('express');
const { query } = require('../db');
const { h } = require('../lib/errores');
const { entero } = require('../lib/util');

const router = express.Router();

router.get('/', h(async (req, res) => {
  const cond = [];
  const params = [];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace('?', `$${params.length}`)); };
  const q = req.query;
  if (q.sede_id) add('l.sede_id = ?', entero(q.sede_id, 'sede_id'));
  if (q.entidad) add('l.entidad = ?', q.entidad);
  if (q.accion) add('l.accion = ?', String(q.accion).toUpperCase());
  if (q.usuario) add('l.usuario_correo ILIKE ?', `%${q.usuario}%`);
  if (q.desde) add('l.fecha >= ?::date', q.desde);
  if (q.hasta) add('l.fecha < ?::date + 1', q.hasta);
  const limite = Math.min(entero(q.limite, 'limite') || 100, 500);
  const pagina = Math.max(entero(q.pagina, 'pagina') || 1, 1);
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const [{ rows }, { rows: [{ total }] }] = await Promise.all([
    query(`SELECT l.*, s.nombre AS sede_nombre FROM logs_auditoria l LEFT JOIN sedes s ON s.id = l.sede_id
           ${where} ORDER BY l.secuencia DESC LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, params),
    query(`SELECT count(*)::int AS total FROM logs_auditoria l ${where}`, params),
  ]);
  res.json({ registros: rows, total, pagina, limite });
}));

// Recalcula la cadena de hashes y busca operaciones sin registro (RNF-05)
router.get('/verificar', h(async (_req, res) => {
  const { rows: rotos } = await query(`
    SELECT secuencia, hash_ok, enlace_ok FROM (
      SELECT secuencia,
             hash = log_hash(l) AS hash_ok,
             hash_anterior = coalesce(lag(hash) OVER (ORDER BY secuencia), repeat('0', 64)) AS enlace_ok,
             secuencia = row_number() OVER (ORDER BY secuencia) AS seq_ok
        FROM logs_auditoria l) x
     WHERE NOT (hash_ok AND enlace_ok AND seq_ok) ORDER BY secuencia LIMIT 50`);
  const { rows: [{ total }] } = await query('SELECT count(*)::int AS total FROM logs_auditoria');
  const { rows: [{ operaciones }] } = await query('SELECT count(*)::int AS operaciones FROM operaciones_bd');
  const { rows: sinRegistro } = await query('SELECT * FROM operaciones_sin_bitacora ORDER BY id LIMIT 50');
  res.json({
    integra: rotos.length === 0,
    registros: total,
    registros_alterados: rotos,
    operaciones_contadas: operaciones,
    operaciones_sin_bitacora: sinRegistro,
    completa: sinRegistro.length === 0,
  });
}));

module.exports = router;
