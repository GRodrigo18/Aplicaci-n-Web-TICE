const express = require('express');
const config = require('./config');
const { crearApp } = require('./app');
const { pool } = require('./db');
const estado = require('./lib/estado');
const { migrar } = require('./scripts/migrate');
const notificaciones = require('./lib/notificaciones');
const escalamiento = require('./lib/escalamiento');
const { actualizarDemo } = require('./scripts/seed');
const { instalarDesdeEntorno } = require('./scripts/instalar');

// El puerto se abre antes de preparar la base: con una base remota (por ejemplo Supabase) crear las tablas y
// cargar la demostración puede tardar más de lo que el servicio de despliegue espera para ver el puerto abierto.
// Mientras tanto la API responde 503 (la web lo muestra como "el sistema se está preparando"); /api/salud responde siempre.
const servidor = express();
servidor.use((req, res, next) => {
  if (estado.listo || req.path.startsWith('/api/salud') || !req.path.startsWith('/api/')) return next();
  res.set('Retry-After', '30').status(503).json({ error: 'El sistema se está preparando. Vuelva a intentarlo en unos minutos.' });
});
servidor.use(crearApp());

async function preparar() {
  await migrar();
  // con las cuentas reales en el entorno no se usa la demostración
  if (process.env.CORREO_JEFE && process.env.CORREO_TICE) await instalarDesdeEntorno();
  else if (config.datosDemo && (await actualizarDemo())) console.log('Datos de demostración cargados');
  notificaciones.iniciarProceso();
  escalamiento.iniciarRevision(config.escalamientoIntervaloMs);
  estado.listo = true;
  console.log('Sistema listo');
}

// Si la base no responde al arrancar (Supabase pausado, red caída) no se apaga el servicio: la web sigue
// mostrando "se está preparando" y se reintenta con espera creciente. Con usuario o contraseña errados se espera
// más, porque Supabase bloquea por varios minutos a quien insiste.
const esErrorDeClave = (err) => /usuario y la contraseña/.test(err.message);
async function prepararConReintentos() {
  for (let intento = 1; ; intento++) {
    try {
      return await preparar();
    } catch (err) {
      const espera = esErrorDeClave(err) ? 5 * 60 : Math.min(15 * 2 ** (intento - 1), 300);
      console.error(`No se pudo iniciar la API (intento ${intento}); se reintenta en ${espera} s:`, err.message);
      await new Promise((r) => setTimeout(r, espera * 1000));
    }
  }
}

const http = servidor.listen(config.port, () => {
  console.log(`API TICE escuchando en el puerto ${config.port} (versión ${estado.version})`);
  prepararConReintentos();
});

// Un error asíncrono olvidado se registra en vez de tumbar todo el sistema
process.on('unhandledRejection', (err) => console.error('Promesa rechazada sin manejar:', err));

// Render envía SIGTERM al publicar una versión nueva: se terminan las peticiones en curso y se cierra la base
let cerrando = false;
function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  console.log(`${senal} recibido: cerrando el servidor`);
  setTimeout(() => process.exit(0), 10000).unref();
  http.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
