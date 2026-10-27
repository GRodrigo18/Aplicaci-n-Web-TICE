const express = require('express');
const { query } = require('../db');
const { h } = require('../lib/errores');
const { MATRIZ } = require('../lib/util');

const router = express.Router();

router.get('/', h(async (_req, res) => {
  const [tipos, estados, prioridades, estadosInc] = await Promise.all([
    query('SELECT * FROM tipos_equipo ORDER BY nombre'),
    query('SELECT * FROM estados_equipo ORDER BY operativo DESC, codigo'),
    query('SELECT * FROM prioridades ORDER BY orden'),
    query('SELECT * FROM estados_incidencia ORDER BY orden'),
  ]);
  res.json({
    tipos_equipo: tipos.rows,
    estados_equipo: estados.rows,
    prioridades: prioridades.rows,
    estados_incidencia: estadosInc.rows,
    matriz_prioridad: MATRIZ,
    categorias: ['Hardware', 'Software', 'Red e internet', 'Proyección y audio', 'Impresión', 'Cuentas y accesos', 'Otro'],
  });
}));

module.exports = router;
