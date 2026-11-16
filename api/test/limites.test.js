// CP-L1 a CP-L5: límite de solicitudes. La pantalla de ingreso nunca queda bloqueada por el límite, en el ingreso
// solo cuentan las credenciales rechazadas, cada usuario con sesión tiene su propio cupo aunque todo el colegio
// comparta una IP, y la Mesa de ayuda trae las propuestas de los correos en una sola solicitud.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://tice:tice@localhost:5432/tice_test';
process.env.DOMINIOS_CORREO = 'colegio.edu.pe';
process.env.SOLO_GOOGLE = 'false';
process.env.RATE_LIMIT = 'on';
process.env.RATE_AUTH_POR_MINUTO = '3';
process.env.RATE_API_POR_15_MIN = '8';
process.env.RATE_ANONIMO_POR_15_MIN = '5';
process.env.CONFIAR_CF_CONNECTING_IP = 'true';
process.env.INBOUND_TOKEN = 'token-de-prueba';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { crearApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrar } = require('../src/scripts/migrate');
const { seed } = require('../src/scripts/seed');

const PASSWORD = 'Tice2026!';
const IP = { 'CF-Connecting-IP': '200.48.10.20' }; // la IP pública del colegio, compartida por todos
const tokens = {};

before(async () => {
  await migrar({ forzar: true });
  await seed({ silencioso: true });
  const app = crearApp();
  for (const [k, c, ip] of [['director', 'director.ti@colegio.edu.pe', '10.0.0.1'], ['cen', 'tice.cen.usuario@colegio.edu.pe', '10.0.0.2']]) {
    tokens[k] = (await request(app).post('/api/auth/login').set({ 'CF-Connecting-IP': ip }).send({ correo: c, password: PASSWORD })).body.token;
    assert.ok(tokens[k]);
  }
});

after(() => pool.end());

const conSesion = (quien) => ({ ...IP, Authorization: `Bearer ${tokens[quien]}` });

test('CP-L1 La configuración de la pantalla de ingreso y la salud no se limitan', async () => {
  const app = crearApp();
  for (let i = 0; i < 12; i++) {
    assert.equal((await request(app).get('/api/auth/config').set(IP)).status, 200);
    assert.equal((await request(app).get('/api/Auth/Config/').set(IP)).status, 200);
    assert.equal((await request(app).get('/api/salud').set(IP)).status, 200);
  }
});

test('CP-L2 En el ingreso solo cuentan las credenciales rechazadas', async () => {
  const app = crearApp();
  // formularios incompletos (400) no gastan el cupo
  for (let i = 0; i < 4; i++) assert.equal((await request(app).post('/api/auth/login').set(IP).send({})).status, 400);
  for (let i = 0; i < 3; i++) {
    const r = await request(app).post('/api/auth/login').set(IP).send({ correo: 'tice.ind.usuario@colegio.edu.pe', password: 'errada' });
    assert.equal(r.status, 401);
  }
  const r = await request(app).post('/api/auth/login').set(IP).send({ correo: 'tice.ind.usuario@colegio.edu.pe', password: 'errada' });
  assert.equal(r.status, 429);
  assert.match(r.body.error, /Demasiadas solicitudes/);
  // la pantalla de ingreso sigue cargando y otra IP no se ve afectada
  assert.equal((await request(app).get('/api/auth/config').set(IP)).status, 200);
  assert.notEqual((await request(app).post('/api/auth/login').set({ 'CF-Connecting-IP': '190.1.2.3' }).send({})).status, 429);
});

test('CP-L3 Con sesión, cada usuario tiene su propio cupo aunque compartan la IP del colegio', async () => {
  const app = crearApp();
  for (let i = 0; i < 8; i++) assert.equal((await request(app).get('/api/catalogos').set(conSesion('cen'))).status, 200);
  assert.equal((await request(app).get('/api/catalogos').set(conSesion('cen'))).status, 429);
  assert.equal((await request(app).get('/api/catalogos').set(conSesion('director'))).status, 200);
});

test('CP-L4 El script de Gmail con INBOUND_TOKEN no gasta el cupo', async () => {
  const app = crearApp();
  for (let i = 0; i < 10; i++) {
    assert.equal((await request(app).get('/api/correos/salida').set({ ...IP, 'X-Inbound-Token': 'token-de-prueba' })).status, 200);
  }
});

test('CP-L5 La lista de correos por atender trae la propuesta de cada uno', async () => {
  const app = crearApp();
  const r = await request(app).get('/api/correos?estado=POR_ATENDER').set({ ...conSesion('director'), 'CF-Connecting-IP': '10.9.9.9' });
  assert.equal(r.status, 200);
  for (const c of r.body) {
    assert.ok(c.propuesta, `el correo ${c.id} no trae propuesta`);
    assert.ok(c.propuesta.prioridad && c.propuesta.categoria);
  }
});
