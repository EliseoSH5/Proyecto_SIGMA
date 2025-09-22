// server/routes/operativo.js
import express from "express";
const router = express.Router();

/**
 * Router del módulo Operativo (public.*, filtros y orden estable por 'position')
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
              ORDER BY position ASC, id ASC
                 LIMIT 1) AS first_stage,
               w.current_progress
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
        "SELECT * FROM public.well_stages WHERE well_id = $1 ORDER BY position ASC, id ASC",
        [id]
      );
      w.stages = st.rows;
      res.json({ ok: true, data: w });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /wells  (crea pozo + etapas con position)
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

      // Insertar etapas asignando position (1..N en el orden enviado)
      let pos = 1;
      for (const s of c.stages || []) {
        await client.query(
          `INSERT INTO public.well_stages
             (well_id, stage_name, pipe, drill_time, stage_change, progress, position)
           VALUES
             ($1, $2, $3, $4, $5, $6,
              COALESCE($7, $8))`,
          [
            wellId,
            s.stage_name || null,
            s.pipe || null,
            s.drill_time ?? null,
            s.stage_change ?? null,
            s.progress || "En proceso",
            s.position ?? null,
            pos,
          ]
        );
        pos += 1;
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
        const hasId = Number.isInteger(s.id);
        if (hasId) {
          // UPDATE etapa existente (incluye position si viene)
          await client.query(
            `UPDATE public.well_stages
                SET stage_name  = $1,
                    pipe        = $2,
                    drill_time  = $3,
                    stage_change= $4,
                    progress    = COALESCE($5, progress),
                    position    = COALESCE($6, position)
              WHERE id = $7 AND well_id = $8`,
            [
              s.stage_name || null,
              s.pipe || null,
              s.drill_time ?? null,
              s.stage_change ?? null,
              s.progress ?? null,
              s.position ?? null,
              s.id,
              id,
            ]
          );
        } else {
          // INSERT nueva etapa; si no mandan position, usar MAX(position)+1
          await client.query(
            `INSERT INTO public.well_stages
               (well_id, stage_name, pipe, drill_time, stage_change, progress, position)
             VALUES
               ($1, $2, $3, $4, $5, $6,
                COALESCE($7, (SELECT COALESCE(MAX(position),0)+1 FROM public.well_stages WHERE well_id=$1)))`,
            [
              id,
              s.stage_name || null,
              s.pipe || null,
              s.drill_time ?? null,
              s.stage_change ?? null,
              s.progress || "En proceso",
              s.position ?? null,
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

  // GET /wells/:id/stages  (ordenadas por position)
  router.get("/wells/:id/stages", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await pool.query(
        `SELECT * FROM public.well_stages
        WHERE well_id = $1
     ORDER BY position ASC, id ASC`,
        [id]
      );
      res.json({ ok: true, data: r.rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PUT /stages/:id  (edición rápida de datos de etapa, puede incluir position)
  router.put("/stages/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { stage_name, pipe, progress, position } = req.body || {};
      await pool.query(
        `UPDATE public.well_stages
            SET stage_name = COALESCE($1, stage_name),
                pipe       = COALESCE($2, pipe),
                progress   = COALESCE($3, progress),
                position   = COALESCE($4, position)
          WHERE id = $5`,
        [stage_name, pipe, progress, position, id]
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

  // POST /wells/:id/stages/reorder  (guardar orden por lista de IDs)
  router.post("/wells/:id/stages/reorder", async (req, res) => {
    const wellId = Number(req.params.id);
    const { order } = req.body || {};
    if (!Array.isArray(order) || !order.length) {
      return res.status(400).json({ ok: false, error: "order requerido" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < order.length; i++) {
        const stageId = Number(order[i]);
        await client.query(
          "UPDATE public.well_stages SET position = $1 WHERE id = $2 AND well_id = $3",
          [i + 1, stageId, wellId]
        );
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
          `(categoria ILIKE $${params.length} OR especificacion ILIKE $${params.length} OR proveedor ILIKE $${params.length})`
        );
      }
      if (
        programa &&
        (programa === "Programa" || programa === "Contingencia")
      ) {
        params.push(programa);
        where.push(`programa = $${params.length}`);
      }
      if (alerta && ["azul", "verde", "amarillo", "rojo"].includes(alerta)) {
        params.push(alerta);
        where.push(`alerta = $${params.length}`);
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
      const ins = await pool.query(
        `INSERT INTO public.materials (
            stage_id, programa, categoria, especificacion, cantidad, unidad, proveedor, orden_servicio,
            fecha_avanzada, link_avanzada, fecha_inspeccion, link_inspeccion, logistica, alerta, comentario,
            etapa, tuberia, compania
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
         ) RETURNING id`,
        [
          stage_id,
          c.programa,
          c.categoria,
          c.especificacion,
          c.cantidad,
          c.unidad,
          c.proveedor,
          c.orden_servicio,
          c.fecha_avanzada,
          c.link_avanzada,
          c.fecha_inspeccion,
          c.link_inspeccion,
          c.logistica,
          c.alerta,
          c.comentario,
          c.etapa || null,
          c.tuberia || null,
          c.compania || null,
        ]
      );
      res.json({ ok: true, id: ins.rows[0].id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PUT /materials/:id  (actualizar)
  router.put("/materials/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const c = req.body || {};
      await pool.query(
        `UPDATE public.materials SET
           programa = $1,
           categoria = $2,
           especificacion = $3,
           cantidad = $4,
           unidad = $5,
           proveedor = $6,
           orden_servicio = $7,
           fecha_avanzada = $8,
           link_avanzada = $9,
           fecha_inspeccion = $10,
           link_inspeccion = $11,
           logistica = $12,
           alerta = $13,
           comentario = $14,
           etapa = $15,
           tuberia = $16,
           compania = $17
         WHERE id = $18`,
        [
          c.programa,
          c.categoria,
          c.especificacion,
          c.cantidad,
          c.unidad,
          c.proveedor,
          c.orden_servicio,
          c.fecha_avanzada,
          c.link_avanzada,
          c.fecha_inspeccion,
          c.link_inspeccion,
          c.logistica,
          c.alerta,
          c.comentario,
          c.etapa || null,
          c.tuberia || null,
          c.compania || null,
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

  // GET /alerts  -> lista de materiales con alerta 'amarillo' o 'rojo', filtros opcionales
  router.get("/alerts", async (req, res) => {
    try {
      const { well = "", alerta = "" } = req.query;

      // Si 'alerta' es ENUM en tu DB (public.alert_type), deja estos casts.
      // Si es TEXT/VARCHAR, quita ::public.alert_type en los WHERE.
      const where = [
        `(m.alerta = 'amarillo'::public.alert_type OR m.alerta = 'rojo'::public.alert_type)`,
      ];
      const params = [];

      if (well) {
        params.push(Number(well));
        where.push(`w.id = $${params.length}`);
      }
      if (alerta && ["amarillo", "rojo"].includes(alerta)) {
        params.push(alerta);
        where.push(`m.alerta = $${params.length}::public.alert_type`);
      }

      const sql = `
      SELECT 
        m.id            AS material_id,
        w.id            AS well_id,
        w.name          AS well_name,
        m.categoria     AS material,
        m.alerta,
        m.comentario
      FROM public.materials m
      JOIN public.well_stages s ON s.id = m.stage_id
      JOIN public.wells w       ON w.id = s.well_id
      WHERE ${where.join(" AND ")}
      ORDER BY CASE m.alerta WHEN 'rojo'::public.alert_type THEN 0 ELSE 1 END,
               w.name ASC, m.id ASC
    `;
      const r = await pool.query(sql, params);

      const rw = await pool.query(`
      SELECT DISTINCT w.id, w.name
      FROM public.materials m
      JOIN public.well_stages s ON s.id = m.stage_id
      JOIN public.wells w       ON w.id = s.well_id
      WHERE m.alerta IN ('amarillo'::public.alert_type,'rojo'::public.alert_type)
      ORDER BY w.name ASC
    `);

      res.json({ ok: true, data: r.rows, wells: rw.rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
}
