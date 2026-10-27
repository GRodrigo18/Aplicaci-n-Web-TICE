// Instalación con datos reales: borra la base (incluidos los datos de demostración) y deja la sede,
// el Jefe de TI y el TICE de la sede, listos para importar el inventario desde Excel.
// Uso desde la web: Base de datos → "Pasar a datos reales" (solo mientras la base tenga la demo).
const bcrypt = require('bcryptjs');
const { tx } = require('../db');
const { migrar } = require('./migrate');
const { registrar } = require('../lib/bitacora');
const { texto, correoInstitucional } = require('../lib/util');
const { invalido } = require('../lib/errores');

function validarInstalacion(d = {}) {
  const v = {
    sede: {
      codigo: texto(d.sede?.codigo, 'código de la sede', { requerido: true, max: 10 }).toUpperCase(),
      nombre: texto(d.sede?.nombre, 'nombre de la sede', { requerido: true, max: 100 }),
      correo_buzon: texto(d.sede?.correo_buzon, 'buzón de la sede', { requerido: true, max: 150 }).toLowerCase(),
    },
    director: {
      nombre: texto(d.director?.nombre, 'nombre del Jefe de TI', { requerido: true, max: 120 }),
      correo: texto(d.director?.correo, 'correo del Jefe de TI', { requerido: true, max: 150 }).toLowerCase(),
    },
    tice: {
      nombre: texto(d.tice?.nombre, 'nombre del TICE', { requerido: true, max: 120 }),
      correo: texto(d.tice?.correo, 'correo del TICE', { requerido: true, max: 150 }).toLowerCase(),
    },
    password: d.password,
  };
  correoInstitucional(v.sede.correo_buzon, 'correo_buzon');
  correoInstitucional(v.director.correo, 'director.correo');
  correoInstitucional(v.tice.correo, 'tice.correo');
  if (v.director.correo === v.tice.correo) throw invalido('El Jefe de TI y el TICE deben tener correos distintos');
  if (typeof v.password !== 'string' || v.password.length < 8) throw invalido('La contraseña inicial debe tener al menos 8 caracteres');
  return v;
}

async function instalarDatosReales(datos, usuarioQueInstala) {
  const v = validarInstalacion(datos);
  const hash = await bcrypt.hash(v.password, 10);
  await migrar({ forzar: true });
  return tx(async (c) => {
    const { rows: [sede] } = await c.query(
      'INSERT INTO sedes (codigo, nombre, correo_buzon) VALUES ($1,$2,$3) RETURNING *', [v.sede.codigo, v.sede.nombre, v.sede.correo_buzon]);
    const { rows: [director] } = await c.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES ($1,$2,$3,'DIRECTOR') RETURNING id, correo`,
      [v.director.nombre, v.director.correo, hash]);
    const { rows: [tice] } = await c.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol, sede_id) VALUES ($1,$2,$3,'TICE',$4) RETURNING id, correo`,
      [v.tice.nombre, v.tice.correo, hash, sede.id]);
    await registrar(c, null, {
      entidad: 'sistema', accion: 'CARGA_INICIAL', sedeId: sede.id,
      detalle: { sede: v.sede, director: director.correo, tice: tice.correo, solicitado_por: usuarioQueInstala?.correo ?? null },
    });
    return { sede, director, tice };
  });
}

module.exports = { instalarDatosReales, validarInstalacion };
