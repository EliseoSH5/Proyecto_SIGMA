-- operativo_schema.sql — Esquema completo módulo Operativo (versión alineada a sigma_db)

-- =========================================================
-- 1. Extensiones necesarias
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- =========================================================
-- 2. Tipos ENUM (crear solo si no existen)
-- =========================================================

-- Tipo de alerta para materiales
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_type') THEN
    CREATE TYPE public.alert_type AS ENUM ('azul','verde','amarillo','rojo');
  END IF;
END$$;

-- Tipo de programa (programa / contingencia)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'program_type') THEN
    CREATE TYPE public.program_type AS ENUM ('programa','contingencia');
  END IF;
END$$;

-- Rol de usuario (admin / editor / viewer)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('admin','editor','viewer');
  END IF;
END$$;

-- Tipo de pozo (terrestre / marino)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'well_type') THEN
    CREATE TYPE public.well_type AS ENUM ('terrestre','marino');
  END IF;
END$$;

-- =========================================================
-- 3. Tablas base
-- =========================================================

-- 3.1. Pozos
CREATE TABLE IF NOT EXISTS public.wells (
  id              SERIAL PRIMARY KEY,
  type            public.well_type NOT NULL,
  team            TEXT,
  name            TEXT NOT NULL,
  start_date      DATE,
  stages_count    INTEGER NOT NULL DEFAULT 1,
  current_progress TEXT,
  created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- 3.2. Etapas por pozo
CREATE TABLE IF NOT EXISTS public.well_stages (
  id           SERIAL PRIMARY KEY,
  well_id      INTEGER NOT NULL,
  stage_name   TEXT,
  pipe         TEXT,
  drill_time   NUMERIC,
  stage_change NUMERIC,
  progress     TEXT,
  order_index  INTEGER NOT NULL,
  CONSTRAINT well_stages_well_id_fkey
    FOREIGN KEY (well_id)
    REFERENCES public.wells(id)
    ON DELETE CASCADE,
  CONSTRAINT uq_stage_order_per_well
    UNIQUE (well_id, order_index) DEFERRABLE
);

-- 3.3. Materiales por etapa / pozo
CREATE TABLE IF NOT EXISTS public.materials (
  id               SERIAL PRIMARY KEY,
  stage_id         INTEGER NOT NULL,
  programa         public.program_type NOT NULL DEFAULT 'programa',
  categoria        TEXT,
  especificacion   TEXT,
  cantidad         NUMERIC,
  unidad           TEXT,
  proveedor        TEXT,
  orden_servicio   TEXT,
  fecha_avanzada   DATE,
  link_avanzada    TEXT,
  fecha_inspeccion DATE,
  link_inspeccion  TEXT,
  logistica        TEXT,
  alerta           public.alert_type NOT NULL DEFAULT 'azul',
  comentario       TEXT,
  -- Campos para mostrar en listado
  etapa            TEXT,
  tuberia          TEXT,
  compania         TEXT,
  created_at       TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  well_id          BIGINT NOT NULL,
  material_name    TEXT,
  CONSTRAINT materials_stage_id_fkey
    FOREIGN KEY (stage_id)
    REFERENCES public.well_stages(id)
    ON DELETE CASCADE,
  CONSTRAINT materials_well_id_fkey
    FOREIGN KEY (well_id)
    REFERENCES public.wells(id)
    ON DELETE CASCADE
);

-- 3.4. Usuarios del sistema
CREATE TABLE IF NOT EXISTS public.users (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  role          public.user_role NOT NULL DEFAULT 'admin'
);

-- =========================================================
-- 4. Índices para performance (según sigma_db)
-- =========================================================

-- Índices en materials
CREATE INDEX IF NOT EXISTS idx_materials_alert
  ON public.materials (alerta);

CREATE INDEX IF NOT EXISTS idx_materials_name
  ON public.materials (material_name);

CREATE INDEX IF NOT EXISTS idx_materials_stage
  ON public.materials (stage_id);

CREATE INDEX IF NOT EXISTS idx_materials_well
  ON public.materials (well_id);

-- =========================================================
-- 5. (Opcional) Permisos para sigma_user
-- =========================================================
-- Descomenta si usas el rol sigma_user

-- GRANT USAGE, CREATE ON SCHEMA public TO sigma_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sigma_user;
-- GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sigma_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
--   SELECT, INSERT, UPDATE, DELETE ON TABLES TO sigma_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
--   USAGE, SELECT, UPDATE ON SEQUENCES TO sigma_user;
