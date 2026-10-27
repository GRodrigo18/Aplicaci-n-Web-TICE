// Datos de demostración: las 5 sedes, el Director de TI, un TICE por sede y el inventario de la Sede Central
// (la única sede cargada en este periodo, como dice el alcance del informe), con 10 semanas de tickets,
// correos por atender y auditorías por QR. Solo se cargan si la base no tiene usuarios.
// Los nombres y valores son de ejemplo.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../db');
const { migrar } = require('./migrate');
const { registrar } = require('../lib/bitacora');
const { prioridadItil, diasHabiles } = require('../lib/util');

const PASSWORD = process.env.SEED_PASSWORD || 'Tice2026!';
// Si cambia el contenido de la demo, se sube la versión y una base que solo tiene la demo anterior se recarga
const VERSION_DEMO = 2;

const SEDES = [
  ['CEN', 'Sede Central', 'tice.central@colegio.edu.pe'],
  ['SUR', 'Sede Lima Sur', 'tice.sur@colegio.edu.pe'],
  ['HUA', 'Sede Huaura', 'tice.huaura@colegio.edu.pe'],
  ['IND', 'Sede Industrial', 'tice.industrial@colegio.edu.pe'],
  ['ASC', 'Sede La Ascensión', 'tice.ascension@colegio.edu.pe'],
];
const NOMBRES_TICE = ['Rodrigo Grados', 'TICE Lima Sur', 'TICE Huaura', 'TICE Industrial', 'TICE La Ascensión'];

const AULAS = ['Aula 101', 'Aula 102', 'Aula 103', 'Aula 201', 'Aula 202', 'Aula 203', 'Aula 301', 'Aula 302', 'Aula 303',
  'Aula 401', 'Aula 402', 'Aula 501', 'Aula 502'];
const OFICINAS = ['Dirección', 'Secretaría', 'Coordinación académica', 'Sala de Profesores', 'Biblioteca', 'Auditorio', 'Almacén TICE'];
const LABS = ['Laboratorio de Cómputo 1', 'Laboratorio de Cómputo 2'];

// Inventario de la Sede Central: [tipo, prefijo, cantidad, [marca, modelo][], ambientes]
const INVENTARIO = [
  ['Computadora de escritorio', 'PC', 136, [['HP', 'ProDesk 400 G7'], ['Lenovo', 'ThinkCentre M70s'], ['Dell', 'OptiPlex 3080']], [...LABS, ...OFICINAS]],
  ['Laptop', 'LAP', 67, [['HP', '240 G8'], ['Lenovo', 'IdeaPad 3'], ['Dell', 'Latitude 3420']], ['Sala de Profesores', 'Coordinación académica', 'Almacén TICE', ...AULAS]],
  ['Monitor', 'MON', 62, [['LG', '22MK430H'], ['Samsung', 'S24R350']], [...LABS, ...OFICINAS]],
  ['Proyector', 'PRY', 35, [['Epson', 'PowerLite X49'], ['Epson', 'PowerLite W52+'], ['ViewSonic', 'PA503S']], [...AULAS, 'Auditorio', 'Laboratorio de Cómputo 1']],
  ['Tablet', 'TAB', 26, [['Samsung', 'Galaxy Tab A8'], ['Lenovo', 'Tab M10']], ['Almacén TICE', 'Biblioteca']],
  ['Impresora', 'IMP', 25, [['Epson', 'EcoTank L5590'], ['HP', 'LaserJet Pro M404'], ['Brother', 'DCP-T720DW']], OFICINAS],
  ['Access point', 'AP', 18, [['TP-Link', 'EAP245'], ['Ubiquiti', 'UniFi U6 Lite']], [...AULAS, ...OFICINAS]],
  ['Pizarra digital', 'PZ', 13, [['ViewSonic', 'IFP6550'], ['Samsung', 'Flip 2']], AULAS],
  ['Switch de red', 'SW', 8, [['TP-Link', 'TL-SG1024D'], ['Cisco', 'CBS250-24T']], ['Almacén TICE', ...LABS, 'Dirección']],
  ['UPS', 'UPS', 7, [['APC', 'Back-UPS 1500'], ['Forza', 'NT-1012U']], ['Almacén TICE', ...LABS]],
];

// Correos que siguen en la bandeja de la Sede Central
const CORREOS_POR_ATENDER = [
  ['jvargas@colegio.edu.pe', 'Prof. Julio Vargas', 'Proyector del aula no proyecta',
    'Buenos días,\nEl proyector SC-PRY-0001 del Aula 102 no proyecta imagen, solo sale la pantalla azul. Tengo clase a las 10.\nGracias.\nJulio Vargas', 6],
  ['secretaria.academica@colegio.edu.pe', 'Secretaría académica', 'Impresora de secretaría atascada',
    'Hola, la impresora SC-IMP-0001 no imprime y muestra un atasco de papel. La necesitamos hoy para las constancias.', 28],
  ['erios@colegio.edu.pe', 'Prof. Elena Ríos', 'No puedo ingresar a la plataforma',
    'Estimados, desde ayer no puedo entrar a la plataforma educativa con mi usuario; me dice que la contraseña es incorrecta.', 60],
];

// Tickets abiertos y por cerrar: [asunto, categoría, impacto, urgencia, minutos desde el registro, código, solicitante, estado]
const ABIERTOS = [
  ['El proyector no proyecta imagen, solo muestra pantalla azul', 'Proyección y audio', 'MEDIO', 'ALTA', 4080, 'SC-PRY-0017', 'Coordinación de secundaria', 'PENDIENTE'],
  ['La computadora no enciende desde esta mañana', 'Hardware', 'MEDIO', 'ALTA', 200, 'SC-PC-0021', 'Prof. Rosa Medina', 'PENDIENTE'],
  ['La PC está muy lenta y aparecen ventanas emergentes (posible virus)', 'Software', 'MEDIO', 'MEDIA', 40, 'SC-PC-0122', 'Prof. Julio Vargas', 'PENDIENTE'],
  ['Solicitud: instalar la impresora de secretaría en la PC nueva', 'Impresión', 'BAJO', 'BAJA', 150, 'SC-IMP-0022', 'Secretaría académica', 'PENDIENTE'],
  ['La laptop se apaga sola a los pocos minutos de uso', 'Hardware', 'BAJO', 'MEDIA', 300, 'SC-LAP-0023', 'Prof. Andrés Paz', 'RESUELTO'],
];

// Fallas frecuentes para el historial de tickets cerrados
const HISTORIAL = [
  ['Sin internet en el laboratorio de cómputo, ninguna PC conecta', 'Red e internet', 'ALTO', 'ALTA', 'SW'],
  ['El proyector no proyecta imagen, solo muestra pantalla azul', 'Proyección y audio', 'MEDIO', 'ALTA', 'PRY'],
  ['Docente bloqueado en la plataforma educativa, no puede ingresar', 'Cuentas y accesos', 'BAJO', 'ALTA', 'LAP'],
  ['La impresora atasca el papel en cada hoja', 'Impresión', 'MEDIO', 'MEDIA', 'IMP'],
  ['El monitor parpadea y se apaga', 'Hardware', 'BAJO', 'MEDIA', 'MON'],
  ['Instalar el programa de la evaluación en la laptop', 'Software', 'BAJO', 'BAJA', 'LAP'],
  ['La pizarra digital no responde al tacto', 'Proyección y audio', 'MEDIO', 'MEDIA', 'PZ'],
  ['El access point del aula no da señal', 'Red e internet', 'MEDIO', 'ALTA', 'AP'],
  ['La computadora se reinicia sola', 'Hardware', 'BAJO', 'MEDIA', 'PC'],
  ['La tablet no carga', 'Hardware', 'BAJO', 'BAJA', 'TAB'],
];
const SOLICITANTES = ['Prof. Martín Castro', 'Prof. Rosa Medina', 'Prof. Julio Vargas', 'Prof. Elena Ríos', 'Prof. Andrés Paz', 'Biblioteca',
  'Secretaría académica', 'Coordinación de secundaria'];

const MIN = 60000;
const DIA = 24 * 60 * MIN;
const correoDe = (nombre) => `${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^prof\. /, '')
  .replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.')}@colegio.edu.pe`;

// Generador pseudoaleatorio con semilla: la demo sale igual cada vez
function azar(semilla) {
  let s = semilla;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

// Fecha en horario escolar (lunes a viernes, 7:30 a 15:00) a `dias` días antes de ahora
function horarioEscolar(ahora, dias, r) {
  const d = new Date(ahora.getTime() - dias * DIA);
  while ([0, 6].includes(d.getDay())) d.setTime(d.getTime() - DIA);
  d.setHours(7, 30 + Math.floor(r() * 420), 0, 0);
  return d;
}

async function seed({ silencioso = false } = {}) {
  await migrar();
  const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM usuarios');
  if (n > 0) {
    if (!silencioso) console.log('La base ya tiene usuarios; no se cargan datos de demostración');
    return false;
  }
  const r = azar(2026);
  const ahora = new Date();
  const hash = await bcrypt.hash(PASSWORD, 10);
  // la bitácora se escribe al final, en orden de fecha, para que la cadena de hashes siga la historia
  const logs = [];
  const log = (fecha, usuario, datos) => logs.push({ fecha, usuario, datos });

  await tx(async (c) => {
    const migracion = new Date(ahora.getTime() - 85 * DIA);
    migracion.setHours(10, 0, 0, 0);
    const sedes = [];
    for (const [codigo, nombre, buzon] of SEDES) {
      const { rows: [s] } = await c.query(
        'INSERT INTO sedes (codigo, nombre, correo_buzon) VALUES ($1,$2,$3) RETURNING *', [codigo, nombre, buzon]);
      sedes.push(s);
    }
    const { rows: [director] } = await c.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES ('Director de TI', 'director.ti@colegio.edu.pe', $1, 'DIRECTOR') RETURNING *`,
      [hash]);
    log(new Date(migracion.getTime() - 60 * MIN), null, { entidad: 'sistema', accion: 'CARGA_DEMO', detalle: { sedes: SEDES.length, version: VERSION_DEMO } });
    const tices = {};
    for (const [i, s] of sedes.entries()) {
      const correo = `tice.${s.codigo.toLowerCase()}.usuario@colegio.edu.pe`;
      const { rows: [u] } = await c.query(
        `INSERT INTO usuarios (nombre, correo, password_hash, rol, sede_id) VALUES ($1,$2,$3,'TICE',$4) RETURNING *`,
        [NOMBRES_TICE[i], correo, hash, s.id]);
      tices[s.id] = u;
      log(new Date(migracion.getTime() - 30 * MIN), director, { entidad: 'usuario', entidadId: u.id, accion: 'CREAR', sedeId: s.id, detalle: { correo, rol: 'TICE' } });
    }
    const central = sedes[0];
    const tice = tices[central.id];

    // Inventario migrado desde las hojas de cálculo de la Sede Central
    const { rows: tipos } = await c.query('SELECT * FROM tipos_equipo');
    const equipos = [];
    let k = 0;
    for (const [tipo, pref, cantidad, modelos, ambientes] of INVENTARIO) {
      const tipoId = tipos.find((t) => t.nombre === tipo).id;
      for (let i = 1; i <= cantidad; i++, k++) {
        const codigo = `SC-${pref}-${String(i).padStart(4, '0')}`;
        const [marca, modelo] = modelos[(i - 1) % modelos.length];
        const ubicacion = codigo === 'SC-PRY-0001' ? 'Aula 102' : ambientes[(i * 7 + k) % ambientes.length];
        const estado = k % 22 === 9 ? 'MANTENIMIENTO' : k % 36 === 17 ? 'AVERIADO' : 'OPERATIVO';
        const adquisicion = new Date(2019 + Math.floor(r() * 8), Math.floor(r() * 12), 1 + Math.floor(r() * 27));
        const fechaAdq = adquisicion > ahora ? '2026-03-28' : adquisicion.toISOString().slice(0, 10);
        const { rows: [e] } = await c.query(
          `INSERT INTO equipos (sede_id, codigo, tipo_id, marca, modelo, serie, fecha_adquisicion, estado, ubicacion, qr_token, creado_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [central.id, codigo, tipoId, marca, modelo, `${marca.slice(0, 2).toUpperCase()}${Math.floor(r() * 9e6 + 1e6)}${String.fromCharCode(65 + (k % 26))}`,
            fechaAdq, estado, ubicacion, crypto.randomBytes(12).toString('hex'), migracion]);
        equipos.push(e);
        log(new Date(migracion.getTime() + k * 1000), tice, { entidad: 'equipo', entidadId: e.id, accion: 'CREAR', sedeId: central.id, detalle: { codigo, origen: 'hoja de cálculo' } });
      }
    }
    // tres equipos dados de baja por obsolescencia
    for (const codigo of ['SC-PC-0136', 'SC-MON-0062', 'SC-PRY-0035']) {
      const e = equipos.find((x) => x.codigo === codigo);
      const fecha = new Date(migracion.getTime() + 20 * DIA);
      await c.query(`UPDATE equipos SET estado = 'BAJA', motivo_baja = $2, fecha_baja = $3 WHERE id = $1`,
        [e.id, 'Equipo obsoleto, sin reparación posible', fecha]);
      e.estado = 'BAJA';
      log(fecha, tice, { entidad: 'equipo', entidadId: e.id, accion: 'BAJA', sedeId: central.id, detalle: { codigo, motivo: 'Equipo obsoleto, sin reparación posible' } });
    }
    const porCodigo = (codigo) => equipos.find((e) => e.codigo === codigo);
    const activos = equipos.filter((e) => e.estado !== 'BAJA');

    // Auditoría #1 por pistoleo QR: dos días, con 5 equipos que no se encontraron
    const ini1 = horarioEscolar(ahora, 22, r);
    ini1.setHours(8, 10, 0, 0);
    const fin1 = new Date(ini1.getTime() + DIA + 6 * 3600000);
    const faltantes = new Set(['SC-TAB-0026', 'SC-LAP-0067', 'SC-UPS-0007', 'SC-TAB-0025', 'SC-MON-0061']);
    const reubicados = new Set(['SC-LAP-0040', 'SC-PRY-0020']);
    const { rows: [a1] } = await c.query(
      `INSERT INTO auditorias_inventario (sede_id, usuario_id, estado, fecha_inicio, equipos_esperados) VALUES ($1,$2,'EN_CURSO',$3,$4) RETURNING *`,
      [central.id, tice.id, ini1, activos.length]);
    log(ini1, tice, { entidad: 'auditoria', entidadId: a1.id, accion: 'INICIAR', sedeId: central.id, detalle: { equipos_esperados: activos.length } });
    let encontrados = 0;
    const leidos = activos.filter((e) => !faltantes.has(e.codigo));
    for (const [i, e] of leidos.entries()) {
      const leido = new Date(ini1.getTime() + (i / leidos.length) * (fin1 - ini1));
      const reubicado = reubicados.has(e.codigo);
      const ambiente = reubicado ? 'Sala de Profesores' : e.ubicacion;
      const anterior = e.ubicacion;
      await c.query(
        `INSERT INTO auditoria_items (auditoria_id, equipo_id, ambiente, ubicacion_anterior, resultado, leido_en) VALUES ($1,$2,$3,$4,$5,$6)`,
        [a1.id, e.id, ambiente, e.ubicacion, reubicado ? 'REUBICADO' : 'ENCONTRADO', leido]);
      await c.query('UPDATE equipos SET ultima_verificacion = $2, ubicacion = $3 WHERE id = $1', [e.id, leido, ambiente]);
      e.ubicacion = ambiente;
      e.ultima_verificacion = leido;
      if (!reubicado) encontrados++;
      log(leido, tice, { entidad: 'equipo', entidadId: e.id, accion: reubicado ? 'REUBICADO_EN_AUDITORIA' : 'VERIFICADO', sedeId: central.id,
        detalle: { codigo: e.codigo, auditoria_id: a1.id, ...(reubicado ? { cambios: { ubicacion: { antes: anterior, despues: ambiente } } } : {}) } });
    }
    const tel = Math.round((encontrados / activos.length) * 10000) / 100;
    const tai = diasHabiles(ini1, fin1);
    await c.query(
      `UPDATE auditorias_inventario SET estado='FINALIZADA', fecha_fin=$2, equipos_encontrados=$3, equipos_reubicados=$4,
              equipos_faltantes=$5, tel=$6, tai_dias=$7 WHERE id=$1`,
      [a1.id, fin1, encontrados, reubicados.size, faltantes.size, tel, tai]);
    log(fin1, tice, { entidad: 'auditoria', entidadId: a1.id, accion: 'FINALIZAR', sedeId: central.id,
      detalle: { esperados: activos.length, encontrados, reubicados: reubicados.size, faltantes: faltantes.size, tel, tai_dias: tai } });

    // Tickets cerrados de las últimas 10 semanas: el MTTR baja de ~3 h a ~30 min al usar el sistema
    const tickets = [];
    const crearTicket = async ({ asunto, categoria, impacto, urgencia, equipo, solicitante, registro, minutos, estado, origen }) => {
      const prioridad = prioridadItil(impacto, urgencia);
      const correo = correoDe(solicitante);
      const inicio = minutos !== null ? new Date(registro.getTime() + Math.min(10, minutos / 3) * MIN) : null;
      const resolucion = minutos !== null ? new Date(registro.getTime() + minutos * MIN) : null;
      const cierre = estado === 'CERRADO' ? new Date(resolucion.getTime() + 40 * MIN) : null;
      let correoId = null;
      if (origen === 'correo') {
        const { rows: [m] } = await c.query(
          `INSERT INTO correos_entrantes (sede_id, remitente, remitente_nombre, asunto, cuerpo, recibido_en, estado, atendido_en)
           VALUES ($1,$2,$3,$4,$5,$6,'CONVERTIDO',$7) RETURNING id`,
          [central.id, correo, solicitante, asunto, `${asunto}. Equipo ${equipo.codigo} en ${equipo.ubicacion}.`, new Date(registro.getTime() - 3 * MIN), registro]);
        correoId = m.id;
        log(new Date(registro.getTime() - 3 * MIN), null, { entidad: 'correo', entidadId: m.id, accion: 'RECIBIR', sedeId: central.id, detalle: { de: correo, asunto } });
      }
      const resuelto = ['RESUELTO', 'CERRADO'].includes(estado);
      const { rows: [t] } = await c.query(
        `INSERT INTO incidencias (sede_id, correo_id, solicitante_correo, solicitante_nombre, asunto, descripcion, categoria, impacto, urgencia,
                                  prioridad, estado, asignado_a, diagnostico, solucion, fecha_registro, fecha_inicio, fecha_resolucion, fecha_cierre, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$15) RETURNING id, numero`,
        [central.id, correoId, correo, solicitante, asunto, `${asunto}. Equipo ${equipo.codigo} en ${equipo.ubicacion}.`, categoria, impacto, urgencia,
          prioridad, estado, tice.id, resuelto ? 'Revisión en sitio' : null, resuelto ? 'Se corrigió la falla y se probó con el usuario' : null,
          registro, estado === 'PENDIENTE' ? null : inicio, resuelto ? resolucion : null, cierre]);
      await c.query('INSERT INTO incidencia_equipos VALUES ($1,$2)', [t.id, equipo.id]);
      const de = origen === 'correo' ? `desde el correo de ${solicitante}` : origen === 'qr' ? 'por lectura QR' : 'registrado en la mesa de ayuda';
      log(registro, tice, { entidad: 'incidencia', entidadId: t.id, accion: 'CREAR', sedeId: central.id,
        detalle: { numero: t.numero, prioridad, impacto, urgencia, equipos: [equipo.codigo], origen: de } });
      if (estado !== 'PENDIENTE') {
        log(inicio, tice, { entidad: 'incidencia', entidadId: t.id, accion: 'CAMBIO_ESTADO', sedeId: central.id,
          detalle: { numero: t.numero, cambios: { estado: { antes: 'PENDIENTE', despues: 'EN_PROCESO' } } } });
      }
      if (resuelto) {
        log(resolucion, tice, { entidad: 'incidencia', entidadId: t.id, accion: 'RESOLVER', sedeId: central.id,
          detalle: { numero: t.numero, minutos: Math.round(minutos), solucion: 'Se corrigió la falla y se probó con el usuario' } });
      }
      if (cierre) {
        log(cierre, tice, { entidad: 'incidencia', entidadId: t.id, accion: 'CAMBIO_ESTADO', sedeId: central.id,
          detalle: { numero: t.numero, cambios: { estado: { antes: 'RESUELTO', despues: 'CERRADO' } } } });
      }
      tickets.push(t);
      return t;
    };

    const pendientes = [];
    for (let semana = 9; semana >= 0; semana--) {
      // MTTR objetivo de la semana: de 190 min (semana más antigua) a 30 min (esta semana)
      const objetivo = 30 + (190 - 30) * (semana / 9) + (r() - 0.5) * 30;
      const cantidad = semana === 0 ? 2 : 3 + Math.floor(r() * 3);
      for (let j = 0; j < cantidad; j++) {
        const [asunto, categoria, impacto, urgencia, pref] = HISTORIAL[Math.floor(r() * HISTORIAL.length)];
        const candidatos = activos.filter((e) => e.codigo.startsWith(`SC-${pref}-`));
        const registro = horarioEscolar(ahora, semana * 7 + 1 + Math.floor(r() * 4), r);
        const minutos = Math.max(12, objetivo * (0.6 + r() * 0.8));
        if (registro.getTime() + (minutos + 60) * MIN > ahora.getTime()) continue;
        pendientes.push({ asunto, categoria, impacto, urgencia, equipo: candidatos[Math.floor(r() * candidatos.length)],
          solicitante: SOLICITANTES[Math.floor(r() * SOLICITANTES.length)], registro, minutos, estado: 'CERRADO',
          origen: r() < 0.7 ? 'correo' : r() < 0.5 ? 'qr' : 'manual' });
      }
    }
    pendientes.sort((x, y) => x.registro - y.registro);
    for (const p of pendientes) await crearTicket(p);
    for (const [asunto, categoria, impacto, urgencia, hace, codigo, solicitante, estado] of ABIERTOS) {
      await crearTicket({ asunto, categoria, impacto, urgencia, equipo: porCodigo(codigo), solicitante,
        registro: new Date(ahora.getTime() - hace * MIN), minutos: estado === 'RESUELTO' ? 24 : null, estado, origen: codigo === 'SC-PC-0021' ? 'qr' : 'correo' });
    }

    // Auditoría #2 en curso: empezó hoy y lleva 2 equipos leídos
    const ini2 = new Date(ahora.getTime() - 50 * MIN);
    const { rows: [a2] } = await c.query(
      `INSERT INTO auditorias_inventario (sede_id, usuario_id, estado, fecha_inicio, equipos_esperados) VALUES ($1,$2,'EN_CURSO',$3,$4) RETURNING *`,
      [central.id, tice.id, ini2, activos.length]);
    log(ini2, tice, { entidad: 'auditoria', entidadId: a2.id, accion: 'INICIAR', sedeId: central.id, detalle: { equipos_esperados: activos.length } });
    for (const [i, codigo] of ['SC-PRY-0015', 'SC-AP-0001'].entries()) {
      const e = porCodigo(codigo);
      const leido = new Date(ini2.getTime() + (i + 1) * 12 * MIN);
      await c.query(`INSERT INTO auditoria_items (auditoria_id, equipo_id, ambiente, ubicacion_anterior, resultado, leido_en) VALUES ($1,$2,$3,$3,'ENCONTRADO',$4)`,
        [a2.id, e.id, e.ubicacion, leido]);
      await c.query('UPDATE equipos SET ultima_verificacion = $2 WHERE id = $1', [e.id, leido]);
      log(leido, tice, { entidad: 'equipo', entidadId: e.id, accion: 'VERIFICADO', sedeId: central.id, detalle: { codigo, auditoria_id: a2.id } });
    }

    // Correos por atender en la bandeja de la Sede Central
    for (const [de, nombre, asunto, cuerpo, hace] of CORREOS_POR_ATENDER) {
      const recibido = new Date(ahora.getTime() - hace * MIN);
      const { rows: [m] } = await c.query(
        `INSERT INTO correos_entrantes (sede_id, remitente, remitente_nombre, asunto, cuerpo, recibido_en)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [central.id, de, nombre, asunto, cuerpo, recibido]);
      log(recibido, null, { entidad: 'correo', entidadId: m.id, accion: 'RECIBIR', sedeId: central.id, detalle: { de, asunto } });
    }

    logs.sort((x, y) => x.fecha - y.fecha);
    for (const l of logs) await registrar(c, l.usuario, { ...l.datos, fecha: l.fecha });
  });
  if (!silencioso) {
    console.log('Datos de demostración cargados.');
    console.log(`  Director de TI: director.ti@colegio.edu.pe / ${PASSWORD}`);
    console.log(`  TICE Sede Central: tice.cen.usuario@colegio.edu.pe / ${PASSWORD}`);
  }
  return true;
}

// Para el despliegue de demostración (DATOS_DEMO=true): si la base solo tiene una versión anterior de la demo
// (ningún usuario creado a mano), se recrea con la versión actual. Una base con datos reales nunca se toca.
async function actualizarDemo() {
  await migrar();
  const { rows: [u] } = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE correo = 'director.ti@colegio.edu.pe' OR correo LIKE 'tice.___.usuario@colegio.edu.pe')::int AS demo
       FROM usuarios`);
  if (u.total === 0) return seed({ silencioso: true });
  if (u.total !== u.demo) return false;
  const { rows: [l] } = await pool.query(
    `SELECT coalesce((detalle->>'version')::int, 1) AS version FROM logs_auditoria WHERE accion = 'CARGA_DEMO' ORDER BY secuencia LIMIT 1`);
  if (!l || l.version >= VERSION_DEMO) return false;
  await migrar({ forzar: true });
  return seed({ silencioso: true });
}

if (require.main === module) {
  seed().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { seed, actualizarDemo };
