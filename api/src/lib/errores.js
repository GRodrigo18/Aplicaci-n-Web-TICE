class HttpError extends Error {
  constructor(status, mensaje, extra) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

const noEncontrado = (que) => new HttpError(404, `${que} no encontrado`);
const prohibido = (msg = 'No tiene permiso para esta operación') => new HttpError(403, msg);
const invalido = (msg, extra) => new HttpError(400, msg, extra);

// Envuelve un handler async para que sus errores lleguen al manejador central
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function manejadorErrores(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  }
  // Errores de PostgreSQL que corresponden a reglas de negocio
  if (err.code === '23505') {
    return res.status(409).json({ error: 'El registro ya existe', detalle: err.constraint });
  }
  if (err.code === '23514' || err.code === '23503' || err.code === '22P02') {
    return res.status(400).json({ error: 'Datos inválidos', detalle: err.constraint || err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { HttpError, noEncontrado, prohibido, invalido, h, manejadorErrores };
