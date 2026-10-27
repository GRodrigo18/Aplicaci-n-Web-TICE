-- Actualizaciones para bases creadas antes de la semana 9 (escalamiento y catálogo de tipos). En una base nueva no cambia nada.
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS nivel_escalamiento SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS escalado_en TIMESTAMPTZ;
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS proveedor_externo VARCHAR(120);
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS caso_proveedor VARCHAR(60);
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS alerta_sla_en TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidencias_nivel_escalamiento_check') THEN
    ALTER TABLE incidencias ADD CONSTRAINT incidencias_nivel_escalamiento_check CHECK (nivel_escalamiento BETWEEN 1 AND 3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nivel3_con_proveedor') THEN
    ALTER TABLE incidencias ADD CONSTRAINT nivel3_con_proveedor
      CHECK (nivel_escalamiento < 3 OR length(trim(proveedor_externo)) > 0);
  END IF;
END $$;

-- Tipos de equipo del inventario de la Sede Central (los anteriores se conservan)
INSERT INTO tipos_equipo (nombre) VALUES
  ('Access point'), ('Computadora de escritorio'), ('Impresora'), ('Laptop'), ('Monitor'), ('Pizarra digital'),
  ('Proyector'), ('Switch de red'), ('Tablet'), ('UPS'), ('Televisor'), ('Equipo de sonido'), ('Otro')
ON CONFLICT (nombre) DO NOTHING;

-- Número de ticket con el año (TCK-2026-00001)
ALTER TABLE incidencias ALTER COLUMN numero
  SET DEFAULT 'TCK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('incidencias_numero_seq')::text, 5, '0');

-- Semana 10: datos operativos del inventario real de la Sede Central (Excel "INVENTARIO 2026")
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS caracteristicas TEXT;
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS mac VARCHAR(40);
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS propiedad VARCHAR(10);
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS responsable VARCHAR(120);
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS guia_factura VARCHAR(60);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipos_propiedad_check') THEN
    ALTER TABLE equipos ADD CONSTRAINT equipos_propiedad_check CHECK (propiedad IN ('PROPIO', 'ALQUILADO'));
  END IF;
END $$;
INSERT INTO tipos_equipo (nombre) VALUES ('All in One'), ('Servidor') ON CONFLICT (nombre) DO NOTHING;
-- "Obsoleto" en el Excel: sigue en uso, por eso cuenta como disponible para la DT
INSERT INTO estados_equipo (codigo, nombre, operativo) VALUES ('OBSOLETO', 'Obsoleto', TRUE) ON CONFLICT (codigo) DO NOTHING;
-- Último ingreso de cada usuario y con qué método (contraseña o Google), visible en la tabla de usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_metodo VARCHAR(10);
