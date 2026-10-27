-- Sistema web TICE: inventario de equipos y gestión de incidencias
-- PostgreSQL 16. Se ejecuta una sola vez al crear la base de datos.

-- ============================================================
-- Catálogos
-- ============================================================
CREATE TABLE sedes (
  id            SERIAL PRIMARY KEY,
  codigo        VARCHAR(10)  NOT NULL UNIQUE,
  nombre        VARCHAR(100) NOT NULL UNIQUE,
  direccion     VARCHAR(200),
  correo_buzon  VARCHAR(150) NOT NULL UNIQUE,   -- buzón TICE de la sede (punto único de contacto)
  activa        BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE tipos_equipo (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE estados_equipo (
  codigo     VARCHAR(20) PRIMARY KEY,
  nombre     VARCHAR(40) NOT NULL,
  operativo  BOOLEAN     NOT NULL           -- cuenta como operativo para la DT
);

CREATE TABLE prioridades (
  codigo       VARCHAR(10) PRIMARY KEY,
  nombre       VARCHAR(20) NOT NULL,
  sla_minutos  INTEGER     NOT NULL CHECK (sla_minutos > 0),
  orden        INTEGER     NOT NULL
);

CREATE TABLE estados_incidencia (
  codigo  VARCHAR(12) PRIMARY KEY,
  nombre  VARCHAR(20) NOT NULL,
  orden   INTEGER     NOT NULL
);

-- ============================================================
-- Usuarios
-- ============================================================
CREATE TABLE usuarios (
  id                 SERIAL PRIMARY KEY,
  nombre             VARCHAR(120) NOT NULL,
  correo             VARCHAR(150) NOT NULL,
  password_hash      VARCHAR(100) NOT NULL,
  rol                VARCHAR(10)  NOT NULL CHECK (rol IN ('DIRECTOR', 'TICE')),
  sede_id            INTEGER REFERENCES sedes(id),
  activo             BOOLEAN      NOT NULL DEFAULT TRUE,
  intentos_fallidos  INTEGER      NOT NULL DEFAULT 0,
  bloqueado_hasta    TIMESTAMPTZ,
  creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (rol = 'DIRECTOR' OR sede_id IS NOT NULL)
);
CREATE UNIQUE INDEX usuarios_correo_unico ON usuarios (lower(correo));
-- RF-01: un solo TICE activo por sede
CREATE UNIQUE INDEX un_tice_activo_por_sede ON usuarios (sede_id) WHERE rol = 'TICE' AND activo;

-- ============================================================
-- Inventario
-- ============================================================
CREATE TABLE equipos (
  id                   SERIAL PRIMARY KEY,
  sede_id              INTEGER      NOT NULL REFERENCES sedes(id),
  codigo               VARCHAR(40)  NOT NULL,
  tipo_id              INTEGER      NOT NULL REFERENCES tipos_equipo(id),
  marca                VARCHAR(60)  NOT NULL,
  modelo               VARCHAR(80),
  serie                VARCHAR(80),
  fecha_adquisicion    DATE,
  estado               VARCHAR(20)  NOT NULL REFERENCES estados_equipo(codigo),
  ubicacion            VARCHAR(80)  NOT NULL,
  observaciones        TEXT,
  caracteristicas      TEXT,                     -- procesador, RAM, disco, pantalla…
  mac                  VARCHAR(40),
  propiedad            VARCHAR(10) CHECK (propiedad IN ('PROPIO', 'ALQUILADO')),
  responsable          VARCHAR(120),
  guia_factura         VARCHAR(60),
  qr_token             VARCHAR(40)  NOT NULL UNIQUE,
  ultima_verificacion  TIMESTAMPTZ,
  motivo_baja          TEXT,
  fecha_baja           TIMESTAMPTZ,
  creado_en            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (sede_id, codigo),
  CHECK ((estado = 'BAJA') = (motivo_baja IS NOT NULL))
);
CREATE INDEX equipos_sede_estado ON equipos (sede_id, estado);

-- ============================================================
-- Mesa de ayuda
-- ============================================================
-- Matriz de prioridad de ITIL 4 (Tabla 23 del informe)
CREATE FUNCTION prioridad_itil(impacto TEXT, urgencia TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN impacto = 'ALTO'  AND urgencia = 'ALTA'  THEN 'CRITICA'
    WHEN impacto = 'ALTO'  AND urgencia = 'MEDIA' THEN 'ALTA'
    WHEN impacto = 'MEDIO' AND urgencia = 'ALTA'  THEN 'ALTA'
    WHEN impacto = 'ALTO'  AND urgencia = 'BAJA'  THEN 'MEDIA'
    WHEN impacto = 'MEDIO' AND urgencia = 'MEDIA' THEN 'MEDIA'
    WHEN impacto = 'BAJO'  AND urgencia = 'ALTA'  THEN 'MEDIA'
    ELSE 'BAJA'
  END
$$;

-- Bandeja de correos que llegan al buzón TICE de cada sede (RF-10)
CREATE TABLE correos_entrantes (
  id                SERIAL PRIMARY KEY,
  sede_id           INTEGER      NOT NULL REFERENCES sedes(id),
  remitente         VARCHAR(150) NOT NULL,
  remitente_nombre  VARCHAR(120),
  asunto            VARCHAR(250) NOT NULL,
  cuerpo            TEXT         NOT NULL,
  recibido_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  estado            VARCHAR(12)  NOT NULL DEFAULT 'POR_ATENDER'
                    CHECK (estado IN ('POR_ATENDER', 'CONVERTIDO', 'DESCARTADO')),
  motivo_descarte   TEXT,
  atendido_en       TIMESTAMPTZ,
  CHECK (estado <> 'DESCARTADO' OR length(trim(motivo_descarte)) > 0)
);
CREATE INDEX correos_sede_estado ON correos_entrantes (sede_id, estado);

CREATE SEQUENCE incidencias_numero_seq START 1;

CREATE TABLE incidencias (
  id                  SERIAL PRIMARY KEY,
  numero              VARCHAR(20)  NOT NULL UNIQUE
                      DEFAULT 'TCK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('incidencias_numero_seq')::text, 5, '0'),
  sede_id             INTEGER      NOT NULL REFERENCES sedes(id),
  correo_id           INTEGER      UNIQUE REFERENCES correos_entrantes(id),
  solicitante_correo  VARCHAR(150) NOT NULL,
  solicitante_nombre  VARCHAR(120),
  asunto              VARCHAR(250) NOT NULL,
  descripcion         TEXT         NOT NULL CHECK (length(trim(descripcion)) > 0),
  categoria           VARCHAR(40)  NOT NULL,
  impacto             VARCHAR(5)   NOT NULL CHECK (impacto  IN ('ALTO', 'MEDIO', 'BAJO')),
  urgencia            VARCHAR(5)   NOT NULL CHECK (urgencia IN ('ALTA', 'MEDIA', 'BAJA')),
  prioridad           VARCHAR(10)  NOT NULL REFERENCES prioridades(codigo),
  estado              VARCHAR(12)  NOT NULL DEFAULT 'PENDIENTE' REFERENCES estados_incidencia(codigo),
  asignado_a          INTEGER      REFERENCES usuarios(id),
  diagnostico         TEXT,
  solucion            TEXT,
  fecha_registro      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  fecha_inicio        TIMESTAMPTZ,
  fecha_resolucion    TIMESTAMPTZ,
  fecha_cierre        TIMESTAMPTZ,
  actualizado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Escalamiento ITIL 4: 1 = TICE de la sede, 2 = Coordinación TICE / Director de TI, 3 = proveedor externo
  nivel_escalamiento  SMALLINT     NOT NULL DEFAULT 1 CHECK (nivel_escalamiento BETWEEN 1 AND 3),
  escalado_en         TIMESTAMPTZ,
  proveedor_externo   VARCHAR(120),
  caso_proveedor      VARCHAR(60),
  alerta_sla_en       TIMESTAMPTZ,
  CONSTRAINT nivel3_con_proveedor CHECK (nivel_escalamiento < 3 OR length(trim(proveedor_externo)) > 0),
  -- la base de datos exige la prioridad de la matriz de impacto y urgencia
  CONSTRAINT prioridad_segun_matriz CHECK (prioridad = prioridad_itil(impacto, urgencia)),
  -- no se resuelve sin solución registrada
  CONSTRAINT resuelto_con_solucion CHECK (
    estado NOT IN ('RESUELTO', 'CERRADO') OR (length(trim(solucion)) > 0 AND fecha_resolucion IS NOT NULL))
);
CREATE INDEX incidencias_sede_estado ON incidencias (sede_id, estado);

-- RF-04: un ticket con uno o varios equipos
CREATE TABLE incidencia_equipos (
  incidencia_id  INTEGER NOT NULL REFERENCES incidencias(id),
  equipo_id      INTEGER NOT NULL REFERENCES equipos(id),
  PRIMARY KEY (incidencia_id, equipo_id)
);

-- Bandeja de salida de los correos al solicitante (UC-10)
CREATE TABLE notificaciones (
  id             SERIAL PRIMARY KEY,
  incidencia_id  INTEGER      REFERENCES incidencias(id),
  destinatario   VARCHAR(150) NOT NULL,
  asunto         VARCHAR(250) NOT NULL,
  cuerpo         TEXT         NOT NULL,
  estado         VARCHAR(10)  NOT NULL DEFAULT 'PENDIENTE'
                 CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'SIMULADO', 'ERROR')),
  intentos       INTEGER      NOT NULL DEFAULT 0,
  error          TEXT,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  enviado_en     TIMESTAMPTZ
);

-- ============================================================
-- Auditoría física del inventario por pistoleo QR
-- ============================================================
CREATE TABLE auditorias_inventario (
  id                   SERIAL PRIMARY KEY,
  sede_id              INTEGER     NOT NULL REFERENCES sedes(id),
  usuario_id           INTEGER     NOT NULL REFERENCES usuarios(id),
  estado               VARCHAR(12) NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO', 'FINALIZADA')),
  fecha_inicio         TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_fin            TIMESTAMPTZ,
  equipos_esperados    INTEGER     NOT NULL,
  equipos_encontrados  INTEGER,
  equipos_reubicados   INTEGER,
  equipos_faltantes    INTEGER,
  tel                  NUMERIC(5,2),
  tai_dias             INTEGER
);
CREATE UNIQUE INDEX una_auditoria_en_curso_por_sede ON auditorias_inventario (sede_id) WHERE estado = 'EN_CURSO';

CREATE TABLE auditoria_items (
  id                  SERIAL PRIMARY KEY,
  auditoria_id        INTEGER     NOT NULL REFERENCES auditorias_inventario(id),
  equipo_id           INTEGER     NOT NULL REFERENCES equipos(id),
  ambiente            VARCHAR(80) NOT NULL,
  ubicacion_anterior  VARCHAR(80) NOT NULL,
  resultado           VARCHAR(12) NOT NULL CHECK (resultado IN ('ENCONTRADO', 'REUBICADO')),
  leido_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auditoria_id, equipo_id)
);

-- ============================================================
-- Trazabilidad (RF-05, RNF-05)
-- ============================================================
CREATE TABLE logs_auditoria (
  id              BIGSERIAL PRIMARY KEY,
  secuencia       BIGINT       NOT NULL UNIQUE,
  fecha           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  txid            BIGINT       NOT NULL DEFAULT txid_current(),
  usuario_id      INTEGER,
  usuario_correo  VARCHAR(150),
  sede_id         INTEGER,
  entidad         VARCHAR(30)  NOT NULL,
  entidad_id      INTEGER,
  accion          VARCHAR(30)  NOT NULL,
  detalle         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  hash_anterior   CHAR(64)     NOT NULL,
  hash            CHAR(64)     NOT NULL
);
CREATE INDEX logs_entidad ON logs_auditoria (entidad, entidad_id);
CREATE INDEX logs_txid ON logs_auditoria (txid);

-- Conteo independiente de operaciones, alimentado por triggers
CREATE TABLE operaciones_bd (
  id          BIGSERIAL PRIMARY KEY,
  tabla       VARCHAR(30) NOT NULL,
  operacion   VARCHAR(6)  NOT NULL,
  registro_id INTEGER     NOT NULL,
  txid        BIGINT      NOT NULL DEFAULT txid_current(),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX operaciones_txid ON operaciones_bd (txid);

-- Hash SHA-256 de un registro de la bitácora; se recalcula igual al verificar
CREATE FUNCTION log_hash(l logs_auditoria) RETURNS CHAR(64)
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    l.hash_anterior, l.secuencia,
    to_char(l.fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    coalesce(l.usuario_id::text, ''), coalesce(l.usuario_correo, ''), coalesce(l.sede_id::text, ''),
    l.entidad, coalesce(l.entidad_id::text, ''), l.accion, l.detalle::text), 'UTF8')), 'hex')
$$;

CREATE FUNCTION logs_encadenar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previo logs_auditoria%ROWTYPE;
BEGIN
  -- un solo escritor a la vez mantiene la cadena ordenada
  PERFORM pg_advisory_xact_lock(727274);
  SELECT * INTO previo FROM logs_auditoria ORDER BY secuencia DESC LIMIT 1;
  NEW.secuencia := coalesce(previo.secuencia, 0) + 1;
  NEW.hash_anterior := coalesce(previo.hash, repeat('0', 64));
  NEW.fecha := date_trunc('milliseconds', coalesce(NEW.fecha, now()));
  NEW.hash := log_hash(NEW);
  RETURN NEW;
END $$;

CREATE TRIGGER logs_auditoria_encadenar BEFORE INSERT ON logs_auditoria
  FOR EACH ROW EXECUTE FUNCTION logs_encadenar();

CREATE FUNCTION logs_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de auditoría es inmutable: % no está permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER logs_auditoria_sin_update BEFORE UPDATE OR DELETE ON logs_auditoria
  FOR EACH ROW EXECUTE FUNCTION logs_inmutable();
CREATE TRIGGER logs_auditoria_sin_truncate BEFORE TRUNCATE ON logs_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION logs_inmutable();

CREATE FUNCTION contar_operacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO operaciones_bd (tabla, operacion, registro_id)
  VALUES (TG_TABLE_NAME, TG_OP, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
  RETURN NULL;
END $$;

CREATE TRIGGER equipos_contar AFTER INSERT OR UPDATE OR DELETE ON equipos
  FOR EACH ROW EXECUTE FUNCTION contar_operacion();
CREATE TRIGGER incidencias_contar AFTER INSERT OR UPDATE OR DELETE ON incidencias
  FOR EACH ROW EXECUTE FUNCTION contar_operacion();

-- Transacciones que escribieron en equipos o incidencias sin dejar registro en la bitácora
CREATE VIEW operaciones_sin_bitacora AS
  SELECT o.* FROM operaciones_bd o
  WHERE NOT EXISTS (SELECT 1 FROM logs_auditoria l WHERE l.txid = o.txid);

-- ============================================================
-- Datos de catálogo
-- ============================================================
INSERT INTO estados_equipo (codigo, nombre, operativo) VALUES
  ('OPERATIVO', 'Operativo', TRUE),
  ('MANTENIMIENTO', 'En mantenimiento', FALSE),
  ('AVERIADO', 'Averiado', FALSE),
  ('OBSOLETO', 'Obsoleto', TRUE),
  ('BAJA', 'De baja', FALSE);

INSERT INTO prioridades (codigo, nombre, sla_minutos, orden) VALUES
  ('CRITICA', 'Crítica', 20, 1),
  ('ALTA', 'Alta', 45, 2),
  ('MEDIA', 'Media', 120, 3),
  ('BAJA', 'Baja', 480, 4);

INSERT INTO estados_incidencia (codigo, nombre, orden) VALUES
  ('PENDIENTE', 'Pendiente', 1),
  ('EN_PROCESO', 'En proceso', 2),
  ('RESUELTO', 'Resuelto', 3),
  ('CERRADO', 'Cerrado', 4);

INSERT INTO tipos_equipo (nombre) VALUES
  ('Access point'), ('Computadora de escritorio'), ('Impresora'), ('Laptop'), ('Monitor'), ('Pizarra digital'),
  ('Proyector'), ('Switch de red'), ('Tablet'), ('UPS'), ('Televisor'), ('Equipo de sonido'), ('All in One'), ('Servidor'), ('Otro');
