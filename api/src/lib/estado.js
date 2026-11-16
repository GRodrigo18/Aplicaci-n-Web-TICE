// Estado del arranque, compartido entre server.js (que prepara la base) y /api/salud (que lo informa)
module.exports = {
  listo: false,
  inicio: new Date(),
  // versión desplegada: Render pone el commit en RENDER_GIT_COMMIT
  version: (process.env.RENDER_GIT_COMMIT || process.env.VERSION || 'local').slice(0, 12),
};
