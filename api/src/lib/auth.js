const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const { HttpError, prohibido, invalido } = require('./errores');

function firmar(usuario) {
  return jwt.sign({ sub: usuario.id, rol: usuario.rol, sede_id: usuario.sede_id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

async function autenticar(req, _res, next) {
  try {
    const cabecera = req.headers.authorization || '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
    if (!token) throw new HttpError(401, 'Sesión no iniciada');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Sesión vencida o inválida');
    }
    // se vuelve a leer el usuario para respetar desactivaciones y cambios de sede
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.sede_id, u.activo, s.nombre AS sede_nombre
         FROM usuarios u LEFT JOIN sedes s ON s.id = u.sede_id WHERE u.id = $1`,
      [payload.sub],
    );
    const u = rows[0];
    if (!u || !u.activo) throw new HttpError(401, 'Usuario desactivado');
    req.usuario = u;
    next();
  } catch (err) {
    next(err);
  }
}

const esDirector = (u) => u.rol === 'DIRECTOR';

function soloDirector(req, _res, next) {
  if (!esDirector(req.usuario)) return next(prohibido('Solo el Director de TI puede realizar esta operación'));
  next();
}

function soloTice(req, _res, next) {
  if (req.usuario.rol !== 'TICE') return next(prohibido('Solo el TICE de la sede puede realizar esta operación'));
  next();
}

// Sede sobre la que trabaja la petición: el TICE siempre la suya; el Director la que pida o todas (null)
function sedeDeConsulta(req) {
  if (!esDirector(req.usuario)) return req.usuario.sede_id;
  const s = req.query.sede_id;
  if (s === undefined || s === '' || s === 'todas') return null;
  const id = Number(s);
  if (!Number.isInteger(id)) throw invalido('sede_id inválido');
  return id;
}

// Comprueba que un registro pertenece a una sede que el usuario puede ver
function verificarSede(usuario, sedeId) {
  if (!esDirector(usuario) && usuario.sede_id !== sedeId) {
    throw prohibido('El registro pertenece a otra sede');
  }
}

module.exports = { firmar, autenticar, soloDirector, soloTice, sedeDeConsulta, verificarSede, esDirector };
