// Límite de peticiones (no necesita base de datos): la pantalla de ingreso nunca queda bloqueada por el límite,
// solo cuentan los intentos de ingreso fallidos y cada usuario con sesión tiene su propio cupo aunque compartan IP.
process.env.RATE_LIMIT = 'on';
process.env.RATE_AUTH_POR_MINUTO = '3';
process.env.RATE_API_POR_15_MIN = '5';
process.env.JWT_SECRET = 'secreto-de-prueba-limites';
process.env.INBOUND_TOKEN = 'token-de-prueba';
process.env.DATABASE_URL = 'postgres://nadie:nada@127.0.0.1:1/ninguna';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { crearApp } = require('../src/app');
const { pool } = require('../src/db');

after(() => pool.end());

const IP = { 'CF-Connecting-IP': '200.48.10.20' }; // la IP pública del colegio, compartida por todos

test('CP-L1 La configuración de la pantalla de ingreso y la salud no se limitan', async () => {
  const app = crearApp();
  for (let i = 0; i < 20; i++) {
    assert.equal((await request(app).get('/api/auth/config').set(IP)).status, 200);
  }
});

test('CP-L2 Solo los intentos de ingreso fallidos cuentan para el límite', async () => {
  const app = crearApp();
  for (let i = 0; i < 3; i++) {
    assert.notEqual((await request(app).post('/api/auth/login').set(IP).send({})).status, 429);
  }
  const r = await request(app).post('/api/auth/login').set(IP).send({});
  assert.equal(r.status, 429);
  assert.match(r.body.error, /Demasiadas solicitudes/);
  // aun así la pantalla de ingreso sigue cargando la configuración de Google
  assert.equal((await request(app).get('/api/auth/config').set(IP)).status, 200);
  // otra IP no se ve afectada
  assert.notEqual((await request(app).post('/api/auth/login').set({ 'CF-Connecting-IP': '190.1.2.3' }).send({})).status, 429);
});

test('CP-L3 Con sesión, cada usuario tiene su propio cupo aunque compartan la IP del colegio', async () => {
  const app = crearApp();
  const token = (sub) => ({ ...IP, Authorization: `Bearer ${jwt.sign({ sub }, process.env.JWT_SECRET)}` });
  for (let i = 0; i < 5; i++) assert.notEqual((await request(app).get('/api/equipos').set(token(1))).status, 429);
  assert.equal((await request(app).get('/api/equipos').set(token(1))).status, 429);
  assert.notEqual((await request(app).get('/api/equipos').set(token(2))).status, 429);
  // un token falso no usa el cupo de nadie: cuenta como la IP
  const falso = { ...IP, Authorization: `Bearer ${jwt.sign({ sub: 2 }, 'otro-secreto')}` };
  assert.notEqual((await request(app).get('/api/equipos').set(falso)).status, 429);
});

test('CP-L4 El script de Gmail con INBOUND_TOKEN no gasta el cupo general', async () => {
  const app = crearApp();
  for (let i = 0; i < 10; i++) {
    const r = await request(app).get('/api/correos/salida').set({ ...IP, 'X-Inbound-Token': 'token-de-prueba' });
    assert.notEqual(r.status, 429);
  }
});
