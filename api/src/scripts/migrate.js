// Crea las tablas, triggers y catálogos la primera vez (si la base está vacía)
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const SCHEMA = path.join(__dirname, '..', '..', 'db', 'schema.sql');
const ESCALAMIENTO = path.join(__dirname, '..', '..', 'db', 'escalamiento.sql');

// Borra solo los objetos del sistema en el esquema public (vistas, tablas, secuencias y funciones), sin borrar
// el esquema: en servicios administrados como Supabase el esquema public trae permisos propios del proveedor.
const BORRAR_TODO = `DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT format('DROP VIEW IF EXISTS public.%I CASCADE', viewname) AS s FROM pg_views WHERE schemaname = 'public'
    UNION ALL SELECT format('DROP TABLE IF EXISTS public.%I CASCADE', tablename) FROM pg_tables WHERE schemaname = 'public'
  LOOP EXECUTE o.s; END LOOP;
  FOR o IN SELECT format('DROP SEQUENCE IF EXISTS public.%I CASCADE', sequencename) AS s FROM pg_sequences WHERE schemaname = 'public'
    UNION ALL SELECT format('DROP FUNCTION IF EXISTS %s CASCADE', p.oid::regprocedure) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP EXECUTE o.s; END LOOP;
END $$`;

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
  if (forzar) await pool.query(BORRAR_TODO);
  await pool.query(fs.readFileSync(SCHEMA, 'utf8'));
  await pool.query(fs.readFileSync(ESCALAMIENTO, 'utf8'));
  console.log('Base de datos creada');
  return true;
}

if (require.main === module) {
  migrar().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { migrar };
