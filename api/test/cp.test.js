// Casos de prueba funcionales CP-01 a CP-22 (Tabla 24 del informe; CP-21 y CP-22: escalamiento, semana 9).
// Se ejecutan contra una base PostgreSQL de prueba que se recrea al inicio.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://tice:tice@localhost:5432/tice_test';
process.env.INBOUND_TOKEN = 'token-de-prueba';
process.env.DOMINIOS_CORREO = 'colegio.edu.pe';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const { crearApp } = require('../src/app');
const { pool, query, tx } = require('../src/db');
const { migrar } = require('../src/scripts/migrate');
const { seed } = require('../src/scripts/seed');
const notificaciones = require('../src/lib/notificaciones');
const escalamiento = require('../src/lib/escalamiento');

const app = crearApp();
const PASSWORD = 'Tice2026!';
const DIRECTOR = 'director.ti@colegio.edu.pe';
const TICE_CEN = 'tice.cen.usuario@colegio.edu.pe';
const TICE_SUR = 'tice.sur.usuario@colegio.edu.pe';

let tokens = {};
const auth = (quien) => ({ Authorization: `Bearer ${tokens[quien]}` });
let tipoId;
let central;
let sur;

async function login(correo, password = PASSWORD) {
  return request(app).post('/api/auth/login').send({ correo, password });
}

async function crearEquipo(quien, datos = {}) {
  return request(app).post('/api/equipos').set(auth(quien)).send({
    codigo: `T-${crypto.randomBytes(3).toString('hex')}`, tipo_id: tipoId, marca: 'HP', ubicacion: 'Aula 1A', ...datos,
  });
}

async function crearTicket(quien, datos = {}) {
  return request(app).post('/api/incidencias').set(auth(quien)).send({
    solicitante_correo: 'docente@colegio.edu.pe', asunto: 'Falla de prueba', descripcion: 'No enciende',
    categoria: 'Hardware', impacto: 'MEDIO', urgencia: 'MEDIA', ...datos,
  });
}

before(async () => {
  await migrar({ forzar: true });
  await seed({ silencioso: true });
  for (const [k, c] of [['director', DIRECTOR], ['cen', TICE_CEN], ['sur', TICE_SUR]]) {
    tokens[k] = (await login(c)).body.token;
  }
  tipoId = (await query(`SELECT id FROM tipos_equipo WHERE nombre = 'Laptop'`)).rows[0].id;
  central = (await query(`SELECT * FROM sedes WHERE codigo = 'CEN'`)).rows[0];
  sur = (await query(`SELECT * FROM sedes WHERE codigo = 'SUR'`)).rows[0];
});

after(async () => {
  await pool.end();
});

test('CP-01 UC-01: ingreso con credenciales válidas y registro LOGIN en la bitácora', async () => {
  const r = await login(TICE_CEN);
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.equal(r.body.usuario.sede_id, central.id);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${r.body.token}`);
  assert.equal(me.body.correo, TICE_CEN);
  const { rows } = await query(
    `SELECT 1 FROM logs_auditoria WHERE accion = 'LOGIN' AND usuario_correo = $1`, [TICE_CEN]);
  assert.ok(rows.length >= 1);
});

test('CP-02 UC-01: contraseña incorrecta muestra intentos restantes y bloquea al quinto intento', async () => {
  const correo = TICE_SUR;
  const r1 = await login(correo, 'incorrecta');
  assert.equal(r1.status, 401);
  assert.equal(r1.body.intentosRestantes, 4);
  for (let i = 0; i < 3; i++) await login(correo, 'incorrecta');
  const r5 = await login(correo, 'incorrecta');
  assert.equal(r5.status, 423);
  // bloqueada aun con la contraseña correcta
  const r6 = await login(correo, PASSWORD);
  assert.equal(r6.status, 423);
  const { rows: [u] } = await query('SELECT bloqueado_hasta FROM usuarios WHERE correo = $1', [correo]);
  const minutos = (new Date(u.bloqueado_hasta) - Date.now()) / 60000;
  assert.ok(minutos > 14 && minutos <= 15);
  await query('UPDATE usuarios SET bloqueado_hasta = NULL, intentos_fallidos = 0 WHERE correo = $1', [correo]);
});

test('CP-03 UC-04: registro de equipo con código nuevo en la sede y en la bitácora', async () => {
  const r = await crearEquipo('cen', { codigo: 'CEN-LAP-900', modelo: '240 G9', serie: 'ABC123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.sede_id, central.id);
  assert.match(r.body.qr_token, /^[a-f0-9]{24}$/);
  const lista = await request(app).get('/api/equipos?codigo=CEN-LAP-900').set(auth('cen'));
  assert.equal(lista.body.length, 1);
  const { rows } = await query(`SELECT 1 FROM logs_auditoria WHERE entidad='equipo' AND entidad_id=$1 AND accion='CREAR'`, [r.body.id]);
  assert.equal(rows.length, 1);
});

test('CP-04 UC-04: registro con código duplicado en la sede es rechazado', async () => {
  const r = await crearEquipo('cen', { codigo: 'CEN-LAP-900' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /ya está registrado en la sede/);
  // el mismo código sí se admite en otra sede
  const otra = await crearEquipo('sur', { codigo: 'CEN-LAP-900' });
  assert.equal(otra.status, 201);
});

test('CP-05 UC-05: no se puede dar de baja un equipo con un ticket abierto', async () => {
  const e = (await crearEquipo('cen')).body;
  const t = await crearTicket('cen', { equipo_ids: [e.id] });
  assert.equal(t.status, 201);
  const baja = await request(app).post(`/api/equipos/${e.id}/baja`).set(auth('cen')).send({ motivo: 'Obsoleto' });
  assert.equal(baja.status, 409);
  assert.match(baja.body.error, new RegExp(t.body.numero));
  // la baja exige motivo y, sin tickets abiertos, es lógica
  const libre = (await crearEquipo('cen')).body;
  const sinMotivo = await request(app).post(`/api/equipos/${libre.id}/baja`).set(auth('cen')).send({});
  assert.equal(sinMotivo.status, 400);
  const ok = await request(app).post(`/api/equipos/${libre.id}/baja`).set(auth('cen')).send({ motivo: 'Pantalla rota' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.estado, 'BAJA');
  const { rows } = await query('SELECT motivo_baja FROM equipos WHERE id = $1', [libre.id]);
  assert.equal(rows[0].motivo_baja, 'Pantalla rota');
});

test('CP-06 UC-06: búsqueda con filtros de tipo y estado solo devuelve equipos de la sede del usuario', async () => {
  await crearEquipo('cen', { estado: 'MANTENIMIENTO' });
  await crearEquipo('sur', { estado: 'MANTENIMIENTO' });
  const r = await request(app).get(`/api/equipos?tipo_id=${tipoId}&estado=MANTENIMIENTO`).set(auth('cen'));
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 1);
  for (const e of r.body) {
    assert.equal(e.tipo_id, tipoId);
    assert.equal(e.estado, 'MANTENIMIENTO');
    assert.equal(e.sede_id, central.id);
  }
});

test('CP-07 UC-07: impacto Medio y urgencia Alta da prioridad Alta con SLA de 45 min', async () => {
  const r = await crearTicket('cen', { impacto: 'MEDIO', urgencia: 'ALTA' });
  assert.equal(r.status, 201);
  assert.equal(r.body.prioridad, 'ALTA');
  assert.equal(r.body.sla_minutos, 45);
  assert.equal(r.body.estado, 'PENDIENTE');
  const { rows: [tice] } = await query('SELECT id FROM usuarios WHERE correo = $1', [TICE_CEN]);
  assert.equal(r.body.asignado_a, tice.id);
  // otra prioridad no se acepta: ni en la API ni en la base de datos
  const malo = await crearTicket('cen', { impacto: 'MEDIO', urgencia: 'ALTA', prioridad: 'BAJA' });
  assert.equal(malo.status, 400);
  await assert.rejects(
    query(`UPDATE incidencias SET prioridad = 'BAJA' WHERE id = $1`, [r.body.id]),
    /prioridad_segun_matriz/);
});

test('CP-08 UC-07: ticket sin descripción, impacto o urgencia pide completar los datos', async () => {
  for (const campo of ['descripcion', 'impacto', 'urgencia']) {
    const r = await crearTicket('cen', { [campo]: '' });
    assert.equal(r.status, 400, campo);
    assert.match(r.body.error, /obligatorio/);
  }
});

test('CP-09 UC-08: cambio de Pendiente a En proceso actualiza estado y fecha y queda en la bitácora', async () => {
  const t = (await crearTicket('cen')).body;
  const r = await request(app).patch(`/api/incidencias/${t.id}/estado`).set(auth('cen')).send({ estado: 'EN_PROCESO' });
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'EN_PROCESO');
  assert.ok(r.body.fecha_inicio);
  const { rows } = await query(
    `SELECT detalle FROM logs_auditoria WHERE entidad='incidencia' AND entidad_id=$1 AND accion='CAMBIO_ESTADO'`, [t.id]);
  assert.equal(rows[0].detalle.cambios.estado.despues, 'EN_PROCESO');
});

test('CP-10 UC-08: un ticket resuelto no puede volver a En proceso', async () => {
  const t = (await crearTicket('cen')).body;
  await request(app).patch(`/api/incidencias/${t.id}/estado`).set(auth('cen')).send({ estado: 'EN_PROCESO' });
  await request(app).post(`/api/incidencias/${t.id}/solucion`).set(auth('cen')).send({ solucion: 'Se reinició' });
  const r = await request(app).patch(`/api/incidencias/${t.id}/estado`).set(auth('cen')).send({ estado: 'EN_PROCESO' });
  assert.equal(r.status, 409);
  const { rows } = await query('SELECT estado FROM incidencias WHERE id = $1', [t.id]);
  assert.equal(rows[0].estado, 'RESUELTO');
});

test('CP-11 UC-09: registro de solución deja el ticket Resuelto con fecha de resolución', async () => {
  const t = (await crearTicket('cen')).body;
  await request(app).patch(`/api/incidencias/${t.id}/estado`).set(auth('cen')).send({ estado: 'EN_PROCESO' });
  const sin = await request(app).post(`/api/incidencias/${t.id}/solucion`).set(auth('cen')).send({ solucion: '' });
  assert.equal(sin.status, 400);
  const r = await request(app).post(`/api/incidencias/${t.id}/solucion`).set(auth('cen'))
    .send({ diagnostico: 'Cable suelto', solucion: 'Se cambió el cable HDMI' });
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'RESUELTO');
  assert.equal(r.body.solucion, 'Se cambió el cable HDMI');
  assert.ok(r.body.fecha_resolucion);
});

test('CP-12 UC-12: el CSV contiene exactamente los equipos del filtro; un TICE no puede exportar', async () => {
  const filtro = `sede_id=${central.id}&estado=MANTENIMIENTO`;
  const vista = await request(app).get(`/api/equipos?${filtro}`).set(auth('director'));
  const csv = await request(app).get(`/api/equipos/exportar.csv?${filtro}`).set(auth('director'));
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  const filas = csv.text.replace(/^﻿/, '').trim().split('\r\n').slice(1);
  assert.equal(filas.length, vista.body.length);
  const codigos = filas.map((f) => f.split(';')[1]).sort();
  assert.deepEqual(codigos, vista.body.map((e) => e.codigo).sort());
  const tice = await request(app).get(`/api/equipos/exportar.csv`).set(auth('cen'));
  assert.equal(tice.status, 403);
});

test('CP-13 RNF-01: un usuario de sede no ve equipos ni tickets de otra sede', async () => {
  const eqSur = (await crearEquipo('sur')).body;
  const tSur = (await crearTicket('sur')).body;
  const lista = await request(app).get(`/api/equipos?sede_id=${sur.id}`).set(auth('cen'));
  assert.ok(lista.body.every((e) => e.sede_id === central.id));
  assert.equal((await request(app).get(`/api/equipos/${eqSur.id}`).set(auth('cen'))).status, 403);
  assert.equal((await request(app).get(`/api/incidencias/${tSur.id}`).set(auth('cen'))).status, 403);
  const tickets = await request(app).get('/api/incidencias').set(auth('cen'));
  assert.ok(tickets.body.every((t) => t.sede_id === central.id));
  assert.equal((await request(app).put(`/api/equipos/${eqSur.id}`).set(auth('cen')).send({ marca: 'X' })).status, 403);
  // sin token no hay acceso
  assert.equal((await request(app).get('/api/equipos')).status, 401);
});

test('CP-14 RNF-02 / UC-11: el dashboard responde en menos de 2 s con cerca de 1 200 equipos', async () => {
  // carga masiva en una sola transacción, con su registro en la bitácora (mismo txid)
  await tx(async (c) => {
    await c.query(`
      INSERT INTO equipos (sede_id, codigo, tipo_id, marca, estado, ubicacion, qr_token)
      SELECT $1, 'CARGA-' || g, $2, 'HP', CASE WHEN g % 10 = 0 THEN 'MANTENIMIENTO' ELSE 'OPERATIVO' END,
             'Aula ' || (g % 30), left(md5(random()::text || g), 24)
        FROM generate_series(1, 1100) g`, [central.id, tipoId]);
    await c.query(`INSERT INTO logs_auditoria (entidad, accion, detalle) VALUES ('sistema', 'CARGA_PRUEBA', '{"equipos":1100}')`);
  });
  const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM equipos');
  assert.ok(n >= 1150, `equipos: ${n}`);
  const t0 = performance.now();
  const r = await request(app).get('/api/dashboard').set(auth('director'));
  const ms = performance.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(ms < 2000, `tardó ${ms.toFixed(0)} ms`);
  const t1 = performance.now();
  const inv = await request(app).get(`/api/equipos?sede_id=${central.id}`).set(auth('director'));
  assert.ok(inv.body.length >= 1100);
  assert.ok(performance.now() - t1 < 2000);
  const dt = r.body.indicadores.find((k) => k.sigla === 'DT');
  assert.ok(dt.valor > 0 && dt.valor <= 100);
});

test('CP-15 RNF-05 / UC-03: la base rechaza modificar o borrar la bitácora y la cadena sigue íntegra', async () => {
  await assert.rejects(query(`UPDATE logs_auditoria SET accion = 'X' WHERE secuencia = 1`), /inmutable/);
  await assert.rejects(query('DELETE FROM logs_auditoria WHERE secuencia = 1'), /inmutable/);
  await assert.rejects(query('TRUNCATE logs_auditoria'), /inmutable/);
  const r = await request(app).get('/api/bitacora/verificar').set(auth('director'));
  assert.equal(r.status, 200);
  assert.equal(r.body.integra, true);
  assert.equal(r.body.registros_alterados.length, 0);
  // solo el Director consulta la bitácora
  assert.equal((await request(app).get('/api/bitacora').set(auth('cen'))).status, 403);
});

test('CP-16 RF-05 / RNF-05: toda escritura sobre equipos e incidencias queda en la bitácora', async () => {
  const e = (await crearEquipo('cen')).body;
  await request(app).put(`/api/equipos/${e.id}`).set(auth('cen')).send({ ubicacion: 'Laboratorio 2' });
  const t = (await crearTicket('cen', { equipo_ids: [e.id] })).body;
  await request(app).patch(`/api/incidencias/${t.id}/estado`).set(auth('cen')).send({ estado: 'EN_PROCESO' });
  const { rows: logs } = await query(
    `SELECT accion, usuario_correo, fecha FROM logs_auditoria
      WHERE (entidad='equipo' AND entidad_id=$1) OR (entidad='incidencia' AND entidad_id=$2) ORDER BY secuencia`, [e.id, t.id]);
  assert.deepEqual(logs.map((l) => l.accion), ['CREAR', 'MODIFICAR', 'CREAR', 'CAMBIO_ESTADO']);
  assert.ok(logs.every((l) => l.usuario_correo === TICE_CEN && l.fecha));
  const v = await request(app).get('/api/bitacora/verificar').set(auth('director'));
  assert.equal(v.body.completa, true, JSON.stringify(v.body.operaciones_sin_bitacora));
  // una escritura hecha por fuera del sistema se detecta
  await query(`UPDATE equipos SET marca = 'ALTERADO' WHERE id = $1`, [e.id]);
  const v2 = await request(app).get('/api/bitacora/verificar').set(auth('director'));
  assert.equal(v2.body.completa, false);
  assert.equal(v2.body.operaciones_sin_bitacora.at(-1).registro_id, e.id);
  await query(`DELETE FROM operaciones_bd WHERE id = $1`, [v2.body.operaciones_sin_bitacora.at(-1).id]);
});

test('CP-17 UC-13 / RF-09: identificar, auditar y trasladar por lectura QR', async () => {
  // se trabaja en la Sede Lima Sur para controlar el total de equipos
  const { rows: equipos } = await query(
    `SELECT id, codigo, ubicacion, qr_token FROM equipos WHERE sede_id = $1 AND estado <> 'BAJA' ORDER BY id`, [sur.id]);
  const id = await request(app).post('/api/qr/identificar').set(auth('sur')).send({ lectura: `TICE:${equipos[0].qr_token}` });
  assert.equal(id.status, 200);
  assert.equal(id.body.codigo, equipos[0].codigo);
  // etiqueta ajena o de otra sede: rechazada
  assert.equal((await request(app).post('/api/qr/identificar').set(auth('sur')).send({ lectura: 'hola' })).status, 422);
  const { rows: [cen] } = await query('SELECT qr_token FROM equipos WHERE sede_id = $1 LIMIT 1', [central.id]);
  assert.equal((await request(app).post('/api/qr/identificar').set(auth('sur')).send({ lectura: cen.qr_token })).status, 422);

  const a = (await request(app).post('/api/qr/auditorias').set(auth('sur'))).body;
  assert.equal(a.equipos_esperados, equipos.length);
  // todos menos 2 en su ambiente, 1 en otro ambiente, 1 sin leer
  for (const e of equipos.slice(0, -2)) {
    const r = await request(app).post(`/api/qr/auditorias/${a.id}/lectura`).set(auth('sur')).send({ lectura: e.qr_token, ambiente: e.ubicacion });
    assert.equal(r.status, 201);
    assert.equal(r.body.resultado, 'ENCONTRADO');
  }
  const mov = equipos.at(-2);
  const r2 = await request(app).post(`/api/qr/auditorias/${a.id}/lectura`).set(auth('sur')).send({ lectura: mov.qr_token, ambiente: 'Depósito' });
  assert.equal(r2.body.resultado, 'REUBICADO');
  const fin = await request(app).post(`/api/qr/auditorias/${a.id}/finalizar`).set(auth('sur'));
  assert.equal(fin.status, 200);
  const esperado = Math.round(((equipos.length - 2) / equipos.length) * 10000) / 100;
  assert.equal(fin.body.tel, esperado);
  assert.equal(fin.body.equipos_faltantes, 1);
  assert.equal(fin.body.faltantes[0].codigo, equipos.at(-1).codigo);
  assert.ok(fin.body.tai_dias >= 1);
  const { rows: [ubic] } = await query('SELECT ubicacion FROM equipos WHERE id = $1', [mov.id]);
  assert.equal(ubic.ubicacion, 'Depósito');

  const tr = await request(app).post('/api/qr/traslado').set(auth('sur'))
    .send({ ubicacion: 'Laboratorio 3', lecturas: [equipos[0].qr_token, equipos[1].qr_token] });
  assert.equal(tr.body.trasladados, 2);
  const { rows: movidos } = await query(`SELECT count(*)::int AS n FROM equipos WHERE id = ANY($1) AND ubicacion = 'Laboratorio 3'`, [[equipos[0].id, equipos[1].id]]);
  assert.equal(movidos[0].n, 2);
});

test('CP-18 UC-02: el Director crea usuarios, rechaza correo repetido y un segundo TICE en la sede', async () => {
  const nuevo = { nombre: 'Ana Torres', correo: 'ana.torres@colegio.edu.pe', rol: 'DIRECTOR', password: 'Segura2026' };
  const r = await request(app).post('/api/usuarios').set(auth('director')).send(nuevo);
  assert.equal(r.status, 201);
  const rep = await request(app).post('/api/usuarios').set(auth('director')).send({ ...nuevo, correo: 'ANA.TORRES@colegio.edu.pe' });
  assert.equal(rep.status, 409);
  assert.match(rep.body.error, /ya está registrado/);
  const segundo = await request(app).post('/api/usuarios').set(auth('director'))
    .send({ nombre: 'Otro TICE', correo: 'otro.tice@colegio.edu.pe', rol: 'TICE', sede_id: central.id, password: 'Segura2026' });
  assert.equal(segundo.status, 409);
  assert.match(segundo.body.error, /ya tiene un TICE activo/);
  // la base de datos también lo exige
  await assert.rejects(query(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol, sede_id) VALUES ('X', 'x@colegio.edu.pe', 'x', 'TICE', $1)`, [central.id]),
  /un_tice_activo_por_sede/);
  // un TICE no gestiona usuarios
  assert.equal((await request(app).post('/api/usuarios').set(auth('cen')).send(nuevo)).status, 403);
});

test('CP-19 UC-07 / UC-10: correo de un docente llega a la bandeja de su sede, se convierte en ticket Crítico y se avisa', async () => {
  const entrada = await request(app).post('/api/correos/entrante').set('x-inbound-token', 'token-de-prueba').send({
    para: central.correo_buzon, de: 'maria.lopez@colegio.edu.pe', nombre: 'María López',
    asunto: 'Sin internet en el laboratorio', cuerpo: 'Estoy en clase ahora con el Laboratorio 1 y no hay internet.',
  });
  assert.equal(entrada.status, 201);
  assert.equal(entrada.body.sede_id, central.id);
  const bandejaSur = await request(app).get('/api/correos').set(auth('sur'));
  assert.ok(!bandejaSur.body.some((c) => c.id === entrada.body.id));
  const prop = await request(app).get(`/api/correos/${entrada.body.id}/propuesta`).set(auth('cen'));
  assert.equal(prop.body.propuesta.impacto, 'ALTO');
  assert.equal(prop.body.propuesta.urgencia, 'ALTA');
  assert.equal(prop.body.propuesta.prioridad, 'CRITICA');
  const t = await request(app).post(`/api/correos/${entrada.body.id}/convertir`).set(auth('cen'))
    .send({ categoria: prop.body.propuesta.categoria, impacto: 'ALTO', urgencia: 'ALTA' });
  assert.equal(t.status, 201);
  assert.equal(t.body.prioridad, 'CRITICA');
  assert.equal(t.body.sla_minutos, 20);
  assert.equal(t.body.solicitante_correo, 'maria.lopez@colegio.edu.pe');
  await request(app).patch(`/api/incidencias/${t.body.id}/estado`).set(auth('cen')).send({ estado: 'EN_PROCESO' });
  await notificaciones.procesarPendientes();
  const { rows: avisos } = await query('SELECT asunto, estado, destinatario FROM notificaciones WHERE incidencia_id = $1 ORDER BY id', [t.body.id]);
  assert.equal(avisos.length, 2);
  assert.match(avisos[0].asunto, new RegExp(`${t.body.numero}.*Recibimos`));
  assert.match(avisos[1].asunto, /En proceso/);
  assert.ok(avisos.every((a) => a.destinatario === 'maria.lopez@colegio.edu.pe' && a.estado === 'SIMULADO'));
  const otra = await request(app).post(`/api/correos/${entrada.body.id}/convertir`).set(auth('cen')).send({ categoria: 'Otro', impacto: 'BAJO', urgencia: 'BAJA' });
  assert.equal(otra.status, 409);
});

test('CP-20 UC-07: un correo que no es una falla se descarta con motivo y queda en la bitácora', async () => {
  const { rows: [correo] } = await query(
    `INSERT INTO correos_entrantes (sede_id, remitente, remitente_nombre, asunto, cuerpo)
     VALUES ($1, 'administracion@colegio.edu.pe', 'Administración', 'Reunión de coordinación del viernes',
             'Les recordamos la reunión de coordinación general del viernes a las 3 p. m.') RETURNING id`, [central.id]);
  const sinMotivo = await request(app).post(`/api/correos/${correo.id}/descartar`).set(auth('cen')).send({});
  assert.equal(sinMotivo.status, 400);
  const r = await request(app).post(`/api/correos/${correo.id}/descartar`).set(auth('cen')).send({ motivo: 'No es una incidencia' });
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'DESCARTADO');
  const { rows } = await query(`SELECT detalle FROM logs_auditoria WHERE entidad='correo' AND entidad_id=$1 AND accion='DESCARTAR'`, [correo.id]);
  assert.equal(rows[0].detalle.motivo, 'No es una incidencia');
});

test('CP-21 ITIL 4: escalamiento funcional al nivel 3 exige proveedor, avisa al nivel 2 y no baja de nivel', async () => {
  const t = (await crearTicket('cen', { asunto: 'Proyector en garantía' })).body;
  assert.equal(t.nivel_escalamiento, 1);
  let r = await request(app).post(`/api/incidencias/${t.id}/escalar`).set(auth('cen')).send({ nivel: 3, motivo: 'Falla de lámpara' });
  assert.equal(r.status, 400);
  r = await request(app).post(`/api/incidencias/${t.id}/escalar`).set(auth('cen'))
    .send({ nivel: 3, motivo: 'Falla de lámpara en garantía', proveedor: 'Garantía EPSON', caso_proveedor: 'EP-1234' });
  assert.equal(r.status, 200);
  assert.equal(r.body.nivel_escalamiento, 3);
  assert.equal(r.body.proveedor_externo, 'Garantía EPSON');
  const { rows: [log] } = await query(
    `SELECT detalle FROM logs_auditoria WHERE entidad='incidencia' AND entidad_id=$1 AND accion='ESCALAR'`, [t.id]);
  assert.equal(log.detalle.tipo, 'FUNCIONAL');
  const { rows: avisos } = await query('SELECT destinatario FROM notificaciones WHERE incidencia_id=$1', [t.id]);
  assert.ok(avisos.some((a) => a.destinatario === DIRECTOR), 'avisa al Director (nivel 2)');
  assert.ok(avisos.some((a) => a.destinatario === 'docente@colegio.edu.pe'), 'avisa al solicitante');
  r = await request(app).post(`/api/incidencias/${t.id}/escalar`).set(auth('cen')).send({ nivel: 2, motivo: 'bajar' });
  assert.equal(r.status, 409);
  // un TICE de otra sede no puede escalar el ticket
  const otro = (await crearTicket('cen')).body;
  r = await request(app).post(`/api/incidencias/${otro.id}/escalar`).set(auth('sur')).send({ nivel: 2, motivo: 'x' });
  assert.equal(r.status, 403);
  r = await request(app).post(`/api/incidencias/${otro.id}/escalar`).set(auth('cen')).send({ nivel: 2, motivo: 'Necesita apoyo de otra sede' });
  assert.equal(r.body.nivel_escalamiento, 2);
  r = await request(app).post(`/api/incidencias/${otro.id}/escalar`).set(auth('cen')).send({ nivel: 2, motivo: 'otra vez' });
  assert.equal(r.status, 409);
});

test('CP-22 ITIL 4: alerta al 75 % del SLA y escalamiento automático al nivel 2 al vencer', async () => {
  const t = (await crearTicket('cen', { impacto: 'MEDIO', urgencia: 'ALTA' })).body; // Alta, SLA 45 min
  // simula el paso del tiempo: 36 minutos (80 % del SLA)
  await tx(async (c) => {
    await c.query(`UPDATE incidencias SET fecha_registro = now() - interval '36 minutes' WHERE id = $1`, [t.id]);
    await c.query(`INSERT INTO logs_auditoria (entidad, entidad_id, accion) VALUES ('incidencia', $1, 'PRUEBA_RELOJ')`, [t.id]);
  });
  await escalamiento.revisarSla();
  let r = await request(app).get(`/api/incidencias/${t.id}`).set(auth('cen'));
  assert.ok(r.body.alerta_sla_en, 'registra la alerta');
  assert.equal(r.body.sla_en_riesgo, true);
  assert.equal(r.body.nivel_escalamiento, 1);
  assert.ok(r.body.historial.some((h) => h.accion === 'ALERTA_SLA'));
  // 50 minutos: SLA vencido
  await tx(async (c) => {
    await c.query(`UPDATE incidencias SET fecha_registro = now() - interval '50 minutes' WHERE id = $1`, [t.id]);
    await c.query(`INSERT INTO logs_auditoria (entidad, entidad_id, accion) VALUES ('incidencia', $1, 'PRUEBA_RELOJ')`, [t.id]);
  });
  await escalamiento.revisarSla();
  r = await request(app).get(`/api/incidencias/${t.id}`).set(auth('cen'));
  assert.equal(r.body.nivel_escalamiento, 2);
  const esc = r.body.historial.find((h) => h.accion === 'ESCALAR');
  assert.equal(esc.detalle.tipo, 'JERARQUICO_AUTOMATICO');
  // una segunda revisión no repite la alerta ni el escalamiento
  await escalamiento.revisarSla();
  const { rows: [{ n }] } = await query(
    `SELECT count(*)::int AS n FROM logs_auditoria WHERE entidad_id=$1 AND entidad='incidencia' AND accion IN ('ALERTA_SLA','ESCALAR')`, [t.id]);
  assert.equal(n, 2);
  const d = await request(app).get('/api/dashboard').set(auth('director'));
  assert.ok(d.body.tickets_por_nivel.some((x) => x.nivel === 2 && x.n >= 1));
});
