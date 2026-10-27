// Crea las tablas, triggers y catálogos la primera vez (si la base está vacía)
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const SCHEMA = path.join(__dirname, '..', '..', 'db', 'schema.sql');
const ESCALAMIENTO = path.join(__dirname, '..', '..', 'db', 'escalamiento.sql');

async function esperarBase(intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === intentos) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function migrar({ forzar = false } = {}) {
  await esperarBase();
  const { rows } = await pool.query(`SELECT to_regclass('public.logs_auditoria') AS t`);
  if (rows[0].t && !forzar) {
    await pool.query(fs.readFileSync(ESCALAMIENTO, 'utf8'));
    return false;
  }
  if (forzar) await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(fs.readFileSync(SCHEMA, 'utf8'));
  console.log('Base de datos creada');
  return true;
}

if (require.main === module) {
  migrar().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { migrar };
