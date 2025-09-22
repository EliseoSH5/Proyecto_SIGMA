-- operativo_schema.sql — Tablas para módulo Operativo

-- Tipo de pozo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'well_type') THEN
    CREATE TYPE well_type AS ENUM ('terrestre','marino');
  END IF;
END $$;

-- Enum de alerta (materiales)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_type') THEN
    CREATE TYPE alert_type AS ENUM ('azul','verde','amarillo','rojo');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wells (
  id SERIAL PRIMARY KEY,
  type well_type NOT NULL,
  team TEXT,
  name TEXT NOT NULL,
  start_date DATE,
  stages_count INT NOT NULL DEFAULT 1,
  current_progress TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS well_stages (
  id SERIAL PRIMARY KEY,
  well_id INT NOT NULL REFERENCES wells(id) ON DELETE CASCADE,
  stage_name TEXT,
  pipe TEXT,
  drill_time NUMERIC,
  stage_change NUMERIC,
  progress TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  stage_id INT NOT NULL REFERENCES well_stages(id) ON DELETE CASCADE,
  programa TEXT,           -- 'Programa' o 'Contingencia'
  categoria TEXT,
  especificacion TEXT,
  cantidad NUMERIC,
  unidad TEXT,
  proveedor TEXT,
  orden_servicio TEXT,
  fecha_avanzada DATE,
  link_avanzada TEXT,
  fecha_inspeccion DATE,
  link_inspeccion TEXT,
  logistica TEXT,
  alerta alert_type,
  comentario TEXT,
  -- para mostrar en listado
  etapa TEXT,
  tuberia TEXT,
  compania TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Si sigma_user no es dueño del esquema:
-- GRANT USAGE, CREATE ON SCHEMA public TO sigma_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sigma_user;
-- GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sigma_user;
