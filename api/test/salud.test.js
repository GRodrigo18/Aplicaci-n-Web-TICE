// CP-S1 a CP-S3: salud y continuidad. /api/salud responde siempre (Render la usa para saber si el servicio vive),
// /api/salud/bd comprueba la base de verdad y, si la base no responde al arrancar, el servidor no se apaga:
// la API responde 503 "se está preparando" y la web sigue cargando.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://tice:tice@localhost:5432/tice_test';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const request = require('supertest');
const { crearApp } = require('../src/app');
const { pool } = require('../src/db');

after(() => pool.end());

test('CP-S1 /api/salud responde sin base, sin sesión y sin caché', async () => {
  const r = await request(crearApp()).get('/api/salud');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(typeof r.body.version, 'string');
  assert.ok(r.body.activo_desde);
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('CP-S2 /api/salud/bd confirma que la base responde', async () => {
  const r = await request(crearApp()).get('/api/salud/bd');
  assert.equal(r.status, 200);
  assert.equal(r.body.bd, 'ok');
  assert.equal(typeof r.body.ms, 'number');
});

test('CP-S3 Con la base caída el servidor sigue arriba: salud 200, salud/bd 503 y la API 503 "se está preparando"', async (t) => {
  const puerto = 3900 + Math.floor(Math.random() * 90);
  const hijo = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(puerto), DATABASE_URL: 'postgres://tice:tice@127.0.0.1:1/nada', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  t.after(() => hijo.kill('SIGKILL'));
  const base = `http://127.0.0.1:${puerto}`;
  let salud;
  for (let i = 0; i < 50 && !salud; i++) {
    salud = await fetch(`${base}/api/salud`).catch(() => null);
    if (!salud) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(salud, 'el servidor abrió el puerto');
  assert.equal(salud.status, 200);
  assert.equal((await salud.json()).listo, false);

  const bd = await fetch(`${base}/api/salud/bd`);
  assert.equal(bd.status, 503);
  assert.equal((await bd.json()).bd, 'sin conexión');

  const api = await fetch(`${base}/api/auth/config`);
  assert.equal(api.status, 503);
  assert.equal(api.headers.get('retry-after'), '30');
  assert.match((await api.json()).error, /preparando/);

  // tras varios segundos de reintentos el proceso sigue vivo
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(hijo.exitCode, null);
  assert.equal((await fetch(`${base}/api/salud`)).status, 200);
});
