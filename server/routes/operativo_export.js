// server/routes/operativo_export.js
import express from "express";
import ExcelJS from "exceljs";

/**
 * Rutas de exportación (Planeación Operativa → Excel)
 * @param {import('pg').Pool} pool
 */
export default function buildOperativoExport(pool) {
  const router = express.Router();

// GET /planeacion/export?well=<ID>&stage=&alerta=
router.get("/planeacion/export", async (req, res) => {
  const { well = "", stage = "", alerta = "" } = req.query || {};

  try {
    // 1) Validar pozo requerido
    const wellId = Number(well);
    if (!Number.isInteger(wellId) || wellId <= 0) {
      return res.status(400).json({ ok: false, error: "Selecciona un pozo válido para exportar." });
    }

    // 2) Leer pozo
    const wellsSql = `
      SELECT w.id, w.name, w.type, w.team, w.start_date, w.stages_count, w.current_progress
        FROM public.wells w
       WHERE w.id = $1
       LIMIT 1
    `;
    const rWells = await pool.query(wellsSql, [wellId]);
    const wells = rWells.rows;
    if (!wells.length) {
      return res.status(404).json({ ok: false, error: "Pozo no encontrado." });
    }

    // 3) Etapas del pozo (si llega stage, limitar)
    const stagesWhere = [`s.well_id = $1`];
    const stagesParams = [wellId];
    if (stage) {
      stagesWhere.push(`s.id = $2`);
      stagesParams.push(Number(stage));
    }
    const stagesSql = `
      SELECT s.id, s.well_id, s.stage_name, s.pipe, s.drill_time, s.stage_change,
             s.progress, s.order_index
        FROM public.well_stages s
       WHERE ${stagesWhere.join(" AND ")}
    ORDER BY s.order_index ASC, s.id ASC
    `;
    const stages = (await pool.query(stagesSql, stagesParams)).rows;

    // 4) Materiales del pozo (y opcionalmente etapa/alerta)
    const matsWhere = [`s.well_id = $1`];
    const matsParams = [wellId];

    if (stage) {
      matsWhere.push(`s.id = $${matsParams.length + 1}`);
      matsParams.push(Number(stage));
    }

    if (alerta && ["azul", "verde", "amarillo", "rojo"].includes(String(alerta).toLowerCase())) {
      matsWhere.push(`m.alerta = $${matsParams.length + 1}::public.alert_type`);
      matsParams.push(String(alerta).toLowerCase());
      // Si 'alerta' NO es enum, usa: matsWhere.push(`m.alerta = $${matsParams.length + 1}`);
    }

    const matsSql = `
      SELECT
        m.id, m.well_id, m.stage_id,
        COALESCE(m.material_name, m.categoria) AS material,
        m.programa, m.categoria, m.especificacion,
        m.cantidad, m.unidad, m.proveedor, m.orden_servicio,
        m.fecha_avanzada, m.link_avanzada,
        m.fecha_inspeccion, m.link_inspeccion,
        m.logistica, m.alerta, m.comentario
      FROM public.materials m
      JOIN public.well_stages s ON s.id = m.stage_id
     WHERE ${matsWhere.join(" AND ")}
  ORDER BY m.stage_id ASC, m.id ASC
    `;
    const materials = (await pool.query(matsSql, matsParams)).rows;

    // 5) Mapas y Excel (igual que ya tenías)
    const wellsById = new Map(wells.map(w => [w.id, w]));
    const stagesById = new Map(stages.map(s => [s.id, s]));

    const wb = new ExcelJS.Workbook();
    wb.creator = "SIGMA";
    wb.created = new Date();

    const shWells = wb.addWorksheet("Pozos");
    shWells.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "Pozo", key: "name", width: 24 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Equipo", key: "team", width: 18 },
      { header: "Inicio", key: "start_date", width: 14 },
      { header: "Etapas", key: "stages_count", width: 10 },
      { header: "Avance", key: "current_progress", width: 16 },
    ];
    wells.forEach(w => {
      shWells.addRow({
        id: w.id,
        name: w.name,
        type: w.type,
        team: w.team,
        start_date: w.start_date ? new Date(w.start_date) : null,
        stages_count: w.stages_count,
        current_progress: w.current_progress ?? "",
      });
    });
    shWells.getRow(1).font = { bold: true };
    shWells.autoFilter = { from: "A1", to: "G1" };

    const shStages = wb.addWorksheet("Etapas");
    shStages.columns = [
      { header: "Pozo ID", key: "well_id", width: 9 },
      { header: "Pozo", key: "well_name", width: 24 },
      { header: "Etapa ID", key: "id", width: 10 },
      { header: "Nombre etapa", key: "stage_name", width: 24 },
      { header: "Orden", key: "order_index", width: 8 },
      { header: "Pipe", key: "pipe", width: 14 },
      { header: "Drill Time", key: "drill_time", width: 12 },
      { header: "Stage Change", key: "stage_change", width: 12 },
      { header: "Progreso", key: "progress", width: 14 },
    ];
    stages.forEach(s => {
      const w = wellsById.get(s.well_id);
      shStages.addRow({
        well_id: s.well_id,
        well_name: w?.name || "",
        id: s.id,
        stage_name: s.stage_name || "",
        order_index: s.order_index,
        pipe: s.pipe || "",
        drill_time: s.drill_time ?? "",
        stage_change: s.stage_change ?? "",
        progress: s.progress || "",
      });
    });
    shStages.getRow(1).font = { bold: true };
    shStages.autoFilter = { from: "A1", to: "I1" };

    const shMat = wb.addWorksheet("Materiales");
    shMat.columns = [
      { header: "Material ID", key: "id", width: 12 },
      { header: "Etapa", key: "stage_name", width: 24 },
      { header: "Material", key: "material", width: 28 },
      { header: "Programa", key: "programa", width: 12 },
      { header: "Categoría", key: "categoria", width: 16 },
      { header: "Especificación", key: "especificacion", width: 22 },
      { header: "Cantidad", key: "cantidad", width: 10 },
      { header: "Unidad", key: "unidad", width: 10 },
      { header: "Proveedor", key: "proveedor", width: 18 },
      { header: "O/S", key: "orden_servicio", width: 14 },
      { header: "F. Avanzada", key: "fecha_avanzada", width: 14 },
      { header: "Link Avanzada", key: "link_avanzada", width: 22 },
      { header: "F. Inspección", key: "fecha_inspeccion", width: 14 },
      { header: "Link Inspección", key: "link_inspeccion", width: 22 },
      { header: "Logística", key: "logistica", width: 16 },
      { header: "Alerta", key: "alerta", width: 12 },
      { header: "Comentario", key: "comentario", width: 28 },
    ];
    materials.forEach(m => {
      const s = stagesById.get(m.stage_id);
      shMat.addRow({
        id: m.id,
        stage_name: s?.stage_name || (s ? `Etapa #${s.order_index}` : ""),
        material: m.material || "",
        programa: m.programa || "",
        categoria: m.categoria || "",
        especificacion: m.especificacion || "",
        cantidad: m.cantidad ?? null,
        unidad: m.unidad || "",
        proveedor: m.proveedor || "",
        orden_servicio: m.orden_servicio || "",
        fecha_avanzada: m.fecha_avanzada ? new Date(m.fecha_avanzada) : null,
        link_avanzada: m.link_avanzada || "",
        fecha_inspeccion: m.fecha_inspeccion ? new Date(m.fecha_inspeccion) : null,
        link_inspeccion: m.link_inspeccion || "",
        logistica: m.logistica || "",
        alerta: m.alerta || "",
        comentario: m.comentario || "",
      });
    });
    shMat.getRow(1).font = { bold: true };
    shMat.autoFilter = { from: "A1", to: "Q1" };

    const buf = await wb.xlsx.writeBuffer();
    const fname = `planeacion_operativa_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error("export excel error:", e);
    res.status(500).json({ ok: false, error: e.message || "No se pudo exportar" });
  }
});

  return router;
}
