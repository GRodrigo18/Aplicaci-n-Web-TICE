// Instalación con datos reales: borra la base (incluidos los datos de demostración) y deja la sede,
// el Jefe de TI y el TICE de la sede, listos para importar el inventario desde Excel.
// Uso desde la web: Base de datos → "Pasar a datos reales" (solo mientras la base tenga la demo).
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { tx, query } = require('../db');
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

// Instalación al arrancar, con las cuentas reales definidas en el entorno (Render → Environment), sin datos de
// demostración. Los correos y nombres no están en el código porque el repositorio es público.
//   CORREO_JEFE, CORREO_TICE (obligatorios), NOMBRE_JEFE, NOMBRE_TICE, SEDE_CODIGO (CEN), SEDE_NOMBRE (Sede Central),
//   BUZON_SEDE (por defecto el correo del TICE), CLAVE_INICIAL (opcional: sin ella solo se entra con Google)
//   INVENTARIO_INICIAL (opcional): ruta a un Excel, por ejemplo un Secret File de Render en /etc/secrets/
// Solo instala si la base está vacía o tiene la demostración; nunca toca una base que ya tiene datos reales.
async function instalarDesdeEntorno(env = process.env) {
  if (!env.CORREO_JEFE || !env.CORREO_TICE) return null;
  const { rows: [b] } = await query(
    `SELECT (SELECT count(*) FROM usuarios)::int AS usuarios,
            (SELECT count(*) FROM logs_auditoria WHERE accion = 'CARGA_DEMO')::int AS demo`);
  if (b.usuarios > 0 && b.demo === 0) return null;
  if (!env.CLAVE_INICIAL && !config.googleClientId) {
    console.error('CORREO_JEFE y CORREO_TICE necesitan GOOGLE_CLIENT_ID o CLAVE_INICIAL para poder entrar; no se instaló nada');
    return null;
  }
  const datos = {
    sede: { codigo: env.SEDE_CODIGO || 'CEN', nombre: env.SEDE_NOMBRE || 'Sede Central', correo_buzon: env.BUZON_SEDE || env.CORREO_TICE },
    director: { nombre: env.NOMBRE_JEFE || 'Jefe de TI', correo: env.CORREO_JEFE },
    tice: { nombre: env.NOMBRE_TICE || 'TICE de la sede', correo: env.CORREO_TICE },
    // sin CLAVE_INICIAL la contraseña es aleatoria y nadie la conoce: se entra con Google
    password: env.CLAVE_INICIAL || crypto.randomBytes(24).toString('base64url'),
  };
  // se valida antes de borrar nada; con un dato mal escrito la base queda como estaba y el sistema sigue funcionando
  try { validarInstalacion(datos); } catch (err) {
    console.error(`Cuentas del entorno inválidas, no se instaló nada: ${err.message}`);
    return null;
  }
  const r = await instalarDatosReales(datos, null);
  console.log(`Cuentas reales creadas: ${r.director.correo} (Jefe de TI) y ${r.tice.correo} (TICE)`);
  if (env.INVENTARIO_INICIAL) {
    // si el archivo falla las cuentas quedan creadas y el inventario se puede importar desde Inventario → Importar Excel
    try { r.inventario = await importarInicial(env.INVENTARIO_INICIAL, r.sede, r.tice.id); } catch (err) {
      console.error(`No se pudo importar el inventario inicial (${env.INVENTARIO_INICIAL}): ${err.message}`);
    }
  }
  return r;
}

// Carga el inventario de la sede desde el Excel, con las mismas reglas que Inventario → Importar Excel
async function importarInicial(ruta, sede, ticeId) {
  const { analizarExcel } = require('../lib/importar');
  const { insertarEquipo } = require('../routes/equipos');
  const { rows: tipos } = await query('SELECT id, nombre FROM tipos_equipo');
  const { rows: [usuario] } = await query('SELECT * FROM usuarios WHERE id = $1', [ticeId]);
  const a = await analizarExcel(fs.readFileSync(ruta), { tipos, sede });
  await tx(async (c) => {
    for (const v of a.validas) await insertarEquipo(c, usuario, sede.id, v.codigo, v.datos, { origen: 'Inventario inicial', fila: v.fila });
    await registrar(c, usuario, {
      entidad: 'equipo', accion: 'IMPORTAR_EXCEL', sedeId: sede.id,
      detalle: { hoja: a.hoja, nuevos: a.validas.length, excluidas: a.excluidas.length, avisos: a.avisos.length, origen: 'Inventario inicial' },
    });
  });
  console.log(`Inventario inicial: ${a.validas.length} equipos importados, ${a.excluidas.length} filas excluidas`);
  return { importados: a.validas.length, excluidas: a.excluidas.length };
}

module.exports = { instalarDatosReales, validarInstalacion, instalarDesdeEntorno };
