const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('../config');

const MENSAJE = 'Demasiadas solicitudes. Espere un momento e intente nuevamente';

// IP del cliente. En Render el tráfico pasa siempre por Cloudflare, que escribe la IP real en CF-Connecting-IP.
// Solo se cree esa cabecera en Render (RENDER=true lo pone Render) o con CONFIAR_CF_CONNECTING_IP=true; en un
// servidor propio sin Cloudflare cualquiera podría inventarla, así que ahí se usa req.ip (trust proxy = 1).
const confiarCf = process.env.RENDER === 'true' || process.env.CONFIAR_CF_CONNECTING_IP === 'true';
const ipCliente = (req) => ipKeyGenerator(String((confiarCf && req.headers['cf-connecting-ip']) || req.ip || ''));

// El script de Gmail del buzón TICE se identifica con INBOUND_TOKEN (comparación en tiempo constante)
function esIntegracion(req) {
  const dado = req.headers['x-inbound-token'];
  if (!config.inboundToken || typeof dado !== 'string') return false;
  const a = Buffer.from(dado);
  const b = Buffer.from(config.inboundToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express no distingue mayúsculas ni la barra final: /api/Auth/Config/ es la misma ruta
const ruta = (req) => req.path.toLowerCase().replace(/\/+$/, '');

const limitar = (windowMs, limit, extra = {}) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: ipCliente,
  message: { error: MENSAJE },
  ...extra,
});

// Límites que se aplican ANTES de iniciar sesión (por IP)
function aplicarLimites(app) {
  const { autenticacionPorMinuto, anonimoPor15Min } = config.rateLimit;

  // Ingreso: solo cuentan las credenciales rechazadas (401). Un 403 "use Google", una cuenta de otro dominio o
  // una cuenta bloqueada (423) no gastan el cupo que comparte todo el colegio. Además la base de datos bloquea
  // cada cuenta 15 minutos tras 5 contraseñas erradas.
  const ingreso = limitar(60 * 1000, autenticacionPorMinuto, {
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  });
  app.post('/api/auth/login', ingreso);
  app.post('/api/auth/google', ingreso);

  // Página y reporte público por QR: docentes desde la red del colegio (misma IP), por eso un cupo más amplio
  app.use('/api/publico', limitar(60 * 1000, autenticacionPorMinuto * 3));

  // Webhook del buzón: con el token correcto no se limita; sin él, poco margen para probar tokens
  app.use('/api/correos/entrante', limitar(60 * 1000, autenticacionPorMinuto, { skip: esIntegracion }));

  // Resto de solicitudes sin sesión (por IP). Las que traen sesión se cuentan por usuario en limiteUsuario.
  // No cuentan la salud, la configuración de la pantalla de ingreso, el ingreso y el QR público (tienen su
  // propio límite arriba) ni el script de Gmail.
  const conLimitePropio = ['/salud', '/auth/config', '/auth/login', '/auth/google'];
  app.use('/api', limitar(15 * 60 * 1000, anonimoPor15Min, {
    skip: (req) => conLimitePropio.includes(ruta(req)) || ruta(req).startsWith('/publico/') || esIntegracion(req)
      || String(req.headers.authorization || '').startsWith('Bearer '),
  }));
}

// Límite general con sesión iniciada: va DESPUÉS de autenticar y cuenta por usuario, porque todo el
// colegio sale a internet con una sola IP.
function limiteUsuario() {
  if (!config.rateLimit.activo) return (_req, _res, next) => next();
  return limitar(15 * 60 * 1000, config.rateLimit.apiPor15Min, { keyGenerator: (req) => `usuario:${req.usuario.id}` });
}

module.exports = { aplicarLimites, limiteUsuario, MENSAJE };
