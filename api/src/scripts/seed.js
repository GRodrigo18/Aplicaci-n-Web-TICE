// Datos de demostración: 5 sedes, el Director de TI, un TICE por sede, equipos, tickets y correos.
// Solo se cargan si la base no tiene usuarios. Los nombres y valores son de ejemplo.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../db');
const { migrar } = require('./migrate');
const { registrar } = require('../lib/bitacora');
const { prioridadItil } = require('../lib/util');

const PASSWORD = process.env.SEED_PASSWORD || 'Tice2026!';

const SEDES = [
  ['CEN', 'Sede Central', 'tice.central@colegio.edu.pe'],
  ['SUR', 'Sede Lima Sur', 'tice.sur@colegio.edu.pe'],
  ['HUA', 'Sede Huaura', 'tice.huaura@colegio.edu.pe'],
  ['IND', 'Sede Industrial', 'tice.industrial@colegio.edu.pe'],
  ['ASC', 'Sede La Ascensión', 'tice.ascension@colegio.edu.pe'],
];

const AMBIENTES = ['Secretaría', 'Dirección', 'Laboratorio 1', 'Laboratorio 2', 'Aula 1A', 'Aula 1B', 'Aula 2A',
  'Aula 3A', 'Aula 4A', 'Aula 5A', 'Sala de profesores', 'Biblioteca', 'Coordinación'];

async function seed({ silencioso = false } = {}) {
  await migrar();
  const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM usuarios');
  if (n > 0) {
    if (!silencioso) console.log('La base ya tiene usuarios; no se cargan datos de demostración');
    return false;
  }
  const hash = await bcrypt.hash(PASSWORD, 10);
  await tx(async (c) => {
    const sedes = [];
    for (const [codigo, nombre, buzon] of SEDES) {
      const { rows: [s] } = await c.query(
        'INSERT INTO sedes (codigo, nombre, correo_buzon) VALUES ($1,$2,$3) RETURNING *', [codigo, nombre, buzon]);
      sedes.push(s);
    }
    const { rows: [director] } = await c.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES ('Director de TI', 'director.ti@colegio.edu.pe', $1, 'DIRECTOR') RETURNING *`,
      [hash]);
    await registrar(c, null, { entidad: 'sistema', accion: 'CARGA_DEMO', detalle: { sedes: SEDES.length } });
    const tices = {};
    const nombresTice = ['Rodrigo Grados', 'TICE Lima Sur', 'TICE Huaura', 'TICE Industrial', 'TICE La Ascensión'];
    for (const [i, s] of sedes.entries()) {
      const correo = `tice.${s.codigo.toLowerCase()}.usuario@colegio.edu.pe`;
      const { rows: [u] } = await c.query(
        `INSERT INTO usuarios (nombre, correo, password_hash, rol, sede_id) VALUES ($1,$2,$3,'TICE',$4) RETURNING *`,
        [nombresTice[i], correo, hash, s.id]);
      tices[s.id] = u;
      await registrar(c, director, { entidad: 'usuario', entidadId: u.id, accion: 'CREAR', sedeId: s.id, detalle: { correo, rol: 'TICE' } });
    }

    const { rows: tipos } = await c.query('SELECT * FROM tipos_equipo');
    const tipo = (n) => tipos.find((t) => t.nombre === n).id;
    const modelos = [
      ['PC All in One', 'LENOVO', 'IdeaCentre AIO 3', 'AIO'], ['PC de escritorio', 'HP', 'ProDesk 400 G7', 'PC'],
      ['Laptop', 'HP', '240 G8', 'LAP'], ['Proyector', 'EPSON', 'PowerLite X49', 'PRY'],
      ['Impresora', 'EPSON', 'L5590', 'IMP'], ['Televisor', 'SAMSUNG', 'Crystal UHD 65"', 'TV'],
      ['Access point', 'TP-LINK', 'EAP225', 'AP'],
    ];
    // 60 equipos en la Sede Central y 8 en cada una de las otras sedes
    for (const s of sedes) {
      const total = s.codigo === 'CEN' ? 60 : 8;
      const contador = {};
      for (let k = 0; k < total; k++) {
        const [t, marca, modelo, pref] = modelos[k % modelos.length];
        contador[pref] = (contador[pref] || 0) + 1;
        const codigo = `${s.codigo}-${pref}-${String(contador[pref]).padStart(3, '0')}`;
        const estado = k % 17 === 5 ? 'MANTENIMIENTO' : k % 23 === 7 ? 'AVERIADO' : 'OPERATIVO';
        const ubicacion = AMBIENTES[k % AMBIENTES.length];
        const { rows: [e] } = await c.query(
          `INSERT INTO equipos (sede_id, codigo, tipo_id, marca, modelo, serie, fecha_adquisicion, estado, ubicacion, qr_token)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [s.id, codigo, tipo(t), marca, modelo, `SN${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            `20${19 + (k % 6)}-0${1 + (k % 9)}-15`, estado, ubicacion, crypto.randomBytes(12).toString('hex')]);
        await registrar(c, tices[s.id], { entidad: 'equipo', entidadId: e.id, accion: 'CREAR', sedeId: s.id, detalle: { codigo, carga: 'demo' } });
      }
    }

    // Tickets resueltos de ejemplo en la Sede Central (para que el dashboard tenga datos)
    const central = sedes[0];
    const { rows: eqCentral } = await c.query('SELECT id, codigo FROM equipos WHERE sede_id = $1 ORDER BY id', [central.id]);
    const ejemplos = [
      ['El proyector no da imagen', 'Proyector y multimedia', 'MEDIO', 'ALTA', 18, 'CEN-PRY-002'],
      ['Sin internet en el Laboratorio', 'Red e internet', 'ALTO', 'ALTA', 15, 'CEN-AP-001'],
      ['La impresora atora papel', 'Impresora', 'MEDIO', 'MEDIA', 70, 'CEN-IMP-001'],
      ['Instalar Office en la laptop', 'Software', 'BAJO', 'BAJA', 300, 'CEN-LAP-001'],
      ['El monitor parpadea', 'Hardware', 'BAJO', 'MEDIA', 95, 'CEN-AIO-002'],
      ['No puedo entrar a mi correo institucional', 'Cuentas y accesos', 'BAJO', 'ALTA', 25, 'CEN-PC-001'],
    ];
    for (const [i, [asunto, categoria, impacto, urgencia, minutos, codigoEquipo]] of ejemplos.entries()) {
      const registro = new Date(Date.now() - (i + 1) * 26 * 3600 * 1000);
      const resolucion = new Date(registro.getTime() + minutos * 60000);
      const { rows: [t] } = await c.query(
        `INSERT INTO incidencias (sede_id, solicitante_correo, solicitante_nombre, asunto, descripcion, categoria, impacto, urgencia,
                                  prioridad, estado, asignado_a, diagnostico, solucion, fecha_registro, fecha_inicio, fecha_resolucion, fecha_cierre)
         VALUES ($1,$2,$3,$4,$12,$5,$6,$7,$8,'CERRADO',$9,'Revisión en sitio','Se corrigió la falla y se probó con el usuario',$10,$10,$11,$11)
         RETURNING id, numero`,
        [central.id, `docente${i + 1}@colegio.edu.pe`, `Docente ${i + 1}`, asunto, categoria, impacto, urgencia,
          prioridadItil(impacto, urgencia), tices[central.id].id, registro, resolucion, asunto]);
      await c.query('INSERT INTO incidencia_equipos VALUES ($1,$2)', [t.id, eqCentral.find((e) => e.codigo === codigoEquipo).id]);
      await registrar(c, tices[central.id], { entidad: 'incidencia', entidadId: t.id, accion: 'CREAR', sedeId: central.id, detalle: { numero: t.numero, carga: 'demo' } });
    }

    // Correos por atender en la bandeja de la Sede Central
    const correos = [
      ['lucia.ramos@colegio.edu.pe', 'Lucía Ramos', 'Urgente: proyector del Aula 1A no enciende',
        `Buen día, estoy en clase ahora y el proyector ${eqCentral.find((e) => e.codigo === 'CEN-PRY-001').codigo} no enciende. ¿Me pueden ayudar?`],
      ['jorge.paredes@colegio.edu.pe', 'Jorge Paredes', 'Laboratorio 2 sin internet para el examen',
        'Las computadoras del Laboratorio 2 no tienen internet y en la próxima clase tenemos evaluación en línea.'],
      ['administracion@colegio.edu.pe', 'Administración', 'Reunión de coordinación del viernes',
        'Les recordamos la reunión de coordinación general del viernes a las 3 p. m.'],
    ];
    for (const [i, [de, nombre, asunto, cuerpo]] of correos.entries()) {
      const { rows: [m] } = await c.query(
        `INSERT INTO correos_entrantes (sede_id, remitente, remitente_nombre, asunto, cuerpo, recibido_en)
         VALUES ($1,$2,$3,$4,$5, now() - make_interval(mins => $6)) RETURNING id`,
        [central.id, de, nombre, asunto, cuerpo, (i + 1) * 4]);
      await registrar(c, null, { entidad: 'correo', entidadId: m.id, accion: 'RECIBIR', sedeId: central.id, detalle: { de, asunto } });
    }
  });
  if (!silencioso) {
    console.log('Datos de demostración cargados.');
    console.log(`  Director de TI: director.ti@colegio.edu.pe / ${PASSWORD}`);
    console.log(`  TICE Sede Central: tice.cen.usuario@colegio.edu.pe / ${PASSWORD}`);
  }
  return true;
}

if (require.main === module) {
  seed().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { seed };
