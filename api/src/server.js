const express = require('express');
const config = require('./config');
const { crearApp } = require('./app');
const { migrar } = require('./scripts/migrate');
const notificaciones = require('./lib/notificaciones');
const escalamiento = require('./lib/escalamiento');
const { actualizarDemo } = require('./scripts/seed');

// El puerto se abre antes de preparar la base: con una base remota (por ejemplo Supabase) crear las tablas y
// cargar la demostración puede tardar más de lo que el servicio de despliegue espera para ver el puerto abierto.
// Mientras tanto la API responde 503; /api/salud responde siempre.
let listo = false;
const servidor = express();
servidor.use((req, res, next) => {
  if (listo || req.path === '/api/salud' || !req.path.startsWith('/api/')) return next();
  res.status(503).json({ error: 'El sistema se está preparando. Vuelva a intentarlo en unos minutos.' });
});
servidor.use(crearApp());

async function preparar() {
  await migrar();
  if (config.datosDemo && (await actualizarDemo())) console.log('Datos de demostración cargados');
  notificaciones.iniciarProceso();
  escalamiento.iniciarRevision(config.escalamientoIntervaloMs);
  listo = true;
  console.log('Sistema listo');
}

servidor.listen(config.port, () => {
  console.log(`API TICE escuchando en el puerto ${config.port}`);
  preparar().catch((err) => {
    console.error('No se pudo iniciar la API:', err);
    process.exit(1);
  });
});
