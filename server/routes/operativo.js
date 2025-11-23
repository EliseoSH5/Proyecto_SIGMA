// server/routes/operativo.js
import express from "express";
const router = express.Router();


// ---- helper: castear seguro a entero (o null)
function toInt(v, fallback = null) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ---- helper: validar arreglo de enteros ÚNICOS
function intsUnique(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (const v of arr) {
    if (!Number.isInteger(Number(v))) return false;
  }
  return new Set(arr.map(Number)).size === arr.length;
}

/**
 * Router del módulo Operativo (usa 'order_index' para ordenar etapas)
 * @param {import('pg').Pool} pool
 */
export default function buildOperativoRoutes(pool) {
  // =========================
  //        WELLS (Pozos)
  // =========================

  // GET /wells  (lista con filtros y orden)
  router.get("/wells", async (req, res) => {
    try {
      const { search = "", type = "", sort = "id", order = "desc" } = req.query;

      const sortMap = {
        id: "w.id",
        team: "w.team",
        name: "w.name",
        start_date: "w.start_date",
        stages_count: "w.stages_count",
      };
      const sortCol = sortMap[sort] || sortMap.id;
      const ord = (order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

      const where = [];
      const params = [];

      if (search) {
        params.push(`%${search}%`);
        where.push(
          `(w.team ILIKE $${params.length} OR w.name ILIKE $${params.length})`
        );
      }
      if (type && (type === "terrestre" || type === "marino")) {
        params.push(type);
        where.push(`w.type = $${params.length}`);
      }

      const sql = `
        SELECT w.id, w.type, w.team, w.name, w.start_date, w.stages_count,
               (SELECT stage_name
                  FROM public.well_stages
                 WHERE well_id = w.id
              ORDER BY order_index ASC, id ASC
                 LIMIT 1) AS first_stage,
               CASE
                 -- Hay alguna etapa pendiente o sin marcar -> mostrar primera "En proceso"
                 WHEN EXISTS (
                   SELECT 1
                     FROM public.well_stages s
                    WHERE s.well_id = w.id
                      AND (s.progress IS NULL OR LOWER(s.progress) LIKE 'en proceso%')
                 ) THEN (
                   SELECT 'Etapa ' || COALESCE(s.stage_name, '') || ' - en proceso'
                     FROM public.well_stages s
                    WHERE s.well_id = w.id
                      AND (s.progress IS NULL OR LOWER(s.progress) LIKE 'en proceso%')
                 ORDER BY s.order_index ASC, s.id ASC
                    LIMIT 1
                 )
                 -- Todas las etapas tienen progress ~ 'Completado'
                 WHEN EXISTS (
                   SELECT 1
                     FROM public.well_stages s
                    WHERE s.well_id = w.id
                 ) AND NOT EXISTS (
                   SELECT 1
                     FROM public.well_stages s
                    WHERE s.well_id = w.id
                      AND (s.progress IS NULL OR LOWER(s.progress) NOT LIKE 'completado%')
                 ) THEN 'Pozo completado'
                 ELSE NULL
               END AS current_progress
          FROM public.wells w
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY ${sortCol} ${ord}, w.id DESC
      `;

      const r = await pool.query(sql, params);
      res.json({ ok: true, data: r.rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /wells/:id  (detalle + etapas)
  router.get("/wells/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const wq = await pool.query("SELECT * FROM public.wells WHERE id = $1", [
        id,
      ]);
      if (!wq.rows.length)
        return res.status(404).json({ ok: false, error: "No encontrado" });
      const w = wq.rows[0];
      const st = await pool.query(
        "SELECT * FROM public.well_stages WHERE well_id = $1 ORDER BY order_index ASC, id ASC",
        [id]
      );
      w.stages = st.rows.map((row) => ({ ...row, position: row.order_index })); // compat
      res.json({ ok: true, data: w });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /wells  (crea pozo + etapas con order_index)
  router.post("/wells", async (req, res) => {
    const c = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const ins = await client.query(
        `INSERT INTO public.wells (type, team, name, start_date, stages_count, current_progress)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [c.type, c.team, c.name, c.start_date, c.stages_count, null]
      );
      const wellId = ins.rows[0].id;

      // Insertar etapas asignando order_index (1..N en el orden enviado)
      let idx = 1;
      for (const s of c.stages || []) {
        const desiredOrder = toInt(s.position ?? s.order_index, null); // string->int
        await client.query(
          `INSERT INTO public.well_stages
             (well_id, stage_name, pipe, drill_time, stage_change, progress, order_index)
           VALUES
             ($1, $2, $3, $4, $5, $6, COALESCE($7::int, $8::int))`,
          [
            wellId,
            s.stage_name || null,
            s.pipe || null,
            s.drill_time ?? null,
            s.stage_change ?? null,
            s.progress || "En proceso",
            desiredOrder, // INT o NULL
            idx,          // fallback incremental
          ]
        );
        idx += 1;
      }

      await client.query("COMMIT");
      res.json({ ok: true, id: wellId });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      client.release();
    }
  });

  // PUT /wells/:id  (actualiza pozo y upsert de etapas SIN borrar existentes)
  router.put("/wells/:id", async (req, res) => {
    const id = Number(req.params.id);
    const c = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Actualiza los datos del pozo
      await client.query(
        `UPDATE public.wells
            SET type = $1,
                team = $2,
                name = $3,
                start_date = $4,
                stages_count = $5
          WHERE id = $6`,
        [c.type, c.team, c.name, c.start_date, c.stages_count, id]
      );

      // Upsert de etapas
      for (const s of c.stages || []) {
        const desiredOrder = toInt(s.position ?? s.order_index, null);
        const hasId = Number.isInteger(s.id);
        if (hasId) {
          // UPDATE etapa existente
          await client.query(
            `UPDATE public.well_stages
                SET stage_name  = $1,
                    pipe        = $2,
                    drill_time  = $3,
                    stage_change= $4,
                    progress    = COALESCE($5, progress),
                    order_index = COALESCE($6::int, order_index)
              WHERE id = $7 AND well_id = $8`,
            [
              s.stage_name || null,
              s.pipe || null,
              s.drill_time ?? null,
              s.stage_change ?? null,
              s.progress ?? null,
              desiredOrder, // INT o NULL
              s.id,
              id,
            ]
          );
        } else {
          // INSERT nueva etapa; si no mandan order_index, usar MAX(order_index)+1
          await client.query(
            `INSERT INTO public.well_stages
               (well_id, stage_name, pipe, drill_time, stage_change, progress, order_index)
             VALUES
               ($1, $2, $3, $4, $5, $6,
                COALESCE($7::int, (SELECT COALESCE(MAX(order_index),0)+1 FROM public.well_stages WHERE well_id=$1)))`,
            [
              id,
              s.stage_name || null,
              s.pipe || null,
              s.drill_time ?? null,
              s.stage_change ?? null,
              s.progress || "En proceso",
              desiredOrder, // INT o NULL
            ]
          );
        }
      }

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      client.release();
    }
  });

  // DELETE /wells/:id  (borra pozo y cascada manual en materials)
  router.delete("/wells/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await pool.query(
        "DELETE FROM public.materials USING public.well_stages WHERE public.materials.stage_id = public.well_stages.id AND public.well_stages.well_id = $1",
        [id]
      );
      await pool.query("DELETE FROM public.well_stages WHERE well_id = $1", [
        id,
      ]);
      await pool.query("DELETE FROM public.wells WHERE id = $1", [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // =========================
  //          STAGES
  // =========================

  // GET /wells/:id/stages  (ordenadas por order_index)
  router.get("/wells/:id/stages", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await pool.query(
        `SELECT * FROM public.well_stages
          WHERE well_id = $1
       ORDER BY order_index ASC, id ASC`,
        [id]
      );
      // Compatibilidad para UIs que aún leen 'position'
      const data = r.rows.map((row) => ({
        ...row,
        position: row.order_index,
      }));
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PUT /stages/:id  (edición de etapa SIN cambiar order_index aquí)
  router.put("/stages/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { stage_name, pipe, progress } = req.body || {};
      await pool.query(
        `UPDATE public.well_stages
            SET stage_name = COALESCE($1, stage_name),
                pipe       = COALESCE($2, pipe),
                progress   = COALESCE($3, progress)
          WHERE id = $4`,
        [stage_name, pipe, progress, id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // DELETE /stages/:id
  router.delete("/stages/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await pool.query("DELETE FROM public.materials WHERE stage_id = $1", [
        id,
      ]);
      await pool.query("DELETE FROM public.well_stages WHERE id = $1", [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /wells/:id/stages/reorder  (transacción + UNIQUE DEFERRABLE, usando UNNEST tipado)
  router.post("/wells/:id/stages/reorder", async (req, res) => {
    const wellId = Number(req.params.id);
    const { order } = req.body || {};

    if (!Number.isInteger(wellId)) {
      return res.status(400).json({ ok: false, error: "wellId inválido" });
    }
    if (!intsUnique(order)) {
      return res.status(400).json({ ok: false, error: "order debe ser arreglo de enteros únicos" });
    }

    const ids = order.map(n => Number(n)); // asegurar enteros

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Diferir la UNIQUE (requiere restricción DEFERRABLE)
      await client.query("SET CONSTRAINTS uq_stage_order_per_well DEFERRED");

      // Bloquear filas del pozo
      await client.query(
        `SELECT id FROM public.well_stages WHERE well_id = $1 FOR UPDATE`,
        [wellId]
      );

      // Usar UNNEST con WITH ORDINALITY para mapear [id] -> índice 1..N
      const upd = await client.query(
        `
      UPDATE public.well_stages AS ws
         SET order_index = v.new_index
        FROM (
          SELECT t.id::int, t.ord::int AS new_index
          FROM unnest($2::int[]) WITH ORDINALITY AS t(id, ord)
        ) AS v
       WHERE ws.id = v.id
         AND ws.well_id = $1
      `,
        [wellId, ids]
      );

      if (upd.rowCount !== ids.length) {
        throw new Error("Algunos IDs no pertenecen al pozo o no existen");
      }

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("reorder error:", e);
      return res.status(500).json({ ok: false, error: e.message || "No se pudo reordenar" });
    } finally {
      client.release();
    }
  });

  // =========================
  //        MATERIALS
  // =========================

  // GET /stages/:id/materials  (lista con filtros)
  router.get("/stages/:id/materials", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { q = "", programa = "", alerta = "" } = req.query;

      const where = ["stage_id = $1"];
      const params = [id];

      if (q) {
        params.push(`%${q}%`);
        where.push(
          `(material_name ILIKE $${params.length} OR categoria ILIKE $${params.length} OR especificacion ILIKE $${params.length} OR proveedor ILIKE $${params.length})`
        );
      }

      if (programa) {
        const p = String(programa).toLowerCase();
        if (p === "programa" || p === "contingencia") {
          params.push(p);
          // enum en DB: program_type (ajusta si tu enum se llama distinto o quita el cast si es TEXT)
          where.push(`programa = $${params.length}::public.program_type`);
        }
      }

      if (alerta) {
        const a = String(alerta).toLowerCase();
        if (["azul", "verde", "amarillo", "rojo"].includes(a)) {
          params.push(a);
          // enum en DB: alert_type (ajusta si tu enum se llama distinto o quita el cast si es TEXT)
          where.push(`alerta = $${params.length}::public.alert_type`);
        }
      }

      const sql = `
        SELECT * FROM public.materials
         WHERE ${where.join(" AND ")}
      ORDER BY id ASC
      `;
      const r = await pool.query(sql, params);
      res.json({ ok: true, data: r.rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /materials/:id  (detalle)
  router.get("/materials/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await pool.query(
        "SELECT * FROM public.materials WHERE id = $1",
        [id]
      );
      if (!r.rows.length)
        return res.status(404).json({ ok: false, error: "No encontrado" });
      res.json({ ok: true, data: r.rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /stages/:id/materials  (crear)
  router.post("/stages/:id/materials", async (req, res) => {
    try {
      const stage_id = Number(req.params.id);
      const c = req.body || {};

      // obtener well_id de la etapa
      const ws = await pool.query(
        "SELECT well_id FROM public.well_stages WHERE id = $1",
        [stage_id]
      );
      if (!ws.rows.length)
        return res.status(400).json({ ok: false, error: "Etapa inválida" });
      const well_id = ws.rows[0].well_id;

      const ins = await pool.query(
        `INSERT INTO public.materials (
            well_id, stage_id, material_name, programa, categoria, especificacion,
            cantidad, unidad, proveedor, orden_servicio,
            fecha_avanzada, link_avanzada, fecha_inspeccion, link_inspeccion,
            logistica, alerta, comentario
         ) VALUES (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,$10,
            $11,$12,$13,$14,
            $15,$16,$17
         ) RETURNING id`,
        [
          well_id,
          stage_id,
          c.material_name || null,
          (c.programa || "").toLowerCase() || null, // 'programa'|'contingencia'
          c.categoria || null,
          c.especificacion || null,
          c.cantidad ?? null,
          c.unidad || null,
          c.proveedor || null,
          c.orden_servicio || null,
          c.fecha_avanzada || null,
          c.link_avanzada || null,
          c.fecha_inspeccion || null,
          c.link_inspeccion || null,
          c.logistica || null,
          (c.alerta || "").toLowerCase() || null,  // 'azul'|'verde'|'amarillo'|'rojo'
          c.comentario || null,
        ]
      );
      res.json({ ok: true, id: ins.rows[0].id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PUT /materials/:id  (actualizar sin borrar campos si vienen vacíos y tipando parámetros)
  router.put("/materials/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const c = req.body || {};

      await pool.query(
        `
      UPDATE public.materials SET
        material_name    = COALESCE(NULLIF($1::text, ''), material_name),
        /* Si programa/alerta son ENUM en tu DB, deja los casts al enum.
           Si son TEXT, quita ::public.program_type / ::public.alert_type. */
        programa         = COALESCE(NULLIF($2::text, '')::public.program_type, programa),
        categoria        = COALESCE(NULLIF($3::text, ''), categoria),
        especificacion   = COALESCE(NULLIF($4::text, ''), especificacion),
        cantidad         = COALESCE($5::numeric, cantidad),
        unidad           = COALESCE(NULLIF($6::text, ''), unidad),
        proveedor        = COALESCE(NULLIF($7::text, ''), proveedor),
        orden_servicio   = COALESCE(NULLIF($8::text, ''), orden_servicio),
        fecha_avanzada   = COALESCE($9::date, fecha_avanzada),
        link_avanzada    = COALESCE(NULLIF($10::text, ''), link_avanzada),
        fecha_inspeccion = COALESCE($11::date, fecha_inspeccion),
        link_inspeccion  = COALESCE(NULLIF($12::text, ''), link_inspeccion),
        logistica        = COALESCE(NULLIF($13::text, ''), logistica),
        alerta           = COALESCE(NULLIF($14::text, '')::public.alert_type, alerta),
        comentario       = COALESCE(NULLIF($15::text, ''), comentario)
      WHERE id = $16
      `,
        [
          c.material_name ?? null,
          (c.programa ?? null) && String(c.programa).toLowerCase(),
          c.categoria ?? null,
          c.especificacion ?? null,
          c.cantidad ?? null,
          c.unidad ?? null,
          c.proveedor ?? null,
          c.orden_servicio ?? null,
          c.fecha_avanzada ?? null,
          c.link_avanzada ?? null,
          c.fecha_inspeccion ?? null,
          c.link_inspeccion ?? null,
          c.logistica ?? null,
          (c.alerta ?? null) && String(c.alerta).toLowerCase(),
          c.comentario ?? null,
          id,
        ]
      );

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });



  // DELETE /materials/:id
  router.delete("/materials/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await pool.query("DELETE FROM public.materials WHERE id = $1", [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // =========================
  //          ALERTAS
  // =========================

  // GET /alerts -> lista de materiales con cualquier alerta (azul/verde/amarillo/rojo)
  // Filtros opcionales: ?well=ID&stage=ID&alerta=azul|verde|amarillo|rojo
  router.get("/alerts", async (req, res) => {
    try {
      const { well = "", stage = "", alerta = "" } = req.query;

      const where = ["1=1"];
      const params = [];

      // Filtros opcionales
      if (well) {
        params.push(Number(well));
        where.push(`w.id = $${params.length}`);
      }
      if (stage) {
        params.push(Number(stage));
        where.push(`s.id = $${params.length}`);
      }
      if (alerta && ["azul", "verde", "amarillo", "rojo"].includes(String(alerta).toLowerCase())) {
        params.push(String(alerta).toLowerCase());
        where.push(`m.alerta = $${params.length}::public.alert_type`);
      }

      // Orden por severidad (rojo > amarillo > verde > azul), luego pozo/etapa
      const sql = `
      SELECT 
        m.id                                   AS material_id,
        w.id                                   AS well_id,
        w.name                                 AS well_name,
        s.id                                   AS stage_id,
        COALESCE(s.stage_name, CONCAT('Etapa #', s.order_index)) AS stage_name,
        COALESCE(m.material_name, m.categoria) AS material,
        m.alerta,
        m.comentario
      FROM public.materials m
      JOIN public.well_stages s ON s.id = m.stage_id
      JOIN public.wells w       ON w.id = s.well_id
      WHERE ${where.join(" AND ")}
      ORDER BY CASE m.alerta
                 WHEN 'rojo'::public.alert_type      THEN 0
                 WHEN 'amarillo'::public.alert_type  THEN 1
                 WHEN 'verde'::public.alert_type     THEN 2
                 ELSE 3
               END,
               w.name ASC,
               s.order_index ASC,
               m.id ASC
    `;
      const r = await pool.query(sql, params);

      // Para dropdowns en el cliente
      const wells = await pool.query(`
      SELECT w.id, w.name
      FROM public.wells w
      ORDER BY w.name ASC
    `);

      res.json({
        ok: true,
        data: r.rows,
        wells: wells.rows,
        // hint para UI (rutas de edición existentes)
        edit: { api: "/api/operativo/materials/:id", method: "PUT" }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
}
