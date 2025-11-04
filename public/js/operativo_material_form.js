// public/js/operativo_material_form.js
import { api, qs } from "./operativo_shared.js";

// Compatibilidad: puede venir ?id=123 o ?material=123 (desde Alertas)
const stageId = qs("stage");
const id = qs("id") || qs("material");

// Helpers
const $ = (id) => document.getElementById(id);
const toLowerOrEmpty = (v) => (v == null ? "" : String(v).toLowerCase());
const emptyToNull = (v) => (v === "" ? null : v);

// Botones
const btnSave = $("btnSave");
const btnCancel = $("btnCancel");
if (btnCancel && stageId) {
  btnCancel.href = `./operativo_materiales.html?stage=${stageId}`;
}

// ========= CARGA / HYDRATE =========
async function hydrate() {
  if (!id) return; // modo crear
  const res = await api.get(`/api/operativo/materials/${id}`);
  if (!res.ok) {
    console.error("No se pudo cargar material:", res.error);
    alert(res.error || "No se pudo cargar el material");
    return;
  }
  const m = res.data || {};

  // Selects: usar valores esperados o vacío, no textos decorativos
  const programa = $("programa");
  if (programa) programa.value = toLowerOrEmpty(m.programa) || "";

  $("categoria").value       = m.categoria || "";
  $("especificacion").value  = m.especificacion || "";
  $("cantidad").value        = (m.cantidad ?? 1).toString();
  $("unidad").value          = m.unidad || "";
  $("proveedor").value       = m.proveedor || "";
  $("ordenServicio").value   = m.orden_servicio || "";

  $("fechaAvanzada").value   = m.fecha_avanzada ? String(m.fecha_avanzada).slice(0, 10) : "";
  $("linkAvanzada").value    = m.link_avanzada || "";

  $("fechaInspeccion").value = m.fecha_inspeccion ? String(m.fecha_inspeccion).slice(0, 10) : "";
  $("linkInspeccion").value  = m.link_inspeccion || "";

  $("logistica").value       = m.logistica || "Por Definir";

  const alerta = $("alerta");
  if (alerta) alerta.value = toLowerOrEmpty(m.alerta) || "azul";

  if ($("comentario")) $("comentario").value = m.comentario || "";
}
hydrate();

// ========= GUARDAR =========
btnSave?.addEventListener("click", async () => {
  try {
    btnSave.disabled = true;
    const prev = btnSave.textContent;
    btnSave.textContent = "Guardando…";

    // Normaliza enums -> minúscula; "" -> null
    const _programa = toLowerOrEmpty($("programa")?.value || "");
    const _alerta   = toLowerOrEmpty($("alerta")?.value || "");

    const data = {
      // stage_id solo es relevante al crear
      stage_id: Number(stageId),
      programa: _programa || null, // "" -> null (backend conserva)
      categoria: $("categoria").value.trim(),
      especificacion: $("especificacion").value.trim(),
      cantidad: Number($("cantidad").value || 0),
      unidad: $("unidad").value.trim(),
      proveedor: $("proveedor").value.trim(),
      orden_servicio: $("ordenServicio").value.trim(),
      fecha_avanzada: emptyToNull($("fechaAvanzada").value || ""),
      link_avanzada: $("linkAvanzada").value.trim(),
      fecha_inspeccion: emptyToNull($("fechaInspeccion").value || ""),
      link_inspeccion: $("linkInspeccion").value.trim(),
      logistica: $("logistica").value,
      alerta: _alerta || null,     // "" -> null (backend conserva)
      comentario: emptyToNull($("comentario")?.value || ""), // <-- clave: no sobreescribe con ""
    };

    let res;
    if (id) {
      res = await api.put(`/api/operativo/materials/${id}`, data);
    } else {
      res = await api.post(`/api/operativo/stages/${stageId}/materials`, data);
    }

    if (!res.ok) {
      throw new Error(res.error || "Error al guardar");
    }

    // Volver a la lista de materiales de la etapa
    if (stageId) {
      window.location.href = `./operativo_materiales.html?stage=${stageId}`;
    } else {
      history.back();
    }
  } catch (e) {
    console.error(e);
    alert(e.message || "No se pudo guardar");
  } finally {
    btnSave.textContent = "Guardar";
    btnSave.disabled = false;
  }
});

// ===== Exportar Planeación Operativa a Excel =====
(function attachExportHandler() {
  const btn = document.getElementById("btnExportXlsx");
  if (!btn) return; // si no está en esta vista, no hace nada

  // Toma filtros si existen en la página (no son obligatorios)
  const $ = (id) => document.getElementById(id);
  const fWell  = $("fWell");   // <select> Pozo (opcional)
  const fStage = $("fStage");  // <select> Etapa (opcional)
  const fAlert = $("fAlert");  // <select> Alerta (opcional)

  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      btn.textContent = "Generando…";

      const q = new URLSearchParams();
      if (fWell?.value)  q.set("well",  fWell.value);
      if (fStage?.value) q.set("stage", fStage.value);
      if (fAlert?.value) q.set("alerta", fAlert.value);

      const url = `/api/operativo/planeacion/export${q.toString() ? `?${q.toString()}` : ""}`;
      const resp = await fetch(url, { method: "GET" });

      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try {
          const j = await resp.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const blob = await resp.blob();
      const a = document.createElement("a");
      const href = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0,10);
      a.href = href;
      a.download = `planeacion_operativa_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);

      window.toastOk?.("Excel descargado");
    } catch (e) {
      console.error(e);
      window.toastError?.(e.message || "No se pudo descargar el Excel") || alert(e.message || "No se pudo descargar el Excel");
    } finally {
      btn.disabled = false;
      btn.textContent = "Descargar Excel";
    }
  });
})();
