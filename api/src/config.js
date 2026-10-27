const env = process.env;

const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://tice:tice@localhost:5432/tice',
  jwtSecret: env.JWT_SECRET || '',
  jwtExpiresIn: '8h',
  maxIntentos: 5,
  bloqueoMinutos: 15,
  inboundToken: env.INBOUND_TOKEN || '',
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'TICE <tice@colegio.edu.pe>',
  },
  notificacionesIntervaloMs: Number(env.NOTIFICACIONES_INTERVALO_MS || 15000),
  escalamientoIntervaloMs: Number(env.ESCALAMIENTO_INTERVALO_MS || 60000),
};

if (!config.jwtSecret) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Defina JWT_SECRET en el archivo .env');
  }
  config.jwtSecret = 'solo-para-desarrollo-cambiar-en-produccion';
}

module.exports = config;
