// CP-38 Reporte de fallas por QR: el docente escanea la etiqueta, entra con su Google institucional (sin cuenta
// en el sistema) y el ticket se crea a su nombre con el equipo vinculado y el acuse por correo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://tice:tice@localhost:5432/tice_test';
process.env.DOMINIOS_CORREO = 'colegio.edu.pe';
process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { crearApp } = require('../src/app');
const { pool, query } = require('../src/db');
const { migrar } = require('../src/scripts/migrate');
const { seed } = require('../src/scripts/seed');
const google = require('../src/lib/google');
const config = require('../src/config');

const app = crearApp();
let firmar;

before(async () => {
  await migrar({ forzar: true });
  await seed({ silencioso: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  google.usarClaves(async () => [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }]);
  firmar = (email, name = 'Prof. Ana Rojas') => jwt.sign(
    { email, email_verified: true, name, aud: process.env.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com' },
    privateKey, { algorithm: 'RS256', keyid: 'k1', expiresIn: '5m' });
});

after(async () => {
  google.usarClaves(null);
  await pool.end();
});

test('CP-38 Reporte por QR: el docente reporta con su Google, sin cuenta, y no se duplica', async () => {
  const { rows: [e] } = await query(`SELECT * FROM equipos WHERE estado = 'OPERATIVO' ORDER BY id LIMIT 1`);
  // la página pública muestra solo lo necesario
  const info = await request(app).get(`/api/publico/equipos/${e.qr_token}`);
  assert.equal(info.status, 200);
  assert.equal(info.body.codigo, e.codigo);
  assert.equal(info.body.serie, undefined);
  assert.equal(info.body.id, undefined);
  assert.equal((await request(app).get('/api/publico/equipos/000000000000000000000000')).status, 404);

  const reportar = (cred, datos = {}) => request(app).post(`/api/publico/equipos/${e.qr_token}/reportes`)
    .send({ credential: cred, descripcion: 'No enciende, tengo clase', cuando: 'AHORA', a_quien: 'TODOS', ...datos });
  // con QR_SOLO_INSTITUCIONAL=true, una cuenta de fuera del dominio no puede reportar
  config.qrSoloInstitucional = true;
  assert.equal((await reportar(firmar('alguien@gmail.com'))).status, 403);
  config.qrSoloInstitucional = false;
  // faltan datos
  assert.equal((await reportar(firmar('ana.rojas@colegio.edu.pe'), { descripcion: '' })).status, 400);

  const r = await reportar(firmar('ana.rojas@colegio.edu.pe'));
  assert.equal(r.status, 201);
  assert.match(r.body.numero, /^TCK-\d{4}-\d{5}$/);
  const { rows: [t] } = await query(
    `SELECT i.*, (SELECT array_agg(equipo_id) FROM incidencia_equipos WHERE incidencia_id = i.id) AS equipos
       FROM incidencias i WHERE numero = $1`, [r.body.numero]);
  assert.equal(t.solicitante_correo, 'ana.rojas@colegio.edu.pe');
  assert.equal(t.solicitante_nombre, 'Prof. Ana Rojas');
  assert.equal(t.prioridad, 'CRITICA'); // afecta a todos y es ahora
  assert.deepEqual(t.equipos, [e.id]);
  assert.ok(t.asignado_a); // queda asignado al TICE de la sede
  const { rows: acuse } = await query('SELECT * FROM notificaciones WHERE incidencia_id = $1', [t.id]);
  assert.equal(acuse[0].destinatario, 'ana.rojas@colegio.edu.pe');
  // el mismo docente vuelve a escanear: se le muestra su ticket abierto, no se crea otro
  const otra = await reportar(firmar('ana.rojas@colegio.edu.pe'));
  assert.equal(otra.status, 200);
  assert.equal(otra.body.repetido, true);
  assert.equal(otra.body.numero, r.body.numero);
  assert.equal((await request(app).get(`/api/publico/equipos/${e.qr_token}`)).body.reportes_abiertos >= 1, true);
  // por defecto también vale un correo personal (los equipos están dentro del colegio)
  const personal = await reportar(firmar('profe.ana@gmail.com'));
  assert.equal(personal.status, 201);
  const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM operaciones_sin_bitacora');
  assert.equal(n, 0);
});
