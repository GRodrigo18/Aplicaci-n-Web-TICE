const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { autenticar, soloDirector } = require('./lib/auth');
const { manejadorErrores } = require('./lib/errores');
const correos = require('./routes/correos');

function crearApp() {
  const app = express();
  app.set('trust proxy', 1);
  // con la web servida aquí, la CSP por defecto de helmet bloquearía la cámara y los estilos de la SPA (Nginx no la usa)
  // "same-origin-allow-popups" deja abrir la ventana de "Iniciar sesión con Google"
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    ...(config.webDist ? { contentSecurityPolicy: false } : {}),
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/salud', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth'));
  app.post('/api/correos/entrante', correos.rutaEntrante(config));

  app.use('/api', autenticar);
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
