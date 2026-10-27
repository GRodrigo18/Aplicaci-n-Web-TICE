// Crea la primera cuenta del Director de TI en una instalación nueva.
// Uso: docker compose exec api node src/scripts/crear-director.js "Nombre" correo@colegio.edu.pe "Contraseña"
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../db');
const { migrar } = require('./migrate');
const { registrar } = require('../lib/bitacora');

async function main() {
  const [nombre, correo, password] = process.argv.slice(2);
  if (!nombre || !correo || !password) {
    console.log('Uso: node src/scripts/crear-director.js "Nombre" correo@colegio.edu.pe "Contraseña"');
    process.exit(1);
  }
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  await migrar();
  const hash = await bcrypt.hash(password, 10);
  await tx(async (c) => {
    const { rows: [u] } = await c.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES ($1, lower($2), $3, 'DIRECTOR') RETURNING id, correo`,
      [nombre, correo, hash]);
    await registrar(c, null, { entidad: 'usuario', entidadId: u.id, accion: 'CREAR', detalle: { correo: u.correo, rol: 'DIRECTOR', origen: 'instalación' } });
    console.log(`Director de TI creado: ${u.correo}`);
  });
}

main().then(() => pool.end()).catch((err) => { console.error(err.message); process.exit(1); });
