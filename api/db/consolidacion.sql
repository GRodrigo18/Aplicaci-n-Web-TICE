-- Consolidación (noviembre 2026): equipos alquilados, mantenimientos, respuestas por correo y bajas aprobadas por el Jefe de TI.
-- Se ejecuta en cada arranque y es idempotente: en una base que ya tiene estos cambios no hace nada.

-- 1) Equipos alquilados (p. ej. All in One del proveedor): quién es el dueño, el contrato y hasta cuándo
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS proveedor VARCHAR(120);
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS contrato VARCHAR(60);
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS fin_contrato DATE;

-- 2) Historial de mantenimiento de cada equipo (preventivo o correctivo; el correctivo puede venir de un ticket)
CREATE TABLE IF NOT EXISTS mantenimientos (
  id             SERIAL PRIMARY KEY,
  equipo_id      INTEGER      NOT NULL REFERENCES equipos(id),
  sede_id        INTEGER      NOT NULL REFERENCES sedes(id),
  tipo           VARCHAR(12)  NOT NULL CHECK (tipo IN ('PREVENTIVO', 'CORRECTIVO')),
  fecha          DATE         NOT NULL DEFAULT current_date,
  descripcion    TEXT         NOT NULL CHECK (length(trim(descripcion)) > 0),
  realizado_por  VARCHAR(120),                     -- técnico TICE o proveedor
  usuario_id     INTEGER      REFERENCES usuarios(id),
  incidencia_id  INTEGER      REFERENCES incidencias(id),
  proximo        DATE,                             -- próximo mantenimiento preventivo
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mantenimientos_equipo ON mantenimientos (equipo_id, fecha DESC);

-- 3) Respuestas por correo: un correo con [TCK-AAAA-NNNNN] en el asunto se une a su ticket
ALTER TABLE correos_entrantes ADD COLUMN IF NOT EXISTS incidencia_id INTEGER REFERENCES incidencias(id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'correos_entrantes_estado_check'
                 AND pg_get_constraintdef(oid) LIKE '%RESPUESTA%') THEN
    ALTER TABLE correos_entrantes DROP CONSTRAINT IF EXISTS correos_entrantes_estado_check;
    ALTER TABLE correos_entrantes ADD CONSTRAINT correos_entrantes_estado_check
      CHECK (estado IN ('POR_ATENDER', 'CONVERTIDO', 'DESCARTADO', 'RESPUESTA'));
  END IF;
  -- ENVIANDO: el script del buzón (Gmail) tomó el correo para enviarlo
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notificaciones_estado_check'
                 AND pg_get_constraintdef(oid) LIKE '%ENVIANDO%') THEN
    ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_estado_check;
    ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_estado_check
      CHECK (estado IN ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'SIMULADO', 'ERROR'));
  END IF;
END $$;
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS tomado_en TIMESTAMPTZ;

-- 4) La baja de un equipo la solicita el TICE y la aprueba el Jefe de TI
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS baja_solicitada_en TIMESTAMPTZ;
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS baja_solicitada_por INTEGER REFERENCES usuarios(id);
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS baja_motivo_solicitud TEXT;
