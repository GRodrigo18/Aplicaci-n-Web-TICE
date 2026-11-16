const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('../config');

const MENSAJE = 'Demasiadas solicitudes. Espere un momento e intente nuevamente';

// IP del cliente. En Render el tráfico pasa por Cloudflare, que envía la IP real en CF-Connecting-IP;
// sin esa cabecera (servidor propio) se usa req.ip (trust proxy = 1).
const ipCliente = (req) => ipKeyGenerator(String(req.headers['cf-connecting-ip'] || req.ip || ''));

// Usuario de la sesión, si el token es válido (un token falso no puede gastar el cupo de otro usuario)
function usuarioDe(req) {
  const cabecera = req.headers.authorization || '';
  if (!cabecera.startsWith('Bearer ')) return null;
  try { return jwt.verify(cabecera.slice(7), config.jwtSecret).sub ?? null; } catch { return null; }
}

// El script de Gmail del buzón TICE se identifica con INBOUND_TOKEN y llama varias veces por minuto
const esIntegracion = (req) => Boolean(config.inboundToken) && req.headers['x-inbound-token'] === config.inboundToken;

const limitar = (windowMs, limit, extra = {}) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: ipCliente,
  message: { error: MENSAJE },
  ...extra,
});

function aplicarLimites(app) {
  const { autenticacionPorMinuto, apiPor15Min } = config.rateLimit;

  // Ingreso (contraseña o Google): solo cuentan los intentos FALLIDOS. Además, cada cuenta se bloquea
  // 15 minutos tras 5 contraseñas erradas (eso lo hace la base de datos, no este límite).
  const ingreso = limitar(60 * 1000, autenticacionPorMinuto, { skipSuccessfulRequests: true });
  app.post('/api/auth/login', ingreso);
  app.post('/api/auth/google', ingreso);

  // Reporte público por QR: lo envían docentes desde la red del colegio (misma IP), por eso un cupo más amplio
  app.post('/api/publico/*', limitar(60 * 1000, autenticacionPorMinuto * 3));

  // Webhook del buzón: con el token correcto no se limita; sin él, poco margen para probar tokens
  app.use('/api/correos/entrante', limitar(60 * 1000, autenticacionPorMinuto, { skip: esIntegracion }));

  // Límite general: por usuario con sesión, por IP sin sesión. No cuentan la salud del servicio,
  // la configuración de la pantalla de ingreso ni el script de Gmail.
  app.use('/api', limitar(15 * 60 * 1000, apiPor15Min, {
    keyGenerator: (req) => { const u = usuarioDe(req); return u != null ? `usuario:${u}` : ipCliente(req); },
    skip: (req) => req.path === '/salud' || req.path === '/auth/config' || esIntegracion(req),
  }));
}

module.exports = { aplicarLimites, MENSAJE };
