const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { tx } = require('../db');
const { h, HttpError, invalido } = require('../lib/errores');
const { firmar, autenticar } = require('../lib/auth');
const { registrar } = require('../lib/bitacora');
const { verificarTokenGoogle } = require('../lib/google');
const { dominioDe } = require('../lib/util');

const router = express.Router();

const datosSesion = (u) => ({
  token: firmar(u),
  usuario: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, sede_id: u.sede_id, sede_nombre: u.sede_nombre },
});

// Datos públicos que la pantalla de inicio necesita antes de iniciar sesión
const soloGoogle = () => config.soloGoogle && Boolean(config.googleClientId);

router.get('/config', (_req, res) => {
  res.json({ google_client_id: config.googleClientId || null, dominios: config.dominiosCorreo, solo_google: soloGoogle() });
});

// Iniciar sesión con la cuenta de Google institucional. La cuenta debe estar registrada y activa en el sistema:
// Google solo confirma quién es; el rol y la sede los da el sistema.
router.post('/google', h(async (req, res) => {
  if (!config.googleClientId) throw new HttpError(404, 'El inicio de sesión con Google no está configurado');
  const credencial = String(req.body?.credential || '');
  if (!credencial) throw invalido('Falta la credencial de Google');
  const g = await verificarTokenGoogle(credencial, config.googleClientId);
  if (!config.dominiosCorreo.includes(dominioDe(g.correo))) {
    throw new HttpError(403, `Use su cuenta institucional (@${config.dominiosCorreo.join(' o @')})`);
  }
  const u = await tx(async (c) => {
    const { rows: [usuario] } = await c.query(
      `SELECT u.*, s.nombre AS sede_nombre FROM usuarios u LEFT JOIN sedes s ON s.id = u.sede_id WHERE lower(u.correo) = $1`, [g.correo]);
    if (!usuario || !usuario.activo) return null;
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      throw new HttpError(423, 'Cuenta bloqueada temporalmente por intentos fallidos', { bloqueado: true });
    }
    await c.query(`UPDATE usuarios SET ultimo_acceso = now(), ultimo_metodo = 'GOOGLE' WHERE id = $1`, [usuario.id]);
    await registrar(c, usuario, { entidad: 'usuario', entidadId: usuario.id, accion: 'LOGIN', detalle: { ip: req.ip, metodo: 'google' } });
    return usuario;
  });
  if (!u) throw new HttpError(403, `${g.correo} no tiene una cuenta activa en el sistema. Pida al Jefe de TI que la registre.`);
  res.json(datosSesion(u));
}));

// UC-01 Iniciar sesión
router.post('/login', h(async (req, res) => {
  if (soloGoogle()) throw new HttpError(403, 'Ingrese con su cuenta de Google institucional');
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
    await c.query(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now(), ultimo_metodo = 'CONTRASENA'
                    WHERE id = $1`, [u.id]);
    await registrar(c, u, { entidad: 'usuario', entidadId: u.id, accion: 'LOGIN', detalle: { ip: req.ip } });
    return { usuario: u };
  });

  // los intentos fallidos se guardan aunque la respuesta sea un error
  if (resultado.error) throw resultado.error;
  res.json(datosSesion(resultado.usuario));
}));

router.get('/me', autenticar, (req, res) => {
  const { id, nombre, correo, rol, sede_id, sede_nombre } = req.usuario;
  res.json({ id, nombre, correo, rol, sede_id, sede_nombre });
});

module.exports = router;
