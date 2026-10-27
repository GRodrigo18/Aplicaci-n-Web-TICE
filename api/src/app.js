const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { autenticar, soloDirector } = require('./lib/auth');
const { manejadorErrores } = require('./lib/errores');
const correos = require('./routes/correos');

function crearApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
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

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
