// Casos de prueba CP-23 a CP-30 (semana 10): importación del inventario desde Excel, correos del dominio
// institucional, inicio de sesión con Google, consulta SQL de solo lectura, separación de roles, KPI vigentes y respaldo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://tice:tice@localhost:5432/tice_test';
process.env.DOMINIOS_CORREO = 'colegio.edu.pe';
process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { crearApp } = require('../src/app');
const { pool, query } = require('../src/db');
const { migrar } = require('../src/scripts/migrate');
const { seed } = require('../src/scripts/seed');
const google = require('../src/lib/google');

const app = crearApp();
const PASSWORD = 'Tice2026!';
const tokens = {};
const auth = (quien) => ({ Authorization: `Bearer ${tokens[quien]}` });

before(async () => {
  await migrar({ forzar: true });
  await seed({ silencioso: true });
  for (const [k, c] of [['director', 'director.ti@colegio.edu.pe'], ['cen', 'tice.cen.usuario@colegio.edu.pe']]) {
    tokens[k] = (await request(app).post('/api/auth/login').send({ correo: c, password: PASSWORD })).body.token;
  }
});

after(async () => {
  await pool.end();
});

// Excel con el mismo formato que "INVENTARIO 2026" de la Sede Central
async function excel(filas) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('INVENTARIO 2026');
  hoja.addRow(['IET - Inventario de Equipos Tecnológicos']);
  hoja.addRow(['CÓDIGO', 'CATEGORÍA', 'MARCA', 'MODELO', 'NÚMERO DE SERIE', 'CARACTERÍSTICAS', 'MAC', 'ESTADO ACTUAL',
    'UBICACIÓN', 'RESPONSABLE', 'PROPIEDAD', 'FECHA DE INGRESO', 'GUIA/FACTURA', 'OBSERVACION', 'SEDE']);
  for (const f of filas) hoja.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const FILAS = [
  ['XAIO-01', 'PC ALL IN ONE', 'ASUS', 'V2201C', 'G4PTTS017617', 'Core i5, 12 GB', '74-C6-3B-37-40-B5', 'Operativo', 'SECRETARÍA', 'TICE', 'Propio', new Date(Date.UTC(2018, 7, 1)), null, null, 'CENTRAL'],
  ['XTV-01', 'TV', 'SAMSUNG', 'UN65AU7090GXPE', '4WRP39DW504222D', 'FHD 65"', 'no wifi', 'Defectuoso', 'AULA 04-6', 'TICE', 'Propio', 2015, null, null, 'CENTRAL'],
  ['XLAP-', 'LAPTOP', 'HP', '15DW', null, null, null, 'Operativo', 'AULA 01-8', 'TICE', 'Propio', null, null, null, 'CENTRAL'],
  ['XLAP 03', 'LAPTOP', 'TOSHIBA', 'C45', null, null, null, null, null, 'TICE', 'Propio', null, null, null, 'CENTRAL'],
  ['XAIO-01', 'PC ALL IN ONE', 'HP', 'ProOne', null, null, null, 'Operativo', 'AULA 02', 'TICE', 'Propio', null, null, null, 'CENTRAL'],
  ['XLAP-09', 'LAPTOP', 'HP', '15DW', null, null, null, 'Operativo', 'TICE', 'TICE', 'Alquilado', null, null, null, 'INDUSTRIAL'],
  ['XSRV-01', 'ROUTER', 'CISCO', 'X', null, null, null, 'Operativo', 'TICE', 'TICE', 'Propio', null, null, null, 'CENTRAL'],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'CENTRAL'],
];

test('CP-23 Importar inventario desde Excel: vista previa, filas excluidas con motivo, confirmación y reimportación', async () => {
  const archivo = await excel(FILAS);
  const subir = (quien, confirmar) => request(app).post(`/api/equipos/importar${confirmar ? '?confirmar=true' : ''}`)
    .set(auth(quien)).set('Content-Type', 'application/octet-stream').send(archivo);

  const vista = await subir('cen', false);
  assert.equal(vista.status, 200, JSON.stringify(vista.body));
  assert.equal(vista.body.confirmado, false);
  assert.equal(vista.body.resumen.nuevos, 2);
  assert.equal(vista.body.resumen.filas_vacias, 1);
  const motivos = Object.fromEntries(vista.body.excluidas.map((e) => [`${e.fila}:${e.codigo}`, e.motivo]));
  assert.match(motivos['5:XLAP-'], /incompleto/);
  assert.match(motivos['6:XLAP 03'], /Sin estado/);
  assert.match(motivos['7:XAIO-01'], /repetido/);
  assert.match(motivos['8:XLAP-09'], /otra sede/);
  assert.match(motivos['9:XSRV-01'], /Categoría no reconocida/);
  assert.ok(vista.body.avisos.some((a) => a.codigo === 'XTV-01' && /MAC/.test(a.aviso)));
  let { rows } = await query(`SELECT 1 FROM equipos WHERE codigo IN ('XAIO-01', 'XTV-01')`);
  assert.equal(rows.length, 0, 'la vista previa no guarda nada');

  const ok = await subir('cen', true);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.resumen.nuevos, 2);
  ({ rows } = await query(`SELECT e.*, t.nombre AS tipo FROM equipos e JOIN tipos_equipo t ON t.id = e.tipo_id
                             WHERE codigo IN ('XAIO-01', 'XTV-01') ORDER BY codigo`));
  const [aio, tv] = rows;
  assert.equal(aio.tipo, 'All in One');
  assert.equal(aio.fecha_adquisicion, '2018-08-01');
  assert.equal(aio.propiedad, 'PROPIO');
  assert.equal(aio.mac, '74-C6-3B-37-40-B5');
  assert.equal(tv.estado, 'AVERIADO');
  assert.equal(tv.fecha_adquisicion, null, 'un año solo no se convierte en fecha');
  assert.match(tv.observaciones, /Año de ingreso: 2015/);
  const { rows: log } = await query(`SELECT detalle FROM logs_auditoria WHERE accion = 'IMPORTAR_EXCEL'`);
  assert.equal(log.length, 1);

  const otra = await subir('cen', true);
  assert.equal(otra.body.resumen.nuevos, 0);
  assert.equal(otra.body.resumen.sin_cambios, 2, 'reimportar el mismo archivo no cambia nada');

  assert.equal((await subir('director', false)).status, 403, 'el Jefe de TI no carga inventario');
  const malo = await request(app).post('/api/equipos/importar').set(auth('cen'))
    .set('Content-Type', 'application/octet-stream').send(Buffer.from('no es un excel'));
  assert.equal(malo.status, 422);
});

test('CP-24 Solo se aceptan correos del dominio institucional para usuarios y buzones', async () => {
  const sede = (await query(`SELECT id FROM sedes WHERE codigo = 'SUR'`)).rows[0];
  const externo = await request(app).post('/api/usuarios').set(auth('director'))
    .send({ nombre: 'Externo', correo: 'alguien@gmail.com', rol: 'DIRECTOR', password: 'Clave12345' });
  assert.equal(externo.status, 400);
  assert.match(externo.body.error, /institucional/);
  const buzon = await request(app).put(`/api/sedes/${sede.id}`).set(auth('director')).send({ correo_buzon: 'tice.sur@hotmail.com' });
  assert.equal(buzon.status, 400);
  const ok = await request(app).post('/api/usuarios').set(auth('director'))
    .send({ nombre: 'Subdirector', correo: 'subdirector@colegio.edu.pe', rol: 'DIRECTOR', password: 'Clave12345' });
  assert.equal(ok.status, 201);
  const correos = await request(app).get('/api/correos?estado=TODOS').set(auth('cen'));
  assert.ok(correos.body.every((c) => typeof c.externo === 'boolean'));
});

test('CP-25 Iniciar sesión con Google: firma, destinatario, dominio y cuenta registrada', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  google.usarClaves(async () => [{ ...publicKey.export({ format: 'jwk' }), kid: 'clave-1', alg: 'RS256', use: 'sig' }]);
  const firmar = (email, extra = {}) => jwt.sign(
    { email, email_verified: true, name: 'Prueba', aud: process.env.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', ...extra },
    privateKey, { algorithm: 'RS256', keyid: 'clave-1', expiresIn: '5m' });

  const cfg = await request(app).get('/api/auth/config');
  assert.equal(cfg.body.google_client_id, process.env.GOOGLE_CLIENT_ID);

  const ok = await request(app).post('/api/auth/google').send({ credential: firmar('tice.cen.usuario@colegio.edu.pe') });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.usuario.rol, 'TICE');
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ok.body.token}`);
  assert.equal(me.status, 200);
  const { rows: [g] } = await query(`SELECT ultimo_metodo FROM usuarios WHERE correo = 'tice.cen.usuario@colegio.edu.pe'`);
  assert.equal(g.ultimo_metodo, 'GOOGLE');

  const sinCuenta = await request(app).post('/api/auth/google').send({ credential: firmar('nuevo@colegio.edu.pe') });
  assert.equal(sinCuenta.status, 403);
  const otroDominio = await request(app).post('/api/auth/google').send({ credential: firmar('alguien@gmail.com') });
  assert.equal(otroDominio.status, 403);
  const otraApp = await request(app).post('/api/auth/google').send({ credential: firmar('tice.cen.usuario@colegio.edu.pe', { aud: 'otra-app' }) });
  assert.equal(otraApp.status, 401);
  const falsa = jwt.sign({ email: 'tice.cen.usuario@colegio.edu.pe', email_verified: true, aud: process.env.GOOGLE_CLIENT_ID, iss: 'accounts.google.com' },
    crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, { algorithm: 'RS256', keyid: 'clave-1' });
  assert.equal((await request(app).post('/api/auth/google').send({ credential: falsa })).status, 401, 'firma de otra clave');
  google.usarClaves(null);
});

test('CP-26 Consulta SQL de solo lectura en el visor de la base de datos', async () => {
  const sql = (texto, quien = 'director') => request(app).post('/api/basedatos/consulta').set(auth(quien)).send({ sql: texto });
  const r = await sql(`SELECT codigo, estado FROM equipos WHERE codigo = 'XAIO-01'`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.columnas, ['codigo', 'estado']);
  assert.deepEqual(r.body.filas, [['XAIO-01', 'OPERATIVO']]);
  const u = await sql('SELECT u.* FROM usuarios u');
  const i = u.body.columnas.indexOf('password_hash');
  assert.ok(u.body.filas.every((f) => f[i] === '••••••'), 'no muestra los hashes');
  const borrar = await sql(`DELETE FROM equipos WHERE codigo = 'XAIO-01'`);
  assert.equal(borrar.status, 400);
  assert.match(borrar.body.error, /read-only|solo lectura/i);
  const dos = await sql(`SELECT 1; COMMIT; DELETE FROM equipos WHERE codigo = 'XAIO-01'`);
  assert.equal(dos.status, 400, 'una sola sentencia');
  assert.equal((await query(`SELECT 1 FROM equipos WHERE codigo = 'XAIO-01'`)).rows.length, 1);
  assert.equal((await sql('SELECT 1', 'cen')).status, 403);
  const muchas = await sql('SELECT generate_series(1, 2000) AS n');
  assert.equal(muchas.body.filas.length, 500);
  assert.equal(muchas.body.truncado, true);
});

test('CP-27 Roles: el Jefe de TI consulta y gestiona; el TICE registra el inventario', async () => {
  const tipo = (await query(`SELECT id FROM tipos_equipo WHERE nombre = 'Laptop'`)).rows[0].id;
  const nuevo = { codigo: 'XR-01', tipo_id: tipo, marca: 'HP', ubicacion: 'TICE' };
  assert.equal((await request(app).post('/api/equipos').set(auth('director')).send(nuevo)).status, 403);
  const creado = await request(app).post('/api/equipos').set(auth('cen')).send({ ...nuevo, mac: 'AA-BB-CC-DD-EE-FF', propiedad: 'Alquilado' });
  assert.equal(creado.status, 201);
  assert.equal(creado.body.propiedad, 'ALQUILADO');
  assert.equal((await request(app).put(`/api/equipos/${creado.body.id}`).set(auth('director')).send({ ubicacion: 'X' })).status, 403);
  assert.equal((await request(app).get(`/api/equipos/${creado.body.id}`).set(auth('director'))).status, 200);
});

test('CP-28 Dashboard con los KPI vigentes: TRI, TAI, ICI, PIR y DT calculados desde los datos', async () => {
  const r = await request(app).get('/api/dashboard').set(auth('director'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.indicadores.map((k) => k.sigla), ['TRI', 'TAI', 'ICI', 'PIR', 'DT']);
  const k = Object.fromEntries(r.body.indicadores.map((x) => [x.sigla, x]));
  const pct = (a, b) => Math.round((a / b) * 1000) / 10;

  // ICI y DT sobre los equipos activos (sin los dados de baja)
  const { rows: eq } = await query(`SELECT e.*, ee.operativo FROM equipos e JOIN estados_equipo ee ON ee.codigo = e.estado
                                     WHERE e.estado <> 'BAJA'`);
  const lleno = (v) => v !== null && String(v).trim() !== '';
  const completos = eq.filter((e) => /\d/.test(e.codigo) && [e.marca, e.modelo, e.serie, e.ubicacion].every(lleno)).length;
  assert.equal(k.ICI.n, eq.length);
  assert.equal(k.ICI.completos, completos);
  assert.equal(k.ICI.valor, pct(completos, eq.length));
  assert.equal(k.DT.valor, pct(eq.filter((e) => e.operativo).length, eq.length));

  // PIR: fallas recibidas por correo (sin las descartadas) que terminaron en un ticket resuelto
  const { rows: co } = await query(`SELECT c.estado, i.fecha_resolucion FROM correos_entrantes c
                                     LEFT JOIN incidencias i ON i.correo_id = c.id`);
  const fallas = co.filter((c) => c.estado !== 'DESCARTADO');
  const conTicket = fallas.filter((c) => c.estado === 'CONVERTIDO' && c.fecha_resolucion).length;
  assert.ok(fallas.length > 0);
  assert.equal(k.PIR.valor, pct(conTicket, fallas.length));

  // líneas base del pre-test de la matriz de KPI
  assert.deepEqual([k.TRI.base, k.TAI.base, k.ICI.base, k.PIR.base, k.DT.base], [240, 10, 88.7, 0, 97.1]);

  // un equipo sin serie baja el ICI
  const tipo = (await query(`SELECT id FROM tipos_equipo WHERE nombre = 'Laptop'`)).rows[0].id;
  await request(app).post('/api/equipos').set(auth('cen')).send({ codigo: 'XICI-01', tipo_id: tipo, marca: 'HP', modelo: '15DW', ubicacion: 'TICE' });
  const r2 = await request(app).get('/api/dashboard').set(auth('director'));
  const ici2 = r2.body.indicadores.find((x) => x.sigla === 'ICI');
  assert.equal(ici2.n, eq.length + 1);
  assert.equal(ici2.completos, completos);
});

test('CP-29 RNF-07 Respaldo: el Jefe de TI descarga la base completa en .sql y la descarga queda en la bitácora', async () => {
  assert.equal((await request(app).get('/api/basedatos/respaldo').set(auth('cen'))).status, 403);
  const r = await request(app).get('/api/basedatos/respaldo').set(auth('director')).buffer(true).parse((res, cb) => {
    let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c; }); res.on('end', () => cb(null, d));
  });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-disposition'], /attachment; filename="respaldo_tice_\d+\.sql"/);
  for (const t of ['equipos', 'incidencias', 'usuarios', 'logs_auditoria']) assert.match(r.body, new RegExp(`CREATE TABLE public\\.${t} `));
  assert.match(r.body, /COPY public\.equipos /);
  const { rows: [l] } = await query(`SELECT * FROM logs_auditoria WHERE accion = 'RESPALDO' ORDER BY secuencia DESC LIMIT 1`);
  assert.ok(l && l.detalle.bytes > 0);
});

test('CP-30 La tabla de usuarios muestra el último ingreso y su método; con SOLO_GOOGLE solo se entra con Google', async () => {
  const login = await request(app).post('/api/auth/login').send({ correo: 'tice.cen.usuario@colegio.edu.pe', password: PASSWORD });
  assert.equal(login.status, 200);
  const r = await request(app).get('/api/usuarios').set(auth('director'));
  const u = r.body.find((x) => x.correo === 'tice.cen.usuario@colegio.edu.pe');
  assert.equal(u.ultimo_metodo, 'CONTRASENA');
  assert.ok(Date.now() - new Date(u.ultimo_acceso).getTime() < 60000);
  assert.ok(!('password_hash' in u));

  // SOLO_GOOGLE: con Google configurado ya no se acepta la contraseña
  const config = require('../src/config');
  config.soloGoogle = true;
  try {
    assert.equal((await request(app).get('/api/auth/config')).body.solo_google, true);
    const conClave = await request(app).post('/api/auth/login').send({ correo: 'tice.cen.usuario@colegio.edu.pe', password: PASSWORD });
    assert.equal(conClave.status, 403);
  } finally {
    config.soloGoogle = false;
  }
});
