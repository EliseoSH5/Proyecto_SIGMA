// server/routes/operativo_export.js
import express from "express";
import ExcelJS from "exceljs";

/**
 * Rutas de exportación (Planeación Operativa)
 * @param {import('pg').Pool} pool
 */
export default function buildOperativoExport(pool) {
  const router = express.Router();

  // =========================
  //     EXPORTAR GENERAL
  // GET /planeacion/export?well=&stage=&alerta=
  // =========================
  router.get("/planeacion/export", async (req, res) => {
    try {
      const { well = "", stage = "", alerta = "" } = req.query;

      // Pozos
      const wellWhere = [];
      const wellParams = [];
      if (well) { wellParams.push(Number(well)); wellWhere.push(`w.id = $${wellParams.length}`); }
      const wellsSql = `
        SELECT w.id, w.name, w.type, w.team, w.start_date, w.stages_count, w.current_progress
          FROM public.wells w
         ${wellWhere.length ? `WHERE ${wellWhere.join(" AND ")}` : ""}
      ORDER BY w.name ASC, w.id ASC
      `;
      const wells = (await pool.query(wellsSql, wellParams)).rows;
      const wellIds = wells.map(w => w.id);
      if (!wellIds.length) {
        // Excel vacío válido
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet("Pozos");
        const buf = await wb.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="planeacion_operativa_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        return res.send(Buffer.from(buf));
      }

      // Etapas
      const stagesParams = [wellIds];
      const stagesWhere = [`s.well_id = ANY($1::int[])`];
      if (stage) { stagesParams.push(Number(stage)); stagesWhere.push(`s.id = $2`); }
      const stagesSql = `
        SELECT s.id, s.well_id, s.stage_name, s.pipe, s.drill_time, s.stage_change, s.progress, s.order_index
          FROM public.well_stages s
         WHERE ${stagesWhere.join(" AND ")}
      ORDER BY s.well_id ASC, s.order_index ASC, s.id ASC
      `;
      const stages = (await pool.query(stagesSql, stagesParams)).rows;

      // Materiales
      const mWhere = [`s.well_id = ANY($1::int[])`];
      const mParams = [wellIds];
      if (stage) { mParams.push(Number(stage)); mWhere.push(`s.id = $${mParams.length}`); }
      if (alerta && ["azul", "verde", "amarillo", "rojo"].includes(String(alerta).toLowerCase())) {
        mParams.push(String(alerta).toLowerCase());
        // Si 'alerta' NO es enum, usa: mWhere.push(`m.alerta = $${mParams.length}`);
        mWhere.push(`m.alerta = $${mParams.length}::public.alert_type`);
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
       WHERE ${mWhere.join(" AND ")}
    ORDER BY m.well_id ASC, m.stage_id ASC, m.id ASC
      `;
      const materials = (await pool.query(matsSql, mParams)).rows;

      // Mapas
      const wellsById = new Map(wells.map(w => [w.id, w]));
      const stagesById = new Map(stages.map(s => [s.id, s]));

      // Excel
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
      wells.forEach(w => shWells.addRow({
        id: w.id, name: w.name, type: w.type, team: w.team,
        start_date: w.start_date ? new Date(w.start_date) : null,
        stages_count: w.stages_count, current_progress: w.current_progress ?? ""
      }));
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
          well_id: s.well_id, well_name: w?.name || "", id: s.id,
          stage_name: s.stage_name || "", order_index: s.order_index,
          pipe: s.pipe || "", drill_time: s.drill_time ?? "",
          stage_change: s.stage_change ?? "", progress: s.progress || ""
        });
      });
      shStages.getRow(1).font = { bold: true };
      shStages.autoFilter = { from: "A1", to: "I1" };

      const shMat = wb.addWorksheet("Materiales");
      shMat.columns = [
        { header: "Material ID", key: "id", width: 12 },
        { header: "Pozo", key: "well_name", width: 24 },
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
        const w = wellsById.get(m.well_id);
        const s = stagesById.get(m.stage_id);
        shMat.addRow({
          id: m.id,
          well_name: w?.name || "",
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
      shMat.autoFilter = { from: "A1", to: "R1" };

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

  // =========================
  //  EXPORTAR POR POZO: UNA HOJA POR ETAPA
  // GET /planeacion/export/by-well/:id?alerta=&include_empty=0
  // =========================
  router.get("/planeacion/export/by-well/:id", async (req, res) => {
    const wellId = Number(req.params.id);
    const alerta = String(req.query.alerta || "").toLowerCase();
    const includeEmpty = String(req.query.include_empty || "0") === "1";

    if (!Number.isFinite(wellId)) {
      return res.status(400).json({ ok: false, error: "well inválido" });
    }

    try {
      const rW = await pool.query(
        `SELECT id, name, type, team, start_date, stages_count, current_progress
           FROM public.wells WHERE id=$1`,
        [wellId]
      );
      if (!rW.rows.length) return res.status(404).json({ ok: false, error: "Pozo no encontrado" });
      const well = rW.rows[0];

      const rS = await pool.query(
        `SELECT id, well_id, stage_name, order_index, pipe, drill_time, stage_change, progress
           FROM public.well_stages
          WHERE well_id=$1
       ORDER BY order_index ASC, id ASC`,
        [wellId]
      );
      const stages = rS.rows;

      const where = [`s.well_id = $1`];
      const params = [wellId];
      if (alerta && ["azul", "verde", "amarillo", "rojo"].includes(alerta)) {
        params.push(alerta);
        // Si 'alerta' NO es enum: where.push(`m.alerta = $${params.length}`);
        where.push(`m.alerta = $${params.length}::public.alert_type`);
      }
      const rM = await pool.query(
        `SELECT
           m.id, m.stage_id, COALESCE(m.material_name, m.categoria) AS material,
           m.programa, m.categoria, m.especificacion,
           m.cantidad, m.unidad, m.proveedor, m.orden_servicio,
           m.fecha_avanzada, m.link_avanzada,
           m.fecha_inspeccion, m.link_inspeccion,
           m.logistica, m.alerta, m.comentario
         FROM public.materials m
         JOIN public.well_stages s ON s.id = m.stage_id
        WHERE ${where.join(" AND ")}
     ORDER BY 
        CASE m.alerta 
          WHEN 'rojo'::public.alert_type THEN 0
          WHEN 'amarillo'::public.alert_type THEN 1
          WHEN 'verde'::public.alert_type THEN 2
          ELSE 3
        END,
        m.id ASC`,
        params
      );
      const materials = rM.rows;

      // Agrupar por etapa
      const matsByStage = new Map();
      for (const s of stages) matsByStage.set(s.id, []);
      for (const m of materials) {
        if (!matsByStage.has(m.stage_id)) matsByStage.set(m.stage_id, []);
        matsByStage.get(m.stage_id).push(m);
      }

      // Excel
      const wb = new ExcelJS.Workbook();
      wb.creator = "SIGMA";
      wb.created = new Date();

      // Resumen
      const cover = wb.addWorksheet("Resumen");
      cover.columns = [
        { header: "Campo", key: "k", width: 22 },
        { header: "Valor", key: "v", width: 40 },
      ];
      cover.addRow({ k: "Pozo", v: well.name });
      cover.addRow({ k: "Tipo", v: well.type || "" });
      cover.addRow({ k: "Equipo", v: well.team || "" });
      cover.addRow({ k: "Inicio", v: well.start_date ? new Date(well.start_date) : "" });
      cover.addRow({ k: "Etapas (DB)", v: well.stages_count ?? "" });
      cover.addRow({ k: "Progreso actual", v: well.current_progress ?? "" });
      cover.getRow(1).font = { bold: true };
      cover.autoFilter = { from: "A1", to: "B1" };

      // Colores para estatus
      const ALERT_COLORS = {
        azul: "FF1E3A8A",
        verde: "FF16A34A",
        amarillo: "FFF59E0B",
        rojo: "FFDC2626",
      };
      const statusDot = (a) => {
        const argb = ALERT_COLORS[String(a || "").toLowerCase()] || "FF94A3B8";
        return { richText: [{ text: "⚫", font: { color: { argb } } }] };
      };

      const safeSheetName = (name) =>
        (String(name || "Hoja").replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31)) || "Hoja";

      // Define un borde fino gris para reutilizar
      const BORDER_THIN = {
        top: { style: "thin", color: { argb: "FFD9D9D9" } },
        left: { style: "thin", color: { argb: "FFD9D9D9" } },
        bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
        right: { style: "thin", color: { argb: "FFD9D9D9" } },
      };

      // Define (fuera del for, como ya lo tienes) BORDER_THIN y statusDot

      for (const s of stages) {
        const list = matsByStage.get(s.id) || [];
        if (!includeEmpty && list.length === 0) continue;

        const baseName = s.stage_name || `Etapa #${s.order_index ?? ""}`;
        const ws = wb.addWorksheet(safeSheetName(baseName));

        // --- 1) TÍTULO fusionado A1:J1
        const title = `PERFORACIÓN ETAPA DE ${baseName}"`;
        ws.mergeCells("A1:J1");
        const tCell = ws.getCell("A1");
        tCell.value = title;                             // <-- aquí quedará el nombre correcto
        tCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        tCell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 13 };
        tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245C4F" } };
        for (let col = 1; col <= 10; col++) ws.getRow(1).getCell(col).border = BORDER_THIN;
        ws.getRow(1).height = 24;

        // --- 2) Definir columnas SIN 'header' (para que no se escriba la fila 1)
        ws.columns = [
          { key: "programa", width: 12 },
          { key: "categoria", width: 16 },
          { key: "especificacion", width: 24 },
          { key: "proveedor", width: 18 },
          { key: "orden_servicio", width: 14 },
          { key: "fecha_avanzada", width: 14 },
          { key: "fecha_inspeccion", width: 14 },
          { key: "logistica", width: 18 },
          { key: "estatus", width: 10 }, // ⚫
          { key: "comentario", width: 28 },
        ];

        // --- 3) Escribir manualmente los encabezados en la FILA 2
        const headers = [
          "Programa", "Categoría", "Especificación", "Proveedor", "O/S",
          "F. Avanzada", "F. Inspección", "Logística", "Estatus", "Comentario"
        ];
        // Row.values es 1-indexado -> anteponer un vacío
        ws.getRow(2).values = [, ...headers];

        // Estilo de encabezados fila 2 (fondo #767171, letra blanca, centrado, bordes)
        ws.getRow(2).height = 20;
        ws.getRow(2).eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF767171" } };
          cell.font = { ...(cell.font || {}), color: { argb: "FFFFFFFF" }, bold: true };
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cell.border = BORDER_THIN;
        });

        // Congelar título+encabezados y autofiltro en A2:J2
        ws.views = [{ state: "frozen", ySplit: 2 }];
        ws.autoFilter = { from: "A2", to: "J2" };

        // --- 4) Filas de datos (desde fila 3)
        if (list.length === 0) {
          const r = ws.addRow({ especificacion: "(sin materiales)" });
          r.eachCell((cell) => { cell.border = BORDER_THIN; });
          continue;
        }

        const rank = { rojo: 0, amarillo: 1, verde: 2, azul: 3 };
        list.sort((a, b) => (rank[a.alerta] ?? 9) - (rank[b.alerta] ?? 9) || a.id - b.id);

        for (const m of list) {
          const row = ws.addRow({
            programa: m.programa || "",
            categoria: m.categoria || "",
            especificacion: m.especificacion || "",
            proveedor: m.proveedor || "",
            orden_servicio: m.orden_servicio || "",
            fecha_avanzada: m.fecha_avanzada ? new Date(m.fecha_avanzada) : null,
            fecha_inspeccion: m.fecha_inspeccion ? new Date(m.fecha_inspeccion) : null,
            logistica: m.logistica || "",
            estatus: statusDot(m.alerta), // ⚫ con color
            comentario: m.comentario || "",
          });
          row.eachCell((cell) => { cell.border = BORDER_THIN; });
        }
      }


      const safe = (s) => String(s || "x")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\-]+/g, "_").replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "").slice(0, 50);

      const fname = `pozo_${safe(well.name)}_por_etapas_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const buf = await wb.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      res.send(Buffer.from(buf));
    } catch (e) {
      console.error("export by-well error:", e);
      res.status(500).json({ ok: false, error: e.message || "No se pudo exportar" });
    }
  });

  return router;
}
