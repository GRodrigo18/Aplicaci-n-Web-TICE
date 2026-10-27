const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { tx } = require('../db');
const { h, HttpError, invalido } = require('../lib/errores');
const { firmar, autenticar } = require('../lib/auth');
const { registrar } = require('../lib/bitacora');

const router = express.Router();

// UC-01 Iniciar sesión
router.post('/login', h(async (req, res) => {
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!correo || !password) throw invalido('Ingrese su correo institucional y su contraseña');

  const resultado = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT u.*, s.nombre AS sede_nombre FROM usuarios u LEFT JOIN sedes s ON s.id = u.sede_id
        WHERE lower(u.correo) = $1 FOR UPDATE OF u`,
      [correo],
    );
    const u = rows[0];
    if (!u || !u.activo) {
      return { error: new HttpError(401, 'Credenciales inválidas') };
    }
    if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
      const minutos = Math.ceil((new Date(u.bloqueado_hasta) - Date.now()) / 60000);
      return { error: new HttpError(423, `Cuenta bloqueada. Intente nuevamente en ${minutos} min`, { bloqueado: true }) };
    }
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      const intentos = u.intentos_fallidos + 1;
      const bloquear = intentos >= config.maxIntentos;
      await c.query(
        `UPDATE usuarios SET intentos_fallidos = $2,
                bloqueado_hasta = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END
          WHERE id = $1`,
        [u.id, bloquear ? 0 : intentos, bloquear, config.bloqueoMinutos],
      );
      await registrar(c, u, {
        entidad: 'usuario', entidadId: u.id, accion: bloquear ? 'CUENTA_BLOQUEADA' : 'LOGIN_FALLIDO',
        detalle: { intentos },
      });
      if (bloquear) {
        return { error: new HttpError(423, `Cuenta bloqueada durante ${config.bloqueoMinutos} min por ${config.maxIntentos} intentos fallidos`, { bloqueado: true }) };
      }
      return { error: new HttpError(401, 'Credenciales inválidas', { intentosRestantes: config.maxIntentos - intentos }) };
    }
    await c.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [u.id]);
    await registrar(c, u, { entidad: 'usuario', entidadId: u.id, accion: 'LOGIN', detalle: { ip: req.ip } });
    return { usuario: u };
  });

  // los intentos fallidos se guardan aunque la respuesta sea un error
  if (resultado.error) throw resultado.error;
  const u = resultado.usuario;
  res.json({
    token: firmar(u),
    usuario: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, sede_id: u.sede_id, sede_nombre: u.sede_nombre },
  });
}));

router.get('/me', autenticar, (req, res) => {
  const { id, nombre, correo, rol, sede_id, sede_nombre } = req.usuario;
  res.json({ id, nombre, correo, rol, sede_id, sede_nombre });
});

module.exports = router;
