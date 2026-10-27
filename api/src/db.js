const { Pool, types } = require('pg');
const config = require('./config');

// NUMERIC y BIGINT como números de JavaScript (los valores del sistema caben sin pérdida)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// DATE como texto AAAA-MM-DD, sin conversión de zona horaria
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

async function query(text, params) {
  return pool.query(text, params);
}

// Ejecuta fn dentro de una transacción; si algo falla (incluido el registro en la bitácora) se revierte todo
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
