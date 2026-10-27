// UC-02 Gestionar usuarios y sedes (solo Director de TI)
const express = require('express');
const bcrypt = require('bcryptjs');
const { query, tx } = require('../db');
const { h, invalido, noEncontrado, HttpError } = require('../lib/errores');
const { soloDirector } = require('../lib/auth');
const { registrar, diferencias } = require('../lib/bitacora');
const { texto, entero, opcion, correoValido } = require('../lib/util');

const router = express.Router();

// todos los usuarios ven la lista de sedes (para filtros); solo el Director la modifica
router.get('/sedes', h(async (_req, res) => {
  const { rows } = await query('SELECT * FROM sedes ORDER BY id');
  res.json(rows);
}));

router.post('/sedes', soloDirector, h(async (req, res) => {
  const datos = {
    codigo: texto(req.body.codigo, 'codigo', { requerido: true, max: 10 }).toUpperCase(),
    nombre: texto(req.body.nombre, 'nombre', { requerido: true, max: 100 }),
    direccion: texto(req.body.direccion, 'direccion', { max: 200 }),
    correo_buzon: texto(req.body.correo_buzon, 'correo_buzon', { requerido: true, max: 150 }).toLowerCase(),
  };
  if (!correoValido(datos.correo_buzon)) throw invalido('Correo del buzón inválido');
  const sede = await tx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO sedes (codigo, nombre, direccion, correo_buzon) VALUES ($1,$2,$3,$4) RETURNING *',
      [datos.codigo, datos.nombre, datos.direccion, datos.correo_buzon],
    );
    await registrar(c, req.usuario, { entidad: 'sede', entidadId: rows[0].id, accion: 'CREAR', detalle: datos, sedeId: rows[0].id });
    return rows[0];
  });
  res.status(201).json(sede);
}));

router.put('/sedes/:id', soloDirector, h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const sede = await tx(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM sedes WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) throw noEncontrado('Sede');
    const d = {
      nombre: texto(req.body.nombre, 'nombre', { max: 100 }) ?? antes.nombre,
      direccion: req.body.direccion !== undefined ? texto(req.body.direccion, 'direccion', { max: 200 }) : antes.direccion,
      correo_buzon: (texto(req.body.correo_buzon, 'correo_buzon', { max: 150 }) ?? antes.correo_buzon).toLowerCase(),
      activa: typeof req.body.activa === 'boolean' ? req.body.activa : antes.activa,
    };
    if (!correoValido(d.correo_buzon)) throw invalido('Correo del buzón inválido');
    const { rows: [despues] } = await c.query(
      'UPDATE sedes SET nombre=$2, direccion=$3, correo_buzon=$4, activa=$5 WHERE id=$1 RETURNING *',
      [id, d.nombre, d.direccion, d.correo_buzon, d.activa],
    );
    await registrar(c, req.usuario, {
      entidad: 'sede', entidadId: id, accion: 'MODIFICAR', sedeId: id,
      detalle: diferencias(antes, despues, ['nombre', 'direccion', 'correo_buzon', 'activa']),
    });
    return despues;
  });
  res.json(sede);
}));

const COLUMNAS_USUARIO = `u.id, u.nombre, u.correo, u.rol, u.sede_id, s.nombre AS sede_nombre, u.activo,
  u.bloqueado_hasta, u.creado_en`;

router.get('/usuarios', soloDirector, h(async (_req, res) => {
  const { rows } = await query(
    `SELECT ${COLUMNAS_USUARIO} FROM usuarios u LEFT JOIN sedes s ON s.id = u.sede_id ORDER BY u.rol, s.nombre, u.nombre`,
  );
  res.json(rows);
}));

function validarPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw invalido('La contraseña debe tener al menos 8 caracteres');
}

async function verificarUnTice(c, sedeId, exceptoId = 0) {
  const { rows } = await c.query(
    `SELECT nombre FROM usuarios WHERE rol = 'TICE' AND activo AND sede_id = $1 AND id <> $2`,
    [sedeId, exceptoId],
  );
  if (rows.length) {
    throw new HttpError(409, `La sede ya tiene un TICE activo (${rows[0].nombre}). Desactívelo primero.`);
  }
}

router.post('/usuarios', soloDirector, h(async (req, res) => {
  const nombre = texto(req.body.nombre, 'nombre', { requerido: true, max: 120 });
  const correo = texto(req.body.correo, 'correo', { requerido: true, max: 150 }).toLowerCase();
  if (!correoValido(correo)) throw invalido('Correo institucional inválido');
  const rol = opcion(req.body.rol, 'rol', ['DIRECTOR', 'TICE']);
  const sedeId = rol === 'TICE' ? entero(req.body.sede_id, 'sede_id', { requerido: true }) : null;
  validarPassword(req.body.password);

  const usuario = await tx(async (c) => {
    const { rows: existe } = await c.query('SELECT 1 FROM usuarios WHERE lower(correo) = $1', [correo]);
    if (existe.length) throw new HttpError(409, 'El correo ya está registrado. Ingrese otro correo.');
    if (rol === 'TICE') await verificarUnTice(c, sedeId);
    const hash = await bcrypt.hash(req.body.password, 10);
    const { rows: [u] } = await c.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol, sede_id) VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nombre, correo, rol, sede_id, activo`,
      [nombre, correo, hash, rol, sedeId],
    );
    await registrar(c, req.usuario, {
      entidad: 'usuario', entidadId: u.id, accion: 'CREAR', sedeId: sedeId,
      detalle: { nombre, correo, rol, sede_id: sedeId },
    });
    return u;
  });
  res.status(201).json(usuario);
}));

// Modificar o desactivar (los usuarios no se eliminan)
router.put('/usuarios/:id', soloDirector, h(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const usuario = await tx(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) throw noEncontrado('Usuario');
    const d = {
      nombre: texto(req.body.nombre, 'nombre', { max: 120 }) ?? antes.nombre,
      rol: req.body.rol ? opcion(req.body.rol, 'rol', ['DIRECTOR', 'TICE']) : antes.rol,
      activo: typeof req.body.activo === 'boolean' ? req.body.activo : antes.activo,
    };
    d.sede_id = d.rol === 'TICE' ? (entero(req.body.sede_id, 'sede_id') ?? antes.sede_id) : null;
    if (d.rol === 'TICE' && !d.sede_id) throw invalido('Un usuario TICE debe tener una sede');
    if (id === req.usuario.id && (!d.activo || d.rol !== 'DIRECTOR')) {
      throw invalido('No puede desactivar ni quitarse el rol de Director a sí mismo');
    }
    if (d.rol === 'TICE' && d.activo) await verificarUnTice(c, d.sede_id, id);
    let desbloquear = req.body.desbloquear === true;
    const { rows: [despues] } = await c.query(
      `UPDATE usuarios SET nombre=$2, rol=$3, sede_id=$4, activo=$5,
              intentos_fallidos = CASE WHEN $6 THEN 0 ELSE intentos_fallidos END,
              bloqueado_hasta = CASE WHEN $6 THEN NULL ELSE bloqueado_hasta END
        WHERE id=$1 RETURNING id, nombre, correo, rol, sede_id, activo, bloqueado_hasta`,
      [id, d.nombre, d.rol, d.sede_id, d.activo, desbloquear],
    );
    if (req.body.password) {
      validarPassword(req.body.password);
      await c.query('UPDATE usuarios SET password_hash = $2 WHERE id = $1', [id, await bcrypt.hash(req.body.password, 10)]);
    }
    const cambios = diferencias(antes, despues, ['nombre', 'rol', 'sede_id', 'activo']);
    if (req.body.password) cambios.password = 'cambiada';
    if (desbloquear) cambios.desbloqueo = true;
    await registrar(c, req.usuario, {
      entidad: 'usuario', entidadId: id, sedeId: despues.sede_id,
      accion: antes.activo && !despues.activo ? 'DESACTIVAR' : 'MODIFICAR', detalle: cambios,
    });
    return despues;
  });
  res.json(usuario);
}));

module.exports = router;
