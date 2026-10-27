const config = require('./config');
const { crearApp } = require('./app');
const { migrar } = require('./scripts/migrate');
const notificaciones = require('./lib/notificaciones');
const escalamiento = require('./lib/escalamiento');
const { actualizarDemo } = require('./scripts/seed');

async function main() {
  await migrar();
  if (config.datosDemo && (await actualizarDemo())) console.log('Datos de demostración cargados');
  notificaciones.iniciarProceso();
  escalamiento.iniciarRevision(config.escalamientoIntervaloMs);
  crearApp().listen(config.port, () => {
    console.log(`API TICE escuchando en el puerto ${config.port}`);
  });
}

main().catch((err) => {
  console.error('No se pudo iniciar la API:', err);
  process.exit(1);
});
