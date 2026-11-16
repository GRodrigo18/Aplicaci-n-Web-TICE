// Salud del sistema, sin sesión. La usan Render (healthCheckPath), las pruebas de humo de GitHub Actions y la
// pantalla "sin conexión" de la web.
const express = require('express');
const { pool } = require('../db');
const estado = require('../lib/estado');

const router = express.Router();
const TIEMPO_MAX_BD_MS = 5000;

// Rápida y sin base de datos: así una caída breve de Supabase no hace que Render reinicie el servicio en bucle
router.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({
    ok: true,
    listo: estado.listo,
    version: estado.version,
    activo_desde: estado.inicio.toISOString(),
  });
});

// Comprueba de verdad la base (SELECT 1 con tiempo máximo). 503 si no responde; sin detalles internos
router.get('/bd', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const t0 = Date.now();
  let temporizador;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_r, rechazar) => { temporizador = setTimeout(() => rechazar(new Error('tiempo agotado')), TIEMPO_MAX_BD_MS); }),
    ]);
    res.json({ ok: true, listo: estado.listo, bd: 'ok', ms: Date.now() - t0 });
  } catch (err) {
    console.error('Salud: la base de datos no responde:', err.message);
    res.status(503).json({ ok: false, listo: estado.listo, bd: 'sin conexión', error: 'La base de datos no responde' });
  } finally {
    clearTimeout(temporizador);
  }
});

module.exports = router;
