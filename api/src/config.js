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
  // Cómo salen los correos: con SMTP_HOST por SMTP; con CORREO_SALIDA=gmail los envía el script del buzón (Apps Script);
  // sin ninguno quedan como "simulados"
  correoSalida: env.SMTP_HOST ? 'smtp' : (env.CORREO_SALIDA || '').toLowerCase() === 'gmail' ? 'gmail' : 'simulado',
  // AUTO_TICKET_CORREO=true: los correos nuevos de cuentas institucionales se convierten solos en ticket
  autoTicketCorreo: env.AUTO_TICKET_CORREO === 'true',
  notificacionesIntervaloMs: Number(env.NOTIFICACIONES_INTERVALO_MS || 15000),
  escalamientoIntervaloMs: Number(env.ESCALAMIENTO_INTERVALO_MS || 60000),
  // Despliegue en un solo servicio (Render): la API sirve también la aplicación web compilada
  webDist: env.WEB_DIST || '',
  datosDemo: env.DATOS_DEMO === 'true',
  // Solo se aceptan cuentas y buzones del dominio institucional (varios separados por coma)
  dominiosCorreo: (env.DOMINIOS_CORREO || 'nslm.edu.pe').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  // ID de cliente OAuth de Google Cloud; sin él no se muestra "Iniciar sesión con Google"
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  // SOLO_GOOGLE=true: se entra solo con Google (necesita GOOGLE_CLIENT_ID; sin él se sigue aceptando la contraseña)
  soloGoogle: env.SOLO_GOOGLE === 'true',
};

if (!config.jwtSecret) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Defina JWT_SECRET en el archivo .env');
  }
  config.jwtSecret = 'solo-para-desarrollo-cambiar-en-produccion';
}

module.exports = config;
