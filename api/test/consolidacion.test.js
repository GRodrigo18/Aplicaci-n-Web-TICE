// Casos de prueba CP-32 a CP-38 (consolidación): QR que abre la ficha, equipos alquilados con su proveedor,
// historial de mantenimiento, respuestas por correo unidas al ticket, salida de correos por Gmail y bajas aprobadas.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://tice:tice@localhost:5432/tice_test';
process.env.DOMINIOS_CORREO = 'colegio.edu.pe';
process.env.INBOUND_TOKEN = 'token-de-prueba';
process.env.CORREO_SALIDA = 'gmail';
process.env.AUTO_TICKET_CORREO = 'true';
delete process.env.SMTP_HOST;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const { crearApp } = require('../src/app');
const { pool, query } = require('../src/db');
const { migrar } = require('../src/scripts/migrate');
const { seed } = require('../src/scripts/seed');
const notificaciones = require('../src/lib/notificaciones');
const { sinCita } = require('../src/routes/correos');

const app = crearApp();
const PASSWORD = 'Tice2026!';
const tokens = {};
const auth = (quien) => ({ Authorization: `Bearer ${tokens[quien]}` });
const TOKEN = { 'X-Inbound-Token': 'token-de-prueba' };
let tipoId;
let central;

const crearEquipo = (datos = {}) => request(app).post('/api/equipos').set(auth('cen')).send({
  codigo: `C-${crypto.randomBytes(3).toString('hex')}`, tipo_id: tipoId, marca: 'Lenovo', ubicacion: 'Aula 2B', ...datos,
});
const crearTicket = (datos = {}) => request(app).post('/api/incidencias').set(auth('cen')).send({
  solicitante_correo: 'docente@colegio.edu.pe', asunto: 'Falla', descripcion: 'No enciende',
  categoria: 'Hardware', impacto: 'MEDIO', urgencia: 'MEDIA', ...datos,
});

before(async () => {
  await migrar({ forzar: true });
  await seed({ silencioso: true });
  for (const [k, c] of [['director', 'director.ti@colegio.edu.pe'], ['cen', 'tice.cen.usuario@colegio.edu.pe']]) {
    tokens[k] = (await request(app).post('/api/auth/login').send({ correo: c, password: PASSWORD })).body.token;
  }
  tipoId = (await query(`SELECT id FROM tipos_equipo WHERE nombre = 'All in One'`)).rows[0].id;
  central = (await query(`SELECT * FROM sedes WHERE codigo = 'CEN'`)).rows[0];
});

after(async () => {
  await pool.end();
});

test('CP-32 QR con enlace: la lectura de la URL de la etiqueta identifica el equipo', async () => {
  const e = (await crearEquipo()).body;
  const url = `https://sistema-tice.onrender.com/q/${e.qr_token}`;
  const r = await request(app).post('/api/qr/identificar').set(auth('cen')).send({ lectura: url });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, e.id);
  // las etiquetas antiguas (TICE:<token>) siguen funcionando
  const viejo = await request(app).post('/api/qr/identificar').set(auth('cen')).send({ lectura: `TICE:${e.qr_token}` });
  assert.equal(viejo.body.id, e.id);
});

test('CP-33 Equipo alquilado: proveedor obligatorio, contrato por vencer y falla derivada al proveedor', async () => {
  const sinProv = await crearEquipo({ propiedad: 'ALQUILADO' });
  assert.equal(sinProv.status, 400);
  const venc = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  const r = await crearEquipo({ propiedad: 'ALQUILADO', proveedor: 'Rentatec SAC', contrato: 'CT-2026-04', fin_contrato: venc });
  assert.equal(r.status, 201);
  assert.equal(r.body.proveedor, 'Rentatec SAC');
  // si pasa a propio, se limpian los datos del alquiler
  const propio = (await crearEquipo({ propiedad: 'PROPIO', proveedor: 'X' })).body;
  assert.equal(propio.proveedor, null);
  const porVencer = await request(app).get('/api/equipos?por_vencer=true').set(auth('cen'));
  assert.ok(porVencer.body.some((e) => e.id === r.body.id));
  const panel = await request(app).get('/api/dashboard').set(auth('cen'));
  assert.ok(panel.body.inventario.alquilados >= 1);
  assert.ok(panel.body.inventario.contratos_por_vencer >= 1);
  // nivel 3 sin escribir proveedor: se usa el dueño del equipo alquilado
  const t = (await crearTicket({ equipo_ids: [r.body.id] })).body;
  assert.equal(t.equipos[0].propiedad, 'ALQUILADO');
  assert.equal(t.equipos[0].proveedor, 'Rentatec SAC');
  const esc = await request(app).post(`/api/incidencias/${t.id}/escalar`).set(auth('cen')).send({ nivel: 3, motivo: 'Garantía del alquiler' });
  assert.equal(esc.status, 200);
  assert.equal(esc.body.proveedor_externo, 'Rentatec SAC');
});

test('CP-34 Historial del equipo: mantenimiento preventivo y correctivo automático al resolver un ticket', async () => {
  const e = (await crearEquipo()).body;
  const prox = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const m = await request(app).post(`/api/equipos/${e.id}/mantenimientos`).set(auth('cen'))
    .send({ tipo: 'PREVENTIVO', descripcion: 'Limpieza interna y pasta térmica', proximo: prox });
  assert.equal(m.status, 201);
  assert.equal((await request(app).post(`/api/equipos/${e.id}/mantenimientos`).set(auth('director'))
    .send({ tipo: 'PREVENTIVO', descripcion: 'x' })).status, 403);
  const t1 = (await crearTicket({ equipo_ids: [e.id] })).body;
  assert.equal(t1.equipos[0].antecedentes, 0);
  await request(app).patch(`/api/incidencias/${t1.id}/estado`).set(auth('cen')).send({ estado: 'EN_PROCESO' });
  await request(app).post(`/api/incidencias/${t1.id}/solucion`).set(auth('cen')).send({ diagnostico: 'Fuente dañada', solucion: 'Cambio de fuente' });
  const ficha = (await request(app).get(`/api/equipos/${e.id}`).set(auth('cen'))).body;
  assert.equal(ficha.mantenimientos.length, 2);
  const correctivo = ficha.mantenimientos.find((x) => x.tipo === 'CORRECTIVO');
  assert.equal(correctivo.ticket_numero, t1.numero);
  assert.match(correctivo.descripcion, /Cambio de fuente/);
  assert.ok(ficha.historial.some((h) => h.accion === 'MANTENIMIENTO'));
  // un nuevo ticket del mismo equipo muestra el antecedente
  const t2 = (await crearTicket({ equipo_ids: [e.id] })).body;
  assert.equal(t2.equipos[0].antecedentes, 1);
  const panel = await request(app).get('/api/dashboard').set(auth('cen'));
  assert.ok(panel.body.inventario.mantenimientos_proximos >= 1);
  // toda escritura sobre equipos e incidencias sigue en la bitácora
  const { rows } = await query('SELECT count(*)::int AS n FROM operaciones_sin_bitacora');
  assert.equal(rows[0].n, 0);
});

test('CP-35 Correo: un correo nuevo se convierte solo en ticket y la respuesta con [TCK-…] vuelve a su ticket', async () => {
  const nuevo = await request(app).post('/api/correos/entrante').set(TOKEN).send({
    para: central.correo_buzon, de: 'profe.ana@colegio.edu.pe', nombre: 'Ana', asunto: 'El proyector del aula no prende',
    cuerpo: 'Estoy en clase y el proyector no enciende',
  });
  assert.equal(nuevo.status, 201);
  assert.equal(nuevo.body.estado, 'CONVERTIDO');
  assert.match(nuevo.body.ticket, /^TCK-\d{4}-\d{5}$/);
  // un remitente externo no abre ticket solo: queda por atender
  const externo = await request(app).post('/api/correos/entrante').set(TOKEN).send({
    para: central.correo_buzon, de: 'alguien@gmail.com', asunto: 'Consulta', cuerpo: 'Hola',
  });
  assert.equal(externo.body.estado, 'POR_ATENDER');

  const { rows: [t] } = await query('SELECT id FROM incidencias WHERE numero = $1', [nuevo.body.ticket]);
  const resp = await request(app).post('/api/correos/entrante').set(TOKEN).send({
    para: central.correo_buzon, de: 'profe.ana@colegio.edu.pe', asunto: `Re: [${nuevo.body.ticket}] Recibimos su reporte`,
    cuerpo: 'Ahora tampoco funciona el audio.\n\nEl lun, 2 nov 2026 a las 10:00, TICE <tice@colegio.edu.pe> escribió:\n> Registramos su reporte',
  });
  assert.equal(resp.body.estado, 'RESPUESTA');
  assert.equal(resp.body.ticket, nuevo.body.ticket);
  // el TICE responde desde el ticket
  const r = await request(app).post(`/api/incidencias/${t.id}/responder`).set(auth('cen')).send({ mensaje: 'Voy en 5 minutos' });
  assert.equal(r.status, 201);
  const detalle = (await request(app).get(`/api/incidencias/${t.id}`).set(auth('cen'))).body;
  const recibidos = detalle.conversacion.filter((x) => x.sentido === 'RECIBIDO');
  assert.equal(recibidos.length, 2);
  assert.equal(recibidos[1].cuerpo, 'Ahora tampoco funciona el audio.');
  assert.ok(detalle.conversacion.some((x) => x.sentido === 'ENVIADO' && /Voy en 5 minutos/.test(x.cuerpo)
    && x.asunto.startsWith(`[${nuevo.body.ticket}]`)));
  assert.ok(detalle.historial.some((h) => h.accion === 'CORREO_RECIBIDO'));
  // las respuestas no aparecen como correos por atender
  const bandeja = await request(app).get('/api/correos').set(auth('cen'));
  assert.ok(!bandeja.body.some((c) => c.estado === 'RESPUESTA'));
  assert.equal(sinCita('Gracias\nOn Mon, Nov 2, 2026 at 10:00 AM TICE wrote:\n> hola'), 'Gracias');
});

test('CP-36 Salida por Gmail: el script toma los correos, confirma el envío y sin token no entra', async () => {
  assert.equal(await notificaciones.procesarPendientes(), 0); // con CORREO_SALIDA=gmail la API no los marca como simulados
  assert.equal((await request(app).get('/api/correos/salida')).status, 401);
  const lote = await request(app).get('/api/correos/salida').set(TOKEN);
  assert.equal(lote.status, 200);
  assert.ok(lote.body.length > 0);
  // los tomados no se vuelven a entregar mientras el script los envía
  const otraVez = await request(app).get('/api/correos/salida').set(TOKEN);
  assert.ok(!otraVez.body.some((n) => n.id === lote.body[0].id));
  const [primero, segundo] = lote.body;
  assert.equal((await request(app).post(`/api/correos/salida/${primero.id}`).set(TOKEN).send({ ok: true })).status, 200);
  await request(app).post(`/api/correos/salida/${segundo.id}`).set(TOKEN).send({ ok: false, error: 'Cuota de Gmail' });
  const { rows } = await query('SELECT id, estado, error FROM notificaciones WHERE id = ANY($1) ORDER BY id', [[primero.id, segundo.id]]);
  assert.equal(rows[0].estado, 'ENVIADO');
  assert.equal(rows[1].estado, 'ERROR');
  assert.equal(rows[1].error, 'Cuota de Gmail');
});

test('CP-37 Roles: el TICE solicita la baja, el Jefe de TI la aprueba o la rechaza', async () => {
  const e = (await crearEquipo()).body;
  const sol = await request(app).post(`/api/equipos/${e.id}/baja`).set(auth('cen')).send({ motivo: 'Placa quemada' });
  assert.equal(sol.status, 200);
  assert.equal((await request(app).post(`/api/equipos/${e.id}/baja`).set(auth('cen')).send({ motivo: 'otra vez' })).status, 409);
  const pendientes = await request(app).get('/api/equipos?baja_pendiente=true').set(auth('director'));
  assert.ok(pendientes.body.some((x) => x.id === e.id));
  const panel = await request(app).get('/api/dashboard').set(auth('director'));
  assert.ok(panel.body.inventario.bajas_por_aprobar >= 1);
  const rech = await request(app).post(`/api/equipos/${e.id}/baja/rechazar`).set(auth('director')).send({ motivo: 'Se puede reparar' });
  assert.equal(rech.status, 200);
  assert.equal(rech.body.baja_solicitada_en, null);
  assert.equal(rech.body.estado, 'OPERATIVO');
  // el Jefe de TI puede dar de baja directamente
  const directa = await request(app).post(`/api/equipos/${e.id}/baja`).set(auth('director')).send({ motivo: 'Fin de vida útil' });
  assert.equal(directa.body.estado, 'BAJA');
  const { rows } = await query(`SELECT accion FROM logs_auditoria WHERE entidad = 'equipo' AND entidad_id = $1 ORDER BY secuencia`, [e.id]);
  assert.deepEqual(rows.map((r) => r.accion), ['CREAR', 'SOLICITAR_BAJA', 'RECHAZAR_BAJA', 'BAJA']);
});
