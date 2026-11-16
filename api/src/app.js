const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { autenticar, soloDirector } = require('./lib/auth');
const { manejadorErrores } = require('./lib/errores');
const correos = require('./routes/correos');
const { aplicarLimites, limiteUsuario } = require('./lib/limites');

function crearApp() {
  const app = express();
  app.set('trust proxy', 1);
  // "same-origin-allow-popups" deja abrir la ventana de "Iniciar sesión con Google"
  // CSP a medida (segunda defensa ante XSS, porque la sesión vive en localStorage): solo el propio sitio y Google;
  // la cámara del lector QR necesita blob: y los estilos de Tailwind/Google, 'unsafe-inline'
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'https://accounts.google.com'],
        frameSrc: ['https://accounts.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '1mb' }));

  // Límite de peticiones. El colegio sale a internet con UNA sola IP (todos sus equipos detrás del mismo router),
  // así que sin sesión se cuenta por IP y con sesión por usuario (limiteUsuario, después de autenticar).
  if (config.rateLimit.activo) aplicarLimites(app);

  app.get('/api/salud', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth'));
  app.post('/api/correos/entrante', correos.rutaEntrante(config));
  app.use('/api/correos/salida', correos.rutasSalida(config));
  // reporte de fallas por QR para docentes, sin cuenta (Google confirma quién reporta)
  app.use('/api/publico', require('./routes/publico'));

  app.use('/api', autenticar);
  app.use('/api', limiteUsuario());
  app.use('/api', require('./routes/admin'));
  app.use('/api/catalogos', require('./routes/catalogos'));
  app.use('/api/equipos', require('./routes/equipos'));
  app.use('/api/qr', require('./routes/qr'));
  app.use('/api/incidencias', require('./routes/incidencias'));
  app.use('/api/correos', correos);
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/bitacora', soloDirector, require('./routes/bitacora'));
  app.use('/api/basedatos', soloDirector, require('./routes/basedatos'));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  if (config.webDist) {
    app.use(express.static(config.webDist, { index: false, maxAge: '30d' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
